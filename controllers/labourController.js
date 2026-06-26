const db = require("../config/db");
const { createClient } = require("@supabase/supabase-js");

// Supabase client initialize karein storage ke liye
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

// Supabase Storage mein file upload karne ka helper function
const uploadToSupabase = async (file, folderName) => {
  if (!file) return null;
  const fileName = `${folderName}/${Date.now()}_${file.originalname}`;

  const { data, error } = await supabase.storage
    .from("labour_uploads")
    .upload(fileName, file.buffer, { contentType: file.mimetype });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from("labour_uploads")
    .getPublicUrl(fileName);
  return publicUrlData.publicUrl;
};

// 1. Naya Kariagar Register Karna (With Duplicate Check & Verification Pending)
const addLabour = async (req, res) => {
  const { name, phone, skill, daily_wage, location, aadhaar_number } = req.body;

  try {
    // [DUPLICATE CHECK LOGIC] - Kya phone ya aadhaar pehle se hai?
    const duplicateCheck = await db.query(
      "SELECT * FROM labours WHERE phone = $1 OR aadhaar_number = $2",
      [phone, aadhaar_number],
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "यह मोबाइल नंबर या आधार नंबर पहले से रजिस्टर्ड है!",
      });
    }

    // Files ko read karna (Multer ke zariye)
    const profileFile = req.files["profile_photo"]
      ? req.files["profile_photo"][0]
      : null;
    const frontFile = req.files["aadhaar_front"]
      ? req.files["aadhaar_front"][0]
      : null;
    const backFile = req.files["aadhaar_back"]
      ? req.files["aadhaar_back"][0]
      : null;

    // Supabase Storage mein teeno photos upload karna
    const profilePhotoUrl = await uploadToSupabase(profileFile, "profiles");
    const aadhaarFrontUrl = await uploadToSupabase(frontFile, "aadhaar_front");
    const aadhaarBackUrl = await uploadToSupabase(backFile, "aadhaar_back");

    // Database mein data dalna (is_verified default false rahega)
    const query = `
            INSERT INTO labours (name, phone, skill, daily_wage, location, aadhaar_number, profile_photo_url, aadhaar_front_url, aadhaar_back_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;
        `;
    const values = [
      name,
      phone,
      skill,
      daily_wage,
      location,
      aadhaar_number,
      profilePhotoUrl,
      aadhaarFrontUrl,
      aadhaarBackUrl,
    ];
    const result = await db.query(query, values);

    res.status(201).json({
      success: true,
      message:
        "कारीगर का रजिस्ट्रेशन हो गया है! वेरिफिकेशन के बाद एक्टिव होगा।",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error in registration:", error);
    res.status(500).json({ success: false, message: "सर्वर में खराबी है।" });
  }
};

// 2. Sirf Verified (Active) Kariagaron ko App par dikhana
const getLabours = async (req, res) => {
  try {
    // URL से सर्च (नाम/लोकेशन) और स्किल लेना
    const { search, skill } = req.query;

    // हमारी बेसिक Query
    let query = "SELECT * FROM labours WHERE is_verified = true";
    const values = [];
    let valueIndex = 1;

    // अगर यूज़र ने कुछ सर्च किया है (नाम या लोकेशन)
    if (search) {
      // ILIKE का मतलब है कि यह छोटे-बड़े (capital/small) अक्षरों का ध्यान रखे बिना सर्च करेगा
      query += ` AND (name ILIKE $${valueIndex} OR location ILIKE $${valueIndex})`;
      values.push(`%${search}%`); // % लगाने से यह शब्द के आगे-पीछे भी ढूँढेगा
      valueIndex++;
    }

    // अगर यूज़र ने कोई विशेष स्किल (जैसे प्लंबर) चुनी है
    if (skill && skill !== "All" && skill !== "सभी") {
      query += ` AND skill = $${valueIndex}`;
      values.push(skill);
      valueIndex++;
    }

    // सबसे नए कारीगर सबसे ऊपर दिखेंगे
    query += " ORDER BY created_at DESC";

    const result = await db.query(query, values);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Fetch Labours Error:", error);
    res
      .status(500)
      .json({ success: false, message: "डेटा लाने में समस्या हुई।" });
  }
};

// 3. [VERIFICATION CHECK OPTION] - Admin ke liye pending list dekhna
const getPendingLabours = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM labours WHERE is_verified = false ORDER BY created_at DESC",
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "डेटा लाने में समस्या हुई।" });
  }
};

// 4. [APPROVE LOGIC] - Kariagar ko verify (Active) karna
const verifyLabour = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("UPDATE labours SET is_verified = true WHERE id = $1", [id]);
    res.json({
      success: true,
      message: "कारीगर सफलतापूर्वक वेरीफाई (Active) हो गया है!",
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "वेरीफाई करने में समस्या हुई।" });
  }
};

// 5. [REJECT LOGIC] - नकली या गलत फॉर्म को डिलीट करना
const rejectLabour = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body; // एडमिन जो कारण टाइप करेगा

    // कारीगर को डिलीट करने के बजाय उसका status 'rejected' कर दें और कारण सेव कर दें
    const result = await db.query(
      "UPDATE labours SET status = 'rejected', reject_reason = $1 WHERE id = $2 RETURNING *",
      [reason, id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "कारीगर नहीं मिला!" });
    }

    res
      .status(200)
      .json({ success: true, message: "कारीगर रिजेक्ट कर दिया गया है।" });
  } catch (error) {
    console.error("Reject Error:", error);
    res.status(500).json({ success: false, message: "सर्वर एरर" });
  }
};

// 6. [LABOUR LOGIN] - कारीगर का लॉगिन और स्टेटस चेक करना
const labourLogin = async (req, res) => {
  const { phone } = req.body;
  try {
    // 🔴 नया लॉजिक: कारीगर का डेटा लाएं और purchased_contacts टेबल से गिनें कि यह ID कितनी बार अनलॉक हुई है
    const query = `
      SELECT 
        l.*, 
        (SELECT COUNT(*) FROM purchased_contacts pc WHERE pc.labour_id::text = l.id::text) AS unlock_count
      FROM labours l 
      WHERE l.phone = $1
    `;

    const result = await db.query(query, [phone]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "यह नंबर रजिस्टर्ड नहीं है। कृपया पहले नया अकाउंट बनाएं।",
      });
    }

    res.status(200).json({
      success: true,
      message: "लॉगिन सफल!",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Labour Login Error:", error);
    res.status(500).json({ success: false, message: "सर्वर एरर।" });
  }
};

const searchLabours = async (req, res) => {
  try {
    const { query: searchQuery } = req.query; // ग्राहक जो शहर/एरिया सर्च करेगा

    // अगर ग्राहक ने कुछ नहीं लिखा है, तो सारे वेरीफाइड कारीगर दिखा दो
    if (!searchQuery) {
      const result = await db.query(
        "SELECT * FROM labours WHERE status = 'verified'",
      );
      return res.status(200).json({ success: true, data: result.rows });
    }

    // अगर सर्च में कुछ लिखा है, तो 'address' कॉलम में उसे ढूँढो (ILIKE का इस्तेमाल करके)
    const result = await db.query(
      "SELECT * FROM labours WHERE status = 'verified' AND address ILIKE $1",
      [`%${searchQuery}%`],
    );

    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Search Error:", error);
    res.status(500).json({ success: false, message: "सर्वर एरर" });
  }
};

// सबसे नीचे वाले module.exports को बदलकर उसमें rejectLabour भी जोड़ दें:
module.exports = {
  addLabour,
  getLabours,
  getPendingLabours,
  verifyLabour,
  rejectLabour,
  labourLogin,
  searchLabours,
};
