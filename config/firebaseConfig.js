const admin = require("firebase-admin");
const serviceAccount = require("./firebase-key.json"); // आपकी डाउनलोड की हुई चाबी

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
