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
  searchLabours,
  editLabourProfile,
  addReview,
  getLabourReviews,
  postJobAndNotify,
} = require("../controllers/labourController");

const upload = multer({ storage: multer.memoryStorage() });
const multiUpload = upload.fields([
  { name: "profile_photo", maxCount: 1 },
  { name: "aadhaar_front", maxCount: 1 },
  { name: "aadhaar_back", maxCount: 1 },
]);

router.get("/", getLabours);
router.post("/", multiUpload, addLabour);
router.get("/admin/pending", getPendingLabours);
router.put("/admin/verify/:id", verifyLabour);
router.delete("/:id/reject", rejectLabour);
router.post("/login", labourLogin);
router.get("/search", searchLabours);
router.put("/:id/edit", editLabourProfile);
router.post("/reviews", addReview);
router.get("/:labour_id/reviews", getLabourReviews);
router.post("/jobs/broadcast", postJobAndNotify);

module.exports = router;
