const { getMessaging } = require("../config/firebase");

// कॉमन पुश नोटिफिकेशन भेजने का हेल्पर फंक्शन
exports.sendPushNotification = async (
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

  // Urgent होने पर Android/iOS के लिए हाई प्रायॉरिटी सेटिंग्स जोड़ना
  if (isUrgent) {
    message.android = {
      priority: "high",
      notification: {
        sound: "default",
        channelId: "urgent_jobs_channel",
      },
    };
    message.apns = {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
        },
      },
    };
  }

  try {
    const response = await getMessaging().sendEachForMulticast(message);
    console.log("📨 सफलतापूर्वक नोटिफिकेशन भेजे गए:", response.successCount);
    return response;
  } catch (error) {
    console.error("❌ नोटिफिकेशन भेजने में एरर:", error);
  }
};
