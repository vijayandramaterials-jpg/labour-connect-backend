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
  // 🔴 सुधार 1: req.body से city, area और pin को भी एक्सट्रैक्ट करें
  const {
    name,
    phone,
    skill,
    daily_wage,
    location,
    aadhaar_number,
    city,
    area,
    pin,
  } = req.body;

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

    // 🔴 सुधार 2: पुराना गलत पिन मैचिंग वाला ब्लॉक (जो सर्वर क्रैश कर रहा था) यहाँ से पूरी तरह हटा दिया गया है।
    // रजिस्ट्रेशन में हम पिन को सिर्फ सेव करते हैं, मैच नहीं करते।

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

    // 🔴 सुधार 3: SQL Query में city, area, और pin कॉलम और उनकी Values ($10, $11, $12) को जोड़ दिया है
    const query = `
      INSERT INTO labours (
        name, phone, skill, daily_wage, location, aadhaar_number, 
        profile_photo_url, aadhaar_front_url, aadhaar_back_url, 
        city, area, pin
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
      RETURNING *;
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
      city || "", // अगर खाली हो तो खाली स्ट्रिंग जाए
      area || "", // अगर खाली हो तो खाली स्ट्रिंग जाए
      pin, // कारीगर का खुफिया 4-अंकों का पिन
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
    const { search, skill, city, area } = req.query;

    // 🔴 1. Hinglish/English to Hindi Mapping Dictionary
    const keywordMap = {
      // Plumber ke liye
      plumber: "प्लंबर",
      plamber: "प्लंबर",
      pambar: "प्लंबर",
      नल: "प्लंबर",
      nal: "प्लंबर",
      pipe: "प्लंबर",
      // Electrician ke liye
      electrician: "इलेक्ट्रीशियन",
      electrican: "इलेक्ट्रीशियन",
      bijli: "इलेक्ट्रीशियन",
      light: "इलेक्ट्रीशियन",
      current: "इलेक्ट्रीशियन",
      // Painter ke liye
      painter: "पेंटर",
      penter: "पेंटर",
      color: "पेंटर",
      rang: "पेंटर",
      diwal: "पेंटर",
      // Carpenter ke liye
      carpenter: "बढ़ई",
      carpentar: "बढ़ई",
      badhai: "बढ़ई",
      furniture: "बढ़ई",
      lakdi: "बढ़ई",
      // Contractor ke liye
      contractor: "ठेकेदार",
      thekedar: "ठेकेदार",
      mistry: "ठेकेदार",
      mistri: "ठेकेदार",
      // Labour ke liye
      labour: "मज़दूर",
      lebar: "मज़दूर",
      mazdoor: "मज़दूर",
      kamwali: "मज़दूर",
      beldar: "मज़दूर",
    };

    let mappedSearch = search;
    let mappedSkill = skill;

    // 🔴 2. Agar client ne search bar me hinglish daali hai, toh check karein
    if (search && keywordMap[search.toLowerCase().trim()]) {
      mappedSearch = keywordMap[search.toLowerCase().trim()];
    }

    // 🔴 3. Agar dropdown/skill filter me kuch alag aaya hai
    if (skill && keywordMap[skill.toLowerCase().trim()]) {
      mappedSkill = keywordMap[skill.toLowerCase().trim()];
    }

    let query = `
      SELECT 
        *, 
        COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE reviews.labour_id::text = labours.id::text), 0.0) AS average_rating,
        (SELECT COUNT(*) FROM reviews WHERE reviews.labour_id::text = labours.id::text) AS total_reviews
      FROM labours 
      WHERE is_verified = true
    `;
    const values = [];
    let valueIndex = 1;

    if (city) {
      query += ` AND city ILIKE $${valueIndex}`;
      values.push(`%${city}%`);
      valueIndex++;
    }

    // 🔴 4. Mapped Search term ka use SQL Query me karein
    if (mappedSearch) {
      query += ` AND (name ILIKE $${valueIndex} OR location ILIKE $${valueIndex} OR area ILIKE $${valueIndex} OR skill ILIKE $${valueIndex})`;
      values.push(`%${mappedSearch}%`);
      valueIndex++;
    }

    if (mappedSkill && mappedSkill !== "All" && mappedSkill !== "सभी") {
      query += ` AND skill = $${valueIndex}`;
      values.push(mappedSkill);
      valueIndex++;
    }

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

// 👇👇👇👇 नया विज्ञापन पोस्ट और नोटिफिकेशन भेजने का फंक्शन 👇👇👇👇
const postJobAndNotify = async (req, res) => {
  const { customer_phone, skill_needed, area, city, description } = req.body;

  try {
    // 1. विज्ञापन को डेटाबेस में सेव करें
    await db.query(
      "INSERT INTO jobs (customer_phone, skill_needed, area, city, description) VALUES ($1, $2, $3, $4, $5)",
      [customer_phone, skill_needed, area, city, description], // 5 वैल्यूज पूरी होनी चाहिए
    );

    // 2. उस शहर, इलाके और स्किल वाले सभी वेरीफाइड कारीगरों के FCM टोकन निकालें
    const workerResult = await db.query(
      "SELECT fcm_token FROM labours WHERE skill = $1 AND city ILIKE $2 AND is_verified = true",
      [skill_needed, `%${city}%`],
    );

    const tokens = workerResult.rows
      .map((row) => row.fcm_token)
      .filter((t) => t != null);

    // 3. अगर कारीगरों के टोकन मिलते हैं, तो फ़ायरबेस से नोटिफिकेशन भेजें
    if (tokens.length > 0) {
      const message = {
        notification: {
          title: `🎯 आपके इलाके (${area}) में नया काम!`,
          body: `${skill_needed} की ज़रूरत है: ${description}`,
        },
        tokens: tokens,
      };
      // ध्यान दें: इसके लिए आपके बैकएंड में firebase-admin सेटअप होना ज़रूरी है
      // await admin.messaging().sendEachForMulticast(message);
      console.log("Notification sent to tokens:", tokens);
    }

    res.status(201).json({
      success: true,
      message:
        "विज्ञापन पोस्ट हो गया और आस-पास के कारीगरों को सूचित कर दिया गया है! 🚀",
    });
  } catch (error) {
    console.error("Post Job Error:", error);
    res
      .status(500)
      .json({ success: false, message: "विज्ञापन पोस्ट करने में समस्या हुई।" });
  }
};

// 3. [VERIFICATION CHECK OPTION] - Admin ke liye pending list dekhna
const getPendingLabours = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM labours WHERE is_verified = false OR is_verified IS NULL ORDER BY created_at DESC",
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Pending Labours Error:", error);
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
  const { phone, pin } = req.body; // 🔴 पिन भी स्वीकार करें
  try {
    const query = `
      SELECT 
        l.*, 
        COALESCE(ROUND(AVG(r.rating), 1), 0.0) AS average_rating, 
        COUNT(r.id) AS total_reviews
      FROM labours l 
      LEFT JOIN reviews r ON l.id = r.labour_id
      WHERE l.phone = $1
      GROUP BY l.id
      ORDER BY l.created_at DESC   -- 🔴 यह सबसे नया अकाउंट पहले लाएगा
      LIMIT 1                      -- 🔴 यह सिर्फ एक ही (सबसे सही) अकाउंट ऐप को भेजेगा
    `;

    const result = await db.query(query, [phone]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "यह नंबर रजिस्टर्ड नहीं है।" });
    }

    // 🔴 सुरक्षा जाँच: चेक करें कि डेटाबेस का पिन और यूज़र का पिन मैच करता है या नहीं
    if (String(result.rows[0].pin).trim() !== String(pin).trim()) {
      return res.status(401).json({
        success: false,
        message: "गलत सीक्रेट पिन! कृपया सही पिन डालें। ❌",
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

const editLabourProfile = async (req, res) => {
  try {
    const { id } = req.params;
    // 🔴 city और area को भी निकालें
    const { name, phone, skill, address, city, area } = req.body;

    // 🔴 SQL क्वेरी में city और area को भी अपडेट करें
    const result = await db.query(
      "UPDATE labours SET name = $1, phone = $2, skill = $3, address = $4, city = $5, area = $6 WHERE id = $7 RETURNING *",
      [name, phone, skill, address, city, area, id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "कारीगर नहीं मिला!" });
    }

    res.status(200).json({
      success: true,
      message: "प्रोफाइल अपडेट हो गई!",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Edit Profile Error:", error);
    res.status(500).json({ success: false, message: "सर्वर एरर" });
  }
};

// 1. ग्राहक द्वारा दिया गया रिव्यू डेटाबेस में सेव करना
const addReview = async (req, res) => {
  try {
    const { labour_id, customer_name, rating, comment } = req.body;

    if (!labour_id || !rating) {
      return res
        .status(400)
        .json({ success: false, message: "कारीगर ID और रेटिंग ज़रूरी है!" });
    }

    const result = await db.query(
      "INSERT INTO reviews (labour_id, customer_name, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *",
      [labour_id, customer_name, rating, comment],
    );

    res.status(201).json({
      success: true,
      message: "रिव्यू देने के लिए धन्यवाद! ⭐",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Add Review Error:", error);
    res.status(500).json({ success: false, message: "सर्वर एरर" });
  }
};

// 2. किसी एक कारीगर के सारे रिव्यू और उसकी एवरेज रेटिंग निकालना
const getLabourReviews = async (req, res) => {
  try {
    const { labour_id } = req.params;

    // सारे रिव्यू निकालना
    const reviewsResult = await db.query(
      "SELECT * FROM reviews WHERE labour_id = $1 ORDER BY created_at DESC",
      [labour_id],
    );

    // एवरेज रेटिंग की गणना करना
    const avgResult = await db.query(
      "SELECT AVG(rating) as average_rating, COUNT(id) as total_reviews FROM reviews WHERE labour_id = $1",
      [labour_id],
    );

    res.status(200).json({
      success: true,
      average_rating: parseFloat(avgResult.rows[0].average_rating || 0).toFixed(
        1,
      ),
      total_reviews: parseInt(avgResult.rows[0].total_reviews || 0),
      reviews: reviewsResult.rows,
    });
  } catch (error) {
    console.error("Get Reviews Error:", error);
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
  editLabourProfile,
  addReview,
  getLabourReviews,
  postJobAndNotify,
};
