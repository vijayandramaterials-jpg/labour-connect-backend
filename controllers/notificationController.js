const { messaging } = require("../config/firebaseConfig");

exports.sendAd = async (req, res) => {
  try {
    const { title, body, topic } = req.body;

    const message = {
      notification: {
        title: title,
        body: body,
      },
      topic: topic,
    };

    // यहाँ admin.messaging().send की जगह सीधे messaging.send() का इस्तेमाल
    const response = await messaging.send(message);

    res
      .status(200)
      .json({ success: true, message: "विज्ञापन भेज दिया गया!", response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
