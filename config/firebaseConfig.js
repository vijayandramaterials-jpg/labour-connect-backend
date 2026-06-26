const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

let serviceAccount;

// लॉजिक: अगर हम Render पर हैं तो ENV से डेटा लें, नहीं तो लोकल फाइल इस्तेमाल करें
if (process.env.FIREBASE_KEY) {
  serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
} else {
  serviceAccount = require("./firebase-key.json");
}

// नया तरीका (Modular API)
const app = initializeApp({
  credential: cert(serviceAccount),
});

const messaging = getMessaging(app);

// हम सिर्फ messaging एक्सपोर्ट कर रहे हैं ताकि कोड हल्का रहे
module.exports = { messaging };
