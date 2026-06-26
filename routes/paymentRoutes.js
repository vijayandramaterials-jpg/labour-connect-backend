const express = require("express");
const router = express.Router();

const {
  createOrder,
  savePurchase,
  getUnlockedContacts,
  razorpayWebhook, // 🔴 इसे इम्पोर्ट में जोड़ें
} = require("../controllers/paymentController");

router.post("/create-order", createOrder);
router.post("/save-purchase", savePurchase);
router.get("/unlocked-contacts/:phone", getUnlockedContacts);

// 🔴 Webhook का नया रूट (यहाँ Razorpay डेटा भेजेगा)
router.post("/webhook", razorpayWebhook);

module.exports = router;
