const { getMessaging } = require("../config/firebase");

// 1. कोर हेल्पर फ़ंक्शन (जो jobController.js में बैकएंड टू बैकएंड कॉल होता है)
const sendPushNotification = async (
  tokens,
  title,
  body,
  extraData = {
    type: "ADVERTISEMENT",
  },
  isUrgent = false,
) => {
  if (!tokens || tokens.length === 0) return;

  console.log("========== FCM SEND ==========");
  console.log("Tokens :", tokens.length);
  console.log("Title :", title);
  console.log("Body :", body);
  console.log("Extra :", extraData);

  const message = {
    notification: {
      title,
      body,
      imageUrl: "https://kaampoint.in/logo.png",
    },
    android: {
      priority: "high",
      notification: {
        sound: "default",
        channelId: isUrgent ? "urgent_jobs_channel" : "normal_jobs_channel",
      },
    },
    data: {
      ...extraData,
      urgent: isUrgent ? "true" : "false",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      time: Date.now().toString(),
      screen: "jobs",
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
    console.log("================================");
    console.log("Success :", response.successCount);
    console.log("Failed :", response.failureCount);

    response.responses.forEach((r, i) => {
      if (!r.success) {
        console.log("Invalid Token :", tokens[i]);
        console.log(r.error);
      }
    });

    console.log("================================");
    for (let i = 0; i < response.responses.length; i++) {
      if (!response.responses[i].success) {
        const code = response.responses[i].error.code;

        if (code === "messaging/registration-token-not-registered") {
          await require("../config/db").query(
            `
UPDATE labours
SET fcm_token=NULL
WHERE fcm_token=$1
`,
            [tokens[i]],
          );

          console.log("Dead Token Removed");
        }
      }
    }
    console.log("✅ Success :", response.successCount);

    console.log("❌ Failed :", response.failureCount);
    await require("../config/db").query(
      `
UPDATE jobs
SET notification_sent=$1
WHERE id=$2
`,
      [response.successCount, extraData.job_id],
    );
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
