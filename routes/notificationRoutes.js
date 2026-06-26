const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");

// यह वो लिंक (API) है जिसे एडमिन हिट करेगा
router.post("/send-ad", notificationController.sendAd);

module.exports = router;
