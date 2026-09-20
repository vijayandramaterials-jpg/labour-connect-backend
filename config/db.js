const { Pool } = require("pg");
require("dotenv").config();

// 1. कनेक्शन पूल कॉन्फ़िगरेशन
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Supabase कनेक्शन के लिए ज़रूरी
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// 2. कनेक्शन कटने पर सर्वर को क्रैश होने से बचाने वाला लिसनर
pool.on("error", (err) => {
  console.error("डेटाबेस पूल एरर (सर्वर सुरक्षित है):", err.message);
});

// 3. कनेक्शन टेस्ट (बिना क्लाइंट को होल्ड किए)
pool
  .query("SELECT 1")
  .then(() => console.log("✅ डेटाबेस सफलतापूर्वक कनेक्ट हो गया है!"))
  .catch((err) => console.error("❌ डेटाबेस कनेक्शन में गलती:", err.message));

module.exports = pool;
