const express = require("express");
const router = express.Router();
const {
  sendTestNotificationRoute,
} = require("../controllers/notificationController");

// 📍 लाइन नंबर 6: अब यहाँ 'sendTestNotificationRoute' फ़ंक्शन पास किया गया है जो कि एक वैलिड फ़ंक्शन है
router.post("/send-test", sendTestNotificationRoute);

module.exports = router;
