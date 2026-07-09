const { getMessaging } = require("../config/firebase");

// 1. कोर हेल्पर फ़ंक्शन (जो jobController.js में बैकएंड टू बैकएंड कॉल होता है)
const sendPushNotification = async (
  tokens,
  title,
  body,
  extraData = {},
  isUrgent = false,
) => {
  if (!tokens || tokens.length === 0) return;

  const message = {
    notification: {
      title: title,
      body: body,
    },
    data: {
      ...extraData,
      urgent: isUrgent ? "true" : "false",
    },
    tokens: tokens,
  };

  if (isUrgent) {
    message.android = {
      priority: "high",
      notification: {
        sound: "default",
        channelId: "urgent_jobs_channel",
      },
    };
    message.apns = {
      headers: { "apns-priority": "10" },
      payload: { aps: { sound: "default" } },
    };
  }

  try {
    const response = await getMessaging().sendEachForMulticast(message);
    console.log(" analytical 📨 नोटिफिकेशन भेजे गए:", response.successCount);
    return response;
  } catch (error) {
    console.error("❌ नोटिफिकेशन भेजने में एरर:", error);
  }
};

// 2. एक्सप्रेस रूट हैंडलर (जो routes/notificationRoutes.js के लिए काम करेगा)
const sendTestNotificationRoute = async (req, res) => {
  try {
    const { tokens, title, body } = req.body;

    if (!tokens || !title || !body) {
      return res
        .status(400)
        .json({ success: false, message: "टोकन, टाइटल और बॉडी ज़रूरी हैं।" });
    }

    await sendPushNotification(tokens, title, body, { type: "TEST" }, false);

    res.status(200).json({
      success: true,
      message: "टेस्ट नोटिफिकेशन प्रोसेस कर दिया गया है!",
    });
  } catch (error) {
    console.error("Route Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// दोनों फ़ंक्शन्स को ऑब्जेक्ट के रूप में एक्सपोर्ट करें
module.exports = {
  sendPushNotification,
  sendTestNotificationRoute,
};
