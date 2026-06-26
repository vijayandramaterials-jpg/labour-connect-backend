const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const db = require("./config/db");

app.use(cors());
app.use(express.json());

// --- Routes इम्पोर्ट करें ---
const paymentRoutes = require("./routes/paymentRoutes");
const notificationRoutes = require("./routes/notificationRoutes"); // 🔴 1. नोटिफिकेशन का रूट इम्पोर्ट किया

// --- Routes को इस्तेमाल (Use) करें ---
app.use("/api/payment", paymentRoutes);
app.use("/api/labours", require("./routes/labourRoutes"));
app.use("/api/notifications", notificationRoutes); // 🔴 2. नोटिफिकेशन का रूट यहाँ जोड़ दिया
app.use("/api/customers", require("./routes/customerRoutes"));

// --- API टेस्टिंग रूट ---
app.get("/", (req, res) => {
  res.send("LabourConnect का बैकएंड सर्वर सफलतापूर्वक काम कर रहा है!");
});

const PORT = process.env.PORT || 5000;

// '0.0.0.0' जोड़ने से सर्वर पूरे वाई-फाई नेटवर्क पर उपलब्ध हो जाएगा
app.listen(PORT, "0.0.0.0", () => {
  console.log(`सर्वर http://0.0.0.0:${PORT} पर चल रहा है`);
});
