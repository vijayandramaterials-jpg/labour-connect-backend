const express = require("express");
const router = express.Router();

// कंट्रोलर को इम्पोर्ट करें (पाथ अपने प्रोजेक्ट के हिसाब से देख लें)
const adminAdController = require("../controllers/adminAdvertisementController");

// रिक्वायरमेंट्स के अनुसार चारों एंडपॉइंट्स को मैप करना

// Create Advertisement
router.post("/", adminAdController.createAdminAdvertisement);

// Get Advertisements
router.get("/", adminAdController.getAdminAdvertisements);

// Update Advertisement
router.put("/:id", adminAdController.updateAdminAdvertisement);

// Delete Advertisement
router.delete("/:id", adminAdController.deleteAdminAdvertisement);

module.exports = router;
