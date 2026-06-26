const admin = require("firebase-admin");

let serviceAccount;

// लॉजिक: अगर हम Render पर हैं तो ENV से डेटा लें, नहीं तो लोकल फाइल इस्तेमाल करें
if (process.env.FIREBASE_KEY) {
  serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
} else {
  serviceAccount = require("./firebase-key.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
