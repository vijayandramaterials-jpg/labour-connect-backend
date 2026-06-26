const admin = require("../config/firebaseConfig");

exports.sendAd = async (req, res) => {
  try {
    // अब Flutter ऐप हमें टाइटल, मैसेज और टॉपिक (किसे भेजना है) तीनों चीज़ें भेजेगा
    const { title, body, topic } = req.body;

    const message = {
      notification: {
        title: title,
        body: body,
      },
      topic: topic, // 🎯 यहाँ अब 'clients' या 'labours' ऑटोमैटिक सेट हो जाएगा
    };

    const response = await admin.messaging().send(message);

    res
      .status(200)
      .json({ success: true, message: "विज्ञापन भेज दिया गया!", response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
