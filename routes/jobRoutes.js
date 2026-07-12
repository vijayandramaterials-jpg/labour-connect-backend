const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");

// नया विज्ञापन प्रसारित करना
router.post("/broadcast", jobController.createJobAdvertisement);

// लेबर द्वारा रिस्पॉन्स (इंटरेस्टेड/नॉट-इंटरेस्टेड) भेजना
router.post("/respond", jobController.respondToJob);

router.get("/available", jobController.getAvailableJobs);

module.exports = router;
