const db = require("../config/db");
const crypto = require("crypto");
const https = require("https");

// टेबल ऑटो-क्रिएशन लॉजिक ताकि पेमेंट का टाइप और विवरण सेव रह सके
const initPaymentTable = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS phonepe_transactions (
        txn_id VARCHAR(50) PRIMARY KEY,
        customer_phone VARCHAR(20),
        type VARCHAR(20),
        target_id VARCHAR(50),
        amount INT,
        job_metadata JSONB,
        status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error("Error initializing PhonePe table:", err);
  }
};
initPaymentTable();

// 1. PhonePe पेमेंट लिंक जनरेट करने का फंक्शन
const createOrder = async (req, res) => {
  try {
    const { amount, customer_phone, type, target_id, job_metadata } = req.body;

    if (!amount || !customer_phone || !type) {
      return res
        .status(400)
        .json({ success: false, message: "अनिवार्य डेटा गायब है!" });
    }

    const merchantTransactionId = "TXN" + Date.now();
    const serverPort = process.env.PORT || 5000;

    // PhonePe पे-लोड डिक्शनरी
    const payload = {
      merchantId: process.env.PHONEPE_MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: "MUID" + customer_phone,
      amount: amount, // पैसे में (₹29 = 2900, ₹49 = 4900)
      redirectUrl: `https://labour-connect-backend-p25h.onrender.com/api/payment/phonepe-callback`,
      redirectMode: "POST",
      callbackUrl: `https://labour-connect-backend-p25h.onrender.com/api/payment/phonepe-callback`,
      mobileNumber: customer_phone,
      paymentInstrument: { type: "PAY_PAGE" },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
      "base64",
    );

    // SHA256 हैश (X-VERIFY Header) जेनरेट करना
    const stringToHash =
      base64Payload + "/pg/v1/pay" + process.env.PHONEPE_SALT_KEY;
    const sha256 = crypto
      .createHash("sha256")
      .update(stringToHash)
      .digest("hex");
    const xVerify = sha256 + "###" + process.env.PHONEPE_SALT_INDEX;

    const postData = JSON.stringify({ request: base64Payload });

    // टेस्ट मोड (UAT) या लाइव URL का चयन
    const host =
      process.env.PHONEPE_ENV === "UAT"
        ? "api-uat.phonepe.com"
        : "api.phonepe.com";
    const path = "/apis/hermes/pg/v1/pay";

    const options = {
      hostname: host,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": xVerify,
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    // टेम्परेरी ट्रांजैक्शन को डेटाबेस में ट्रैक करना
    await db.query(
      "INSERT INTO phonepe_transactions (txn_id, customer_phone, type, target_id, amount, job_metadata) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        merchantTransactionId,
        customer_phone,
        type,
        target_id || null,
        amount,
        job_metadata ? JSON.stringify(job_metadata) : null,
      ],
    );

    // नेटिव HTTPS आउटगोइंग रिक्वेस्ट कॉल
    const request = https.request(options, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        try {
          const resData = JSON.parse(body);
          if (
            resData.success &&
            resData.data &&
            resData.data.instrumentResponse
          ) {
            res.status(200).json({
              success: true,
              url: resData.data.instrumentResponse.redirectUrl,
            });
          } else {
            res.status(500).json({
              success: false,
              message: "PhonePe गेटवे से लिंक नहीं मिल पाया।",
            });
          }
        } catch (e) {
          res.status(500).json({ success: false, message: "पार्सिंग एरर" });
        }
      });
    });

    request.on("error", (error) => {
      console.error("PhonePe https error:", error);
      res
        .status(500)
        .json({ success: false, message: "PhonePe API कनेक्शन फेल" });
    });

    request.write(postData);
    request.end();
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ success: false, message: "सर्वर एरer" });
  }
};

// 2. पेमेंट वेरिफिकेशन, लॉक खोलना और विज्ञापन ब्रॉडकास्ट लॉजिक (Callback)
const phonepeCallback = async (req, res) => {
  try {
    // PhonePe फ़ॉर्म-डेटा या JSON दोनों रूपों में रिस्पॉन्स भेज सकता है
    const { merchantId, transactionId, code } = req.body;

    if (code === "PAYMENT_SUCCESS") {
      // डेटाबेस से ट्रांजैक्शन की इनफार्मेशन निकालें
      const txCheck = await db.query(
        "SELECT * FROM phonepe_transactions WHERE txn_id = $1",
        [transactionId],
      );

      if (txCheck.rows.length > 0 && txCheck.rows[0].status === "PENDING") {
        const txn = txCheck.rows[0];

        // स्थिति को तुरंत SUCCESS में अपडेट करें ताकि डुप्लीकेट रिक्वेस्ट न चले
        await db.query(
          "UPDATE phonepe_transactions SET status = 'SUCCESS' WHERE txn_id = $1",
          [transactionId],
        );

        // 🔥 केस A: अगर पेमेंट कारीगर का नंबर अनलॉक (UNLOCK) करने के लिए था
        if (txn.type === "UNLOCK") {
          const formattedLabourId = parseInt(txn.target_id, 10);
          const expiresAt = new Date();
          expiresAt.setHours(23, 59, 59, 999);

          await db.query(
            "INSERT INTO purchased_contacts (customer_phone, labour_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            [txn.customer_phone, formattedLabourId, expiresAt],
          );
          console.log(
            `[PhonePe Success] Number unlocked for phone ${txn.customer_phone}`,
          );
        }

        // 🔥 केस B: अगर पेमेंट काम का विज्ञापन (ADVERTISEMENT) पोस्ट करने के लिए था
        else if (txn.type === "ADVERTISEMENT" && txn.job_metadata) {
          const job = txn.job_metadata;
          const serverPort = process.env.PORT || 5000;

          // बिना किसी तुक्के के आपके बैकएंड के अपने खुद के विज्ञापन ब्रॉडकास्ट API को इंटरनली कॉल करना
          const internalPostData = JSON.stringify({
            customer_phone: txn.customer_phone,
            skill_needed: job.skill_needed,
            area: job.area,
            city: job.city,
            description: job.description,
          });

          const internalOptions = {
            hostname: "127.0.0.1",
            port: serverPort,
            path: "/api/labours/jobs/broadcast",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(internalPostData),
            },
          };

          const internalReq = https.request(internalOptions, (internalRes) => {
            console.log(
              `[PhonePe AD Broadcast] Internal status received: ${internalRes.statusCode}`,
            );
          });
          internalReq.on("error", (err) =>
            console.error("Internal broadcast trigger failed:", err),
          );
          internalReq.write(internalPostData);
          internalReq.end();
        }
      }

      // यूजर को ब्राउज़र स्क्रीन पर एक सुंदर सक्सेस मैसेज दिखाएं
      return res.send(`
        <html>
          <body style="font-family:sans-serif; text-align:center; padding-top:50px; background:#f4f9f4;">
            <div style="background:white; padding:30px; border-radius:8px; display:inline-block; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h1 style="color:#2ecc71;">भुगतान सफल! 🎉</h1>
              <p style="font-size:16px; color:#555;">आपका ट्रांजैक्शन सफलतापूर्वक पूरा हो गया है।</p>
              <p style="font-weight:bold; color:#333;">कृपया इस ब्राउज़र को बंद करें और ऐप पर वापस जाएं।</p>
            </div>
          </body>
        </html>
      `);
    } else {
      return res.send(`
        <html>
          <body style="font-family:sans-serif; text-align:center; padding-top:50px; background:#f9f4f4;">
            <div style="background:white; padding:30px; border-radius:8px; display:inline-block; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h1 style="color:#e74c3c;">भुगतान विफल! ❌</h1>
              <p style="font-size:16px; color:#555;">आपका भुगतान पूरा नहीं हो सका या रद्द कर दिया गया है।</p>
              <p style="font-weight:bold; color:#333;">कृपया ऐप में जाकर दोबारा प्रयास करें।</p>
            </div>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error("PhonePe Callback Handling Error:", error);
    res.status(500).send("Internal Server Error");
  }
};

// 3. ऐप लोड होने पर एक्टिवेशन स्टेटस चेक करने का ओरिजिनल लॉजिक (Unchanged)
const getUnlockedContacts = async (req, res) => {
  const phone = req.params.phone;
  try {
    const result = await db.query(
      "SELECT labour_id FROM purchased_contacts WHERE customer_phone = $1 AND expires_at > NOW()",
      [phone],
    );
    const unlockedIds = result.rows.map((row) => row.labour_id.toString());
    res.status(200).json({ success: true, unlocked_labours: unlockedIds });
  } catch (error) {
    console.error("Get Unlocked Contacts Error:", error);
    res
      .status(500)
      .json({ success: false, message: "अनलॉक डेटा लाने में समस्या हुई।" });
  }
};

// 4. मैन्युअल एंट्री बैकअप (Unchanged)
const savePurchase = async (req, res) => {
  const { customer_phone, labour_id } = req.body;
  if (!customer_phone || !labour_id) {
    return res.status(400).json({ success: false, message: "डेटा गायब है!" });
  }
  try {
    const formattedLabourId = parseInt(labour_id, 10);
    const formattedCustomerPhone = customer_phone.toString();
    const expiresAt = new Date();
    expiresAt.setHours(23, 59, 59, 999);

    await db.query(
      "INSERT INTO purchased_contacts (customer_phone, labour_id, expires_at) VALUES ($1, $2, $3)",
      [formattedCustomerPhone, formattedLabourId, expiresAt],
    );
    res.json({ success: true, message: "खरीदी सफलतापूर्वक सेव हो गई!" });
  } catch (error) {
    console.error("Database Save Purchase Error Details:", error);
    res.status(500).json({
      success: false,
      message: "डेटाबेस में सेव करने में समस्या हुई।",
    });
  }
};

module.exports = {
  createOrder,
  getUnlockedContacts,
  phonepeCallback,
  savePurchase,
};
