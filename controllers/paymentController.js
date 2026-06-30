const Razorpay = require("razorpay");
const db = require("../config/db");
const crypto = require("crypto");

// Razorpay को शुरू करना (सुनिश्चित करें कि ये चाबियाँ Render डैशबोर्ड में मौजूद हों)
const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// 1. Order ID बनाने का फंक्शन (संशोधित - अब यह डायनामिक है)
const createOrder = async (req, res) => {
  try {
    // फ्रंटएंड से अमाउंट लें, अगर नहीं मिले तो डिफॉल्ट 2900 (₹29) रखें
    const reqAmount = req.body.amount || 2900;

    const options = {
      amount: reqAmount,
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
    console.error("Razorpay Order Creation Error:", error);
    res
      .status(500)
      .json({ success: false, message: "रेज़रपे ऑर्डर बनाने में सर्वर एरर!" });
  }
};

// 2. पेमेंट सक्सेस होने के बाद डेटाबेस में सेव करना (डाटा टाइप फिक्स के साथ)
const savePurchase = async (req, res) => {
  const { customer_phone, labour_id } = req.body;

  // सुरक्षा जांच: अगर डेटा गायब है
  if (!customer_phone || !labour_id) {
    return res.status(400).json({ success: false, message: "डेटा गायब है!" });
  }

  try {
    // 🔴 सुधार: labour_id को String से Integer (नंबर) में बदलें ताकि Supabase में एरर न आए
    const formattedLabourId = parseInt(labour_id, 10);
    const formattedCustomerPhone = customer_phone.toString();

    // आज रात 11:59:59 PM का समय निकालना
    const expiresAt = new Date();
    expiresAt.setHours(23, 59, 59, 999);

    // डेटाबेस में सेव करना
    await db.query(
      "INSERT INTO purchased_contacts (customer_phone, labour_id, expires_at) VALUES ($1, $2, $3)",
      [formattedCustomerPhone, formattedLabourId, expiresAt],
    );

    res.json({ success: true, message: "खरीदी सफलतापूर्वक सेव हो गई!" });
  } catch (error) {
    // 🔴 यह लॉग आपको Render की logs में असली गड़बड़ दिखाएगा
    console.error("Database Save Purchase Error Details:", error);
    res.status(500).json({
      success: false,
      message: "डेटाबेस में सेव करने में समस्या हुई।",
      error_details: error.message, // टेस्टिंग के लिए एरर मैसेज भेजा है
    });
  }
};

// 3. ऐप लोड होने पर चेक करना कि कौन से नंबर अभी भी अनलॉक हैं
const getUnlockedContacts = async (req, res) => {
  const phone = req.params.phone;
  try {
    const result = await db.query(
      "SELECT labour_id FROM purchased_contacts WHERE customer_phone = $1 AND expires_at > NOW()",
      [phone],
    );

    // सिर्फ IDs का एक Array बना लें
    const unlockedIds = result.rows.map((row) => row.labour_id.toString()); // फ्रंटएंड के लिए स्ट्रिंग में बदल दिया

    res.status(200).json({ success: true, unlocked_labours: unlockedIds });
  } catch (error) {
    console.error("Get Unlocked Contacts Error:", error);
    res
      .status(500)
      .json({ success: false, message: "अनलॉक डेटा लाने में समस्या हुई।" });
  }
};

// 4. Razorpay Webhook
const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const shasum = crypto.createHmac("sha256", secret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest("hex");

    if (digest === signature) {
      console.log("✅ Webhook Verified!");
      const event = req.body.event;

      if (event === "payment.captured") {
        const paymentData = req.body.payload.payment.entity;
        console.log("Payment Details:", paymentData.id, paymentData.amount);
      }

      res.status(200).json({ status: "ok" });
    } else {
      console.error("❌ Webhook Error: Invalid Signature");
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
