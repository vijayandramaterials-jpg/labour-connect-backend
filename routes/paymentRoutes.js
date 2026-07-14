const express = require("express");
const router = express.Router();

const {
  createOrder,
  getUnlockedContacts,
  phonepeCallback,
  savePurchase,
  unlockWithCredit, // ✅ ऊपर यहाँ जोड़ दिया
} = require("../controllers/paymentController");

// फ्रंटएंड से पेमेंट रिक्वेस्ट के लिए
router.post("/create-order", createOrder);

// ऐप लोड होने पर अनलॉक कॉन्टैक्ट्स चेक करने के लिए
router.get("/unlocked-contacts/:phone", getUnlockedContacts);

// बैकएंड मैन्युअल एंट्री बैकअप के लिए (यदि आवश्यक हो)
router.post("/save-purchase", savePurchase);

// PhonePe पेमेंट पूरा होने के बाद इस रूट पर रिस्पॉन्स भेजेगा
router.post("/phonepe-callback", phonepeCallback);

// क्रेडिट से कांटेक्ट अनलॉक करने का रूट
router.post("/unlock-with-credit", unlockWithCredit); // ✅ नीचे से paymentController. हटा दिया

module.exports = router;
