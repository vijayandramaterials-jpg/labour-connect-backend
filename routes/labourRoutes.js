const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  getLabours,
  addLabour,
  getPendingLabours,
  verifyLabour,
  rejectLabour,
  labourLogin,
} = require("../controllers/labourController");

// Multer in-memory configuration
const upload = multer({ storage: multer.memoryStorage() });
const multiUpload = upload.fields([
  { name: "profile_photo", maxCount: 1 },
  { name: "aadhaar_front", maxCount: 1 },
  { name: "aadhaar_back", maxCount: 1 },
]);

// Regular Routes
router.get("/", getLabours); // App pe sirf active log dikhenge
router.post("/", multiUpload, addLabour); // Photo ke sath registration

// Admin Verification Routes
router.get("/pending", getPendingLabours); // Pending list dekhne ke liye
router.patch("/:id/verify", verifyLabour); // ID ke sath active karne ke liye
router.delete("/:id/reject", rejectLabour);

router.post("/login", labourLogin);

module.exports = router;
