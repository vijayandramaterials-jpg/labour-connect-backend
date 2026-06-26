const Razorpay = require("razorpay");
const db = require("../config/db"); // 🔴 यहाँ हमने सही रास्ता डाल दिया है
const crypto = require("crypto");

// Razorpay को आपकी चाबियों (Keys) के साथ शुरू करना
const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// 1. Order ID बनाने का फंक्शन
const createOrder = async (req, res) => {
  try {
    const options = {
      amount: 2900, // ₹29 (पैसे में: 29 * 100)
      currency: "INR",
      receipt: "receipt_order_" + Date.now(),
    };

    const order = await instance.orders.create(options);

    if (!order) return res.status(500).send("ऑर्डर बनाने में समस्या हुई!");

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Payment Error:", error);
    res.status(500).json({ success: false, message: "सर्वर एरर!" });
  }
};

// 2. पेमेंट सक्सेस होने के बाद डेटाबेस में सेव करना (यह आपका पहले वाला ही कोड है)
const savePurchase = async (req, res) => {
  const { customer_phone, labour_id } = req.body;

  try {
    // आज रात 11:59:59 PM का समय निकालना
    const expiresAt = new Date();
    expiresAt.setHours(23, 59, 59, 999);

    // डेटाबेस में सेव करना
    await db.query(
      "INSERT INTO purchased_contacts (customer_phone, labour_id, expires_at) VALUES ($1, $2, $3)",
      [customer_phone, labour_id, expiresAt],
    );

    res.json({ success: true, message: "खरीदी सफलतापूर्वक सेव हो गई!" });
  } catch (error) {
    console.error("Save Purchase Error:", error);
    res.status(500).json({
      success: false,
      message: "डेटाबेस में सेव करने में समस्या हुई。",
    });
  }
};

// 🔴 यहाँ से नया कोड जोड़ें (savePurchase के ठीक नीचे)
// 3. ऐप लोड होने पर चेक करना कि कौन से नंबर अभी भी अनलॉक हैं
const getUnlockedContacts = async (req, res) => {
  const phone = req.params.phone;
  try {
    // डेटाबेस से वो labour_id निकालें जिनका समय अभी रात 12 बजे के पार नहीं हुआ है
    const result = await db.query(
      "SELECT labour_id FROM purchased_contacts WHERE customer_phone = $1 AND expires_at > NOW()",
      [phone],
    );

    // सिर्फ IDs का एक Array बना लें
    const unlockedIds = result.rows.map((row) => row.labour_id);

    res.status(200).json({ success: true, unlocked_labours: unlockedIds });
  } catch (error) {
    console.error("Get Unlocked Contacts Error:", error);
    res
      .status(500)
      .json({ success: false, message: "अनलॉक डेटा लाने में समस्या हुई।" });
  }
};

// 4. Razorpay Webhook (पेमेंट को सर्वर-टू-सर्वर वेरीफाई करने के लिए)
const razorpayWebhook = async (req, res) => {
  try {
    // 1. Razorpay से आया हुआ सिग्नेचर निकालें
    const signature = req.headers["x-razorpay-signature"];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // 2. अपने सीक्रेट का इस्तेमाल करके खुद का सिग्नेचर बनाएं
    const shasum = crypto.createHmac("sha256", secret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest("hex");

    // 3. दोनों सिग्नेचर को मैच करें (सिक्योरिटी चेक)
    if (digest === signature) {
      console.log("✅ Webhook Verified: पेमेंट सुरक्षित रूप से सफल हुआ!");

      const event = req.body.event;

      // अगर पेमेंट कैप्चर (सक्सेस) हो गया है
      if (event === "payment.captured") {
        const paymentData = req.body.payload.payment.entity;
        console.log("Payment Details:", paymentData.id, paymentData.amount);

        // 🔴 भविष्य में: आप यहाँ से भी डेटाबेस (purchased_contacts) में सेव करने का लॉजिक चला सकते हैं
      }

      // Razorpay को 200 OK भेजना ज़रूरी है, वरना वह बार-बार मैसेज भेजता रहेगा
      res.status(200).json({ status: "ok" });
    } else {
      console.error("❌ Webhook Error: नकली पेमेंट सिग्नेचर!");
      res.status(400).json({ status: "error", message: "Invalid Signature" });
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};

module.exports = {
  createOrder,
  savePurchase,
  getUnlockedContacts,
  razorpayWebhook,
};
