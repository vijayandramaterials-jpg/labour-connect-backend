const db = require("../config/db");
const { createClient } = require("@supabase/supabase-js");
const { getMessaging } = require("../config/firebase");

// Supabase client initialize karein storage ke liye
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
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

// 1. Naya Kariagar Register Karna (Without PIN)
const addLabour = async (req, res) => {
  const {
    name,
    phone,
    skill,
    daily_wage,
    location,
    aadhaar_number,
    city,
    area,
    state,
    latitude,
    longitude,
  } = req.body;

  try {
    // Duplicate Check - Kya phone ya aadhaar pehle se hai?
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

    let skillsArray = [];
    if (req.body.skills) {
      try {
        skillsArray =
          typeof req.body.skills === "string"
            ? JSON.parse(req.body.skills)
            : req.body.skills;
      } catch (e) {
        skillsArray = [req.body.skills];
      }
    } else if (req.body.skill) {
      skillsArray = [req.body.skill]; // purane app version ka backup
    }

    const query = `
      INSERT INTO labours (
        name,
        phone,
        skills,       -- Naya column
        skill,        -- Backup ke liye purana column bhi save kar sakte hain
        daily_wage,
        location,
        aadhaar_number,
        profile_photo_url,
        aadhaar_front_url,
        aadhaar_back_url,
        city,
        area,
        state,
        latitude,
        longitude
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      ) 
      RETURNING *;
    `;

    const values = [
      name,
      phone,
      JSON.stringify(skillsArray), // JSONB array save hoga
      skillsArray.length > 0 ? skillsArray[0] : null, // purane skill me pehli skill daal di
      daily_wage,
      location,
      aadhaar_number,
      profilePhotoUrl,
      aadhaarFrontUrl,
      aadhaarBackUrl,
      city || "",
      area || "",
      state || "",
      latitude || null,
      longitude || null,
    ];

    console.log("========== Labour GPS ==========");
    console.log({
      state,
      city,
      area,
      latitude,
      longitude,
    });
    console.log("================================");

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
  console.log("===== GET /api/labours HIT =====");
  try {
    const { search, skill, city, area, latitude, longitude, radius } =
      req.query;

    // 1. पेजिनेशन के लिए पेज और लिमिट सेट करें (डिफ़ॉल्ट: पेज 1, लिमिट 10)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const keywordMap = {
      plumber: "प्लंबर",
      plamber: "प्लंबर",
      pambar: "प्लंबर",
      नल: "प्लंबर",
      nal: "प्लंबर",
      pipe: "प्लंबर",
      electrician: "इलेक्ट्रीशियन",
      electrican: "इलेक्ट्रीशियन",
      bijli: "इलेक्ट्रीशियन",
      light: "इलेक्ट्रीशियन",
      current: "इलेक्ट्रीशियन",
      painter: "पेंटर",
      penter: "पेंटर",
      color: "पेंटर",
      rang: "पेंटर",
      diwal: "पेंटर",
      carpenter: "बढ़ई",
      carpentar: "बढ़ई",
      badhai: "बढ़ई",
      furniture: "बढ़ई",
      lakdi: "बढ़ई",
      contractor: "ठेकेदार",
      thekedar: "ठेकेदार",
      mistry: "ठेकेदार",
      mistri: "ठेकेदार",
      labour: "मज़दूर",
      lebar: "मज़दूर",
      mazdoor: "मज़दूर",
      kamwali: "मज़दूर",
      beldar: "मज़दूर",
    };

    let mappedSearch = search;
    let mappedSkill = skill;

    if (search && keywordMap[search.toLowerCase().trim()]) {
      mappedSearch = keywordMap[search.toLowerCase().trim()];
    }
    if (skill && keywordMap[skill.toLowerCase().trim()]) {
      mappedSkill = keywordMap[skill.toLowerCase().trim()];
    }

    let lat = parseFloat(latitude);
    let lon = parseFloat(longitude);
    const hasGPS = !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0;

    // 2. SQL क्वेरी के अंदर ही Haversine Formula से दूरी (distance) कैलकुलेट करना
    let query = `
      SELECT *, 
        COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE reviews.labour_id::text = labours.id::text), 0.0) AS average_rating,
        (SELECT COUNT(*) FROM reviews WHERE reviews.labour_id::text = labours.id::text) AS total_reviews
    `;

    const values = [];
    let valueIndex = 1;

    if (hasGPS) {
      // अगर GPS उपलब्ध है तो सीधे SQL में दूरी निकालें (6371 KM पृथ्वी की त्रिज्या है)
      query += `, 
        ROUND((6371 * acos(
          cos(radians($${valueIndex})) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians($${valueIndex + 1})) + 
          sin(radians($${valueIndex})) * sin(radians(latitude))
        ))::numeric, 2) AS distance
      `;
      values.push(lat, lon);
      valueIndex += 2;
    } else {
      query += `, 999999 AS distance`;
    }

    query += ` FROM labours WHERE is_verified = true`;

    if (city) {
      query += ` AND city ILIKE $${valueIndex}`;
      values.push(`%${city}%`);
      valueIndex++;
    }

    if (mappedSearch) {
      query += ` AND (name ILIKE $${valueIndex} OR location ILIKE $${valueIndex} OR area ILIKE $${valueIndex} OR skill ILIKE $${valueIndex})`;
      values.push(`%${mappedSearch}%`);
      valueIndex++;
    }

    if (mappedSkill && mappedSkill !== "All" && mappedSkill !== "सभी") {
      // JSONB column 'skills' ke andar specific skill dhoondhne ke liye operator @> use kiya hai.
      // Aur purane 'skill' column me bhi dhoondhega taki old data delete na ho.
      query += ` AND (skills @> $${valueIndex}::jsonb OR skill = $${valueIndex + 1})`;
      values.push(JSON.stringify([mappedSkill])); // valueIndex
      values.push(mappedSkill); // valueIndex + 1
      valueIndex += 2;
    }

    // अगर रेडियस दिया है, तो उसे SQL की सबक्वेरी या आउटर फ़िल्टर में डालना बेहतर होता है,
    // लाखों डेटा स्केल के लिए हम इसे WHERE क्लॉज़ में ही सीधे डिस्टेंस फॉर्मूले के साथ बांध सकते हैं
    if (hasGPS && radius) {
      query += `
  AND (
        latitude IS NULL
        OR longitude IS NULL
        OR
        (
          6371 * acos(
            cos(radians($1))
            * cos(radians(latitude))
            * cos(radians(longitude)-radians($2))
            + sin(radians($1))
            * sin(radians(latitude))
          )
        ) <= $${valueIndex}
      )
  `;

      values.push(parseFloat(radius));

      valueIndex++;
    }

    // 3. सॉर्टिंग लॉजिक: अगर GPS है तो नजदीकी पहले, वरना Area और City के हिसाब से
    if (hasGPS) {
      query += `
    ORDER BY distance ASC NULLS LAST,
             created_at DESC
  `;
    } else {
      query += `
    ORDER BY area ASC,
             city ASC,
             created_at DESC
  `;
    }

    // 4. पेजिनेशन लिमिट और ऑफसेट जोड़ें (यह लाखों डेटा को रैम में आने से रोकेगा)
    query += ` LIMIT $${valueIndex} OFFSET $${valueIndex + 1}`;
    values.push(limit, offset);

    // ===== DEBUG START =====
    console.log("=========== SQL QUERY ===========");
    console.log(query);
    console.log("VALUES :", values);
    console.log("================================");
    // ===== DEBUG END =====

    const result = await db.query(query, values);

    console.log("Rows Returned :", result.rows.length);

    if (result.rows.length > 0) {
      console.log(result.rows);
    }

    console.log("========== GET LABOURS (OPTIMIZED) ==========");
    console.log(
      `Page: ${page}, Limit: ${limit}, Rows Sent: ${result.rows.length}`,
    );

    res.json({
      success: true,
      page: page,
      limit: limit,
      data: result.rows,
    });
  } catch (error) {
    console.error("Fetch Labours Error:", error);
    res
      .status(500)
      .json({ success: false, message: "डेटा लाने में समस्या हुई।" });
  }
};

// 3. नया विज्ञापन पोस्ट और नोटिफिकेशन भेजने का फंक्शन
const postJobAndNotify = async (req, res) => {
  const {
    customer_phone,
    skill_needed,
    area,
    city,
    state,
    scope,
    radius,
    urgent,
    description,
  } = req.body;

  try {
    await db.query(
      `INSERT INTO jobs
  (customer_phone, skill_needed, area, city, state, scope, description)
  VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [customer_phone, skill_needed, area, city, state, scope, description],
    );

    let sql = "";
    let params = [];

    switch (scope) {
      case "AREA":
        sql = `
      SELECT fcm_token
      FROM labours
      WHERE (skills @> $1::jsonb OR skill = $2)
      AND state ILIKE $3
      AND city ILIKE $4
      AND area ILIKE $5
      AND is_verified=true
    `;
        params = [
          JSON.stringify([skill_needed]),
          skill_needed,
          `%${state}%`,
          `%${city}%`,
          `%${area}%`,
        ];
        break;

      case "CITY":
        sql = `
      SELECT fcm_token
      FROM labours
      WHERE (skills @> $1::jsonb OR skill = $2)
      AND state ILIKE $3
      AND city ILIKE $4
      AND is_verified=true
    `;
        params = [
          JSON.stringify([skill_needed]),
          skill_needed,
          `%${state}%`,
          `%${city}%`,
        ];
        break;

      case "STATE":
        sql = `
      SELECT fcm_token
      FROM labours
      WHERE (skills @> $1::jsonb OR skill = $2)
      AND state ILIKE $3
      AND is_verified=true
    `;
        params = [JSON.stringify([skill_needed]), skill_needed, `%${state}%`];
        break;

      case "ALL_INDIA":
        sql = `
      SELECT fcm_token
      FROM labours
      WHERE (skills @> $1::jsonb OR skill = $2)
      AND is_verified=true
    `;
        params = [JSON.stringify([skill_needed]), skill_needed];
        break;

      default:
        sql = `
      SELECT fcm_token
      FROM labours
      WHERE (skills @> $1::jsonb OR skill = $2)
      AND city ILIKE $3
      AND is_verified=true
    `;
        params = [JSON.stringify([skill_needed]), skill_needed, `%${city}%`];
    }

    const workerResult = await db.query(sql, params);

    const tokens = workerResult.rows
      .map((row) => row.fcm_token)
      .filter((t) => t);

    if (tokens.length > 0) {
      const message = {
        notification: {
          title: urgent ? "🚨 तुरंत कारीगर चाहिए!" : "📢 नया काम उपलब्ध",

          body: urgent
            ? `${skill_needed} की तुरंत आवश्यकता है`
            : `${skill_needed} के लिए नया काम उपलब्ध है`,
        },

        data: {
          type: "JOB",

          skill: skill_needed,

          city: city,

          area: area,

          state: state,

          scope: scope,

          radius: radius.toString(),

          description: description,
        },

        tokens: tokens,
      };

      const response = await getMessaging().sendEachForMulticast(message);

      console.log(response);
    }

    console.log("Notification Tokens:", tokens);

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

// 4. Admin ke liye pending list dekhna
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

// 5. Kariagar ko verify (Active) karna
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

// 6. नकली या गलत फॉर्म को डिलीट करना
const rejectLabour = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

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

// 7. [LABOUR LOGIN] - सिर्फ फोन नंबर चेक करेगा (पिन की ज़रूरत नहीं)
const labourLogin = async (req, res) => {
  const { phone, fcm_token } = req.body;
  console.log("===== LABOUR LOGIN =====");
  console.log("Phone :", phone);
  console.log("FCM Token :", fcm_token);
  if (!phone) {
    return res.status(400).json({
      success: false,
      message: "Phone number required",
    });
  }

  try {
    const query = `
      SELECT l.*, 
        COALESCE(ROUND(AVG(r.rating), 1), 0.0) AS average_rating, 
        COUNT(r.id) AS total_reviews
      FROM labours l 
      LEFT JOIN reviews r ON l.id = r.labour_id
      WHERE l.phone = $1
      GROUP BY l.id
      ORDER BY l.created_at DESC 
      LIMIT 1 
    `;

    const result = await db.query(query, [phone]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "यह नंबर रजिस्टर्ड नहीं है। कृपया पहले नया अकाउंट बनाएं।",
      });
    }

    // इसके बाद UPDATE करो
    await db.query(
      `
UPDATE labours
SET
    is_online = true,
    last_login = NOW(),
    last_location_update = NOW(),
    fcm_token = $2
WHERE phone = $1
`,
      [phone, fcm_token],
    );
    console.log("Labour Online Updated");

    console.log("✅ Labour Login :", phone);

    console.log({
      online: true,
      last_login: new Date(),
      fcm: fcm_token ?? "NO TOKEN",
    });

    // अगर नंबर मिल गया, तो डेटा भेज दें
    res.status(200).json({
      success: true,
      message: "लॉगिन सफल!",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Labour Login Error:", error);
    res.status(500).json({
      success: false,
      message: "सर्वर में खराबी है, कृपया थोड़ी देर बाद प्रयास करें।",
    });
  }
};

// 8. Search Labours
const searchLabours = async (req, res) => {
  try {
    const { query: searchQuery } = req.query;

    if (!searchQuery) {
      const result = await db.query(
        "SELECT * FROM labours WHERE is_verified=true",
      );
      return res.status(200).json({ success: true, data: result.rows });
    }

    const result = await db.query(
      `
  SELECT *
  FROM labours
  WHERE is_verified = true
  AND (
      location ILIKE $1
      OR skill ILIKE $1
      OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(skills) s
          WHERE s ILIKE $1
      )
  )
  `,
      [`%${searchQuery}%`],
    );

    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Search Error:", error);
    res.status(500).json({ success: false, message: "सर्वर एरर" });
  }
};

// 9. Edit Labour Profile
const editLabourProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, skills, address, city, area } = req.body;

    const result = await db.query(
      "UPDATE labours SET name = $1, phone = $2, skills = $3, skill=$4,address=$5,city=$6,area=$7 WHERE id=$8 RETURNING *",
      [name, phone, JSON.stringify(skills), skills[0], address, city, area, id],
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

// 10. Review Add Karna
const addReview = async (req, res) => {
  try {
    const { labour_id, customer_name, rating, comment } = req.body;

    if (!labour_id || !rating) {
      return res
        .status(400)
        .json({ success: false, message: "कारीगर ID और रेटिंग ज़रूरी है!" });
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

// 11. Review Get Karna
const getLabourReviews = async (req, res) => {
  try {
    const { labour_id } = req.params;

    const reviewsResult = await db.query(
      "SELECT * FROM reviews WHERE labour_id = $1 ORDER BY created_at DESC",
      [labour_id],
    );

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

// =======================================
// UPDATE LABOUR LIVE LOCATION
// =======================================

const updateLabourLocation = async (req, res) => {
  try {
    const { phone, latitude, longitude, state, city, area } = req.body;

    console.log("===== UPDATE LOCATION API =====");
    console.log(req.body);

    const result = await db.query(
      `UPDATE labours
   SET
     latitude=$1,
     longitude=$2,
     state=$3,
     city=$4,
     area=$5,
     last_location_update=NOW()
   WHERE phone=$6
   RETURNING *`,
      [latitude, longitude, state, city, area, phone],
    );

    console.log(result.rows);

    res.json({
      success: true,
      message: "Location Updated Successfully",
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

// 🔴 सभी फंक्शन्स को सही तरीके से एक्सपोर्ट करना (यहाँ कोई राउटर नहीं आएगा)
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
  updateLabourLocation,
};
