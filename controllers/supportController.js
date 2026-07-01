const db = require("../config/db");
const admin = require("firebase-admin"); // सुनिश्चित करें कि firebase-admin बैकएंड में कॉन्फिगर हो

// 1. ग्राहक या कारीगर द्वारा शिकायत दर्ज करना
const createTicket = async (req, res) => {
  try {
    const { user_phone, user_role, message, screenshot_url } = req.body;

    if (!user_phone || !user_role || !message) {
      return res
        .status(400)
        .json({ success: false, message: "अनिवार्य डेटा गायब है!" });
    }

    // डेटाबेस में सेव करना
    const result = await db.query(
      "INSERT INTO support_tickets (user_phone, user_role, message, screenshot_url) VALUES ($1, $2, $3, $4) RETURNING *",
      [user_phone, user_role, message, screenshot_url || null],
    );

    // 🔥 एडमिन (आपके मोबाइल) को तुरंत पुश नोटिफिकेशन ट्रिगर करना
    const payload = {
      notification: {
        title: `⚠️ नई हेल्पलाइन शिकायत (${user_role})`,
        body: `नंबर: ${user_phone} ने शिकायत की है: "${message.substring(0, 40)}..."`,
      },
      topic: "admin_alerts", // एडमिन इस टॉपिक को सब्सक्राइब करके रखेगा
    };

    try {
      await admin.messaging().send(payload);
      console.log("Admin notification sent successfully!");
    } catch (fcmErr) {
      console.error("FCM Admin Alert Error:", fcmErr);
    }

    res.status(201).json({
      success: true,
      message: "आपकी शिकायत दर्ज कर ली गई है, जल्द ही समाधान किया जाएगा।",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create Ticket Error:", error);
    res.status(500).json({ success: false, message: "सर्वर इंटरनल एरर" });
  }
};

// 2. एडमिन पैनल के लिए सभी टिकट्स की लिस्ट लाना
const getAllTickets = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM support_tickets ORDER BY created_at DESC",
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get Tickets Error:", error);
    res
      .status(500)
      .json({ success: false, message: "डेटा लाने में समस्या हुई।" });
  }
};

module.exports = {
  createTicket,
  getAllTickets,
};
