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
const adminAdvertisementRoutes = require("./routes/adminAdvertisementRoutes");

// --- Routes को इस्तेमाल (Use) करें ---
app.use("/api/payment", paymentRoutes);
app.use("/api/labours", require("./routes/labourRoutes"));
app.use("/api/jobs", require("./routes/jobRoutes"));
app.use("/api/notifications", notificationRoutes); // 🔴 2. नोटिफिकेशन का रूट यहाँ जोड़ दिया
app.use("/api/admin-advertisements", adminAdvertisementRoutes); // 🔴 3. एडमिन विज्ञापन का रूट यहाँ जोड़ दिया
app.use("/api/customers", require("./routes/customerRoutes"));
app.use("/api/support", require("./routes/supportRoutes"));

// ==========================================
// --- PHONEPE COMPLIANCE ROUTES (POLICIES) ---
// ==========================================

const commonStyle = `
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; color: #333; background: #f9f9f9; }
    .container { max-width: 800px; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: auto; }
    h1 { color: #0056b3; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 20px; }
    p { margin-bottom: 15px; text-align: justify; }
    .footer { margin-top: 30px; font-size: 12px; color: #777; text-align: center; }
  </style>
`;

// 1. Terms & Conditions Route
app.get("/terms-and-conditions", (req, res) => {
  res.send(`
    <html>
      <head><title>Terms & Conditions - Labour Connect</title>${commonStyle}</head>
      <body>
        <div class="container">
          <h1>Terms and Conditions</h1>
          <p><strong>Effective Date: July 1, 2026</strong></p>
          <p>Welcome to Labour Connect. By accessing or using our mobile application, you agree to be bound by these Terms and Conditions.</p>
          <h2>1. Platform Services</h2>
          <p>Labour Connect is an information matchmaking platform that connects independent service providers (labourers) with potential clients. We do not directly employ, manage, or verify the complete background of the labourers listed.</p>
          <h2>2. Payments & Premium Features</h2>
          <p>Users are required to pay a fee of ₹29 to unlock specific labour contact numbers and ₹49 to post/broadcast commercial job advertisements. These charges are for the platform infrastructure use only.</p>
          <h2>3. Liability Disclaimer</h2>
          <p>Labour Connect is not responsible for the quality of work, financial transactions, disputes, behavior, safety, or legal violations caused by any user or worker found via the platform. Users are advised to verify credentials independently before hiring.</p>
          <div class="footer">&copy; 2026 Labour Connect. All Rights Reserved.</div>
        </div>
      </body>
    </html>
  `);
});

// 2. Privacy Policy Route
app.get("/privacy-policy", (req, res) => {
  res.send(`
    <html>
      <head><title>Privacy Policy - Labour Connect</title>${commonStyle}</head>
      <body>
        <div class="container">
          <h1>Privacy Policy</h1>
          <p><strong>Effective Date: July 1, 2026</strong></p>
          <p>At Labour Connect, we value and respect your privacy. This document outlines how we handle user data.</p>
          <h2>1. Data Collection</h2>
          <p>We collect essential information required to run the platform efficiently, including user phone numbers, profile images, and precise GPS location coordinates to fetch nearby workforce listings.</p>
          <h2>2. Use of Information</h2>
          <p>Location data is strictly processed to narrow down regional filters (e.g., Indore, Vijay Nagar). Worker phone numbers are safely encrypted and are only exposed to paid clients upon authentication and completion of checkout transaction workflows.</p>
          <h2>3. Data Protection</h2>
          <p>We utilize secure server infrastructures and do not share, lease, or sell database assets containing personal data records with external monetization networks.</p>
          <div class="footer">&copy; 2026 Labour Connect. All Rights Reserved.</div>
        </div>
      </body>
    </html>
  `);
});

// 3. Refund Policy Route
app.get("/refund-policy", (req, res) => {
  res.send(`
    <html>
      <head><title>Refund Policy - Labour Connect</title>${commonStyle}</head>
      <body>
        <div class="container">
          <h1>Refund and Cancellation Policy</h1>
          <p><strong>Effective Date: July 1, 2026</strong></p>
          <h2>1. Digital Goods Clause</h2>
          <p>Due to the nature of intangible digital services delivered via Labour Connect (instant unlocking of restricted database access records or programmatic broadcasting of job push notifications), <strong>all financial processing tasks executed on this platform operate under a strict Non-Refundable workflow</strong>.</p>
          <h2>2. Failed Processing Recovery</h2>
          <p>If a technical error or database timeout prevents a service unlock or broadcast deployment despite a successful bank statement deduction, our backend auditing hooks will initiate an automatic settlement loop to reverse the transaction. In such scenarios, funds will reflect inside your original payment account vector within 5-7 standard operational banking days.</p>
          <div class="footer">&copy; 2026 Labour Connect. All Rights Reserved.</div>
        </div>
      </body>
    </html>
  `);
});

// 4. Shipping Policy Route
app.get("/shipping-policy", (req, res) => {
  res.send(`
    <html>
      <head><title>Shipping & Delivery Policy - Labour Connect</title>${commonStyle}</head>
      <body>
        <div class="container">
          <h1>Shipping and Delivery Policy</h1>
          <p><strong>Effective Date: July 1, 2026</strong></p>
          <h2>1. Digital Fulfilment Only</h2>
          <p>Labour Connect deals exclusively in standard electronic and cloud-hosted operations. We do not sell, dispatch, pack, or move physical commodities of any kind.</p>
          <h2>2. Instant Allocation</h2>
          <p>All service assets, unlocks, administrative parameters, or promotion packages acquired by spending balance triggers on the gateway are provisioned via asynchronous backend API queries instantly upon receiving validation flags from webhooks. No transit windows or shipping delays are associated with our delivery processes.</p>
          <div class="footer">&copy; 2026 Labour Connect. All Rights Reserved.</div>
        </div>
      </body>
    </html>
  `);
});

// --- API टेस्टिंग रूट ---
app.get("/", (req, res) => {
  res.send("LabourConnect का बैकएंड सर्वर सफलतापूर्वक काम कर रहा है!");
});

const { checkAndExpandRadius } = require("./controllers/jobController");
setInterval(
  () => {
    checkAndExpandRadius();
  },
  5 * 60 * 1000,
);

const PORT = process.env.PORT || 5000;

// '0.0.0.0' जोड़ने से सर्वर पूरे वाई-फाई नेटवर्क पर उपलब्ध हो जाएगा
app.listen(PORT, "0.0.0.0", () => {
  console.log(`सर्वर http://0.0.0.0:${PORT} पर चल रहा है`);
});
