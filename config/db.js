const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool
  .connect()
  .then(() => console.log("✅ डेटाबेस सफलतापूर्वक कनेक्ट हो गया है!"))
  .catch((err) => console.error("❌ डेटाबेस कनेक्शन में गलती:", err.message));

module.exports = pool;
