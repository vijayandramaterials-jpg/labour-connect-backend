const db = require("../config/db");

// 1. नया एडमिन विज्ञापन बनाना
const createAdminAdvertisement = async (req, res) => {
  try {
    const {
      title,
      description,
      target_type,
      scope,
      state,
      city,
      area,
      start_date,
      end_date,
    } = req.body;

    const validTargets = ["CLIENT", "LABOUR", "BOTH"];

    if (!validTargets.includes((target_type || "").toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid Target Type",
      });
    }
    const validScopes = ["AREA", "CITY", "STATE", "ALL_INDIA"];

    if (!validScopes.includes(scope)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Scope",
      });
    }

    if (
      !title ||
      !description ||
      !target_type ||
      !scope ||
      !start_date ||
      !end_date
    ) {
      return res.status(400).json({
        success: false,
        message: "सभी आवश्यक जानकारी भरें।",
      });
    }

    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({
        success: false,
        message: "End Date हमेशा Start Date के बाद होनी चाहिए।",
      });
    }

    if (scope === "STATE" && !state) {
      return res.status(400).json({
        success: false,
        message: "State चुनना आवश्यक है।",
      });
    }

    if (scope === "CITY" && (!state || !city)) {
      return res.status(400).json({
        success: false,
        message: "State और City दोनों आवश्यक हैं।",
      });
    }

    if (scope === "AREA" && (!state || !city || !area)) {
      return res.status(400).json({
        success: false,
        message: "State, City और Area आवश्यक हैं।",
      });
    }

    const query = `
INSERT INTO admin_advertisements
(
title,
description,
target_type,
scope,
state,
city,
area,
start_date,
end_date,
banner_url,
offer_badge,
priority
)
VALUES
(
$1,
$2,
$3,
$4,
$5,
$6,
$7,
$8,
$9,
$10,
$11,
$12
)
RETURNING *;
`;
    const values = [
      title,
      description,
      target_type,
      scope,
      state || null,
      city || null,
      area || null,
      start_date,
      end_date,
      banner_url || null,
      offer_badge || null,
      priority || 1,
    ];
    const result = await db.query(query, values);

    res.status(201).json({
      success: true,
      message: "विज्ञापन सफलतापूर्वक बन गया! 📢",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create Admin Ad Error:", error);
    res
      .status(500)
      .json({ success: false, message: "सर्वर एरर: विज्ञापन नहीं बन पाया।" });
  }
};

// 2. विज्ञापन प्राप्त करना (लोकेशन और प्रायोरिटी के आधार पर फ़िल्टर)
const getAdminAdvertisements = async (req, res) => {
  try {
    const { target_type, state, city, area } = req.query; // CLIENT या LABOUR

    if (!target_type) {
      return res.status(400).json({
        success: false,
        message: "target_type (CLIENT/LABOUR) ज़रूरी है।",
      });
    }

    const currentDate = new Date().toISOString().split("T")[0];

    // SQL Query: लोकेशन मैच करेगी और प्रायोरिटी (AREA -> CITY -> STATE -> ALL_INDIA) के हिसाब से सॉर्ट करेगी
    const query = `
      SELECT * FROM admin_advertisements
      WHERE is_active = true
      AND start_date <= $1 AND end_date >= $1
      AND (target_type = $2 OR target_type = 'BOTH')
      AND (
        scope = 'ALL_INDIA'
        OR (scope = 'STATE' AND state ILIKE $3)
        OR (scope = 'CITY' AND state ILIKE $3 AND city ILIKE $4)
        OR (scope = 'AREA' AND state ILIKE $3 AND city ILIKE $4 AND area ILIKE $5)
      )
      ORDER BY 
        CASE 
          WHEN scope = 'AREA' THEN 1
          WHEN scope = 'CITY' THEN 2
          WHEN scope = 'STATE' THEN 3
          ELSE 4
        END ASC, 
        created_at DESC;
    `;

    const values = [
      currentDate,
      target_type,
      `%${state || ""}%`,
      `%${city || ""}%`,
      `%${area || ""}%`,
    ];
    const result = await db.query(query, values);

    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get Admin Ads Error:", error);
    res
      .status(500)
      .json({ success: false, message: "डेटा लाने में समस्या हुई।" });
  }
};

// 3. विज्ञापन अपडेट करना
const updateAdminAdvertisement = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      target_type,
      scope,
      state,
      city,
      area,
      start_date,
      end_date,
      banner_url,
      offer_badge,
      priority,
      is_active,
    } = req.body;

    const query = `
      UPDATE admin_advertisements 
      SET
title=$1,
description=$2,
target_type=$3,
scope=$4,
state=$5,
city=$6,
area=$7,
start_date=$8,
end_date=$9,
banner_url=$10,
offer_badge=$11,
priority=$12,
is_active=$13,
updated_at=NOW()
WHERE id=$14
RETURNING *;
    `;
    const values = [
      title,
      description,
      target_type,
      scope,
      state,
      city,
      area,
      start_date,
      end_date,
      banner_url,
      offer_badge,
      priority,
      is_active,
      id,
    ];
    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "विज्ञापन नहीं मिला!" });
    }

    res.status(200).json({
      success: true,
      message: "विज्ञापन अपडेट हो गया! ✅",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update Admin Ad Error:", error);
    res
      .status(500)
      .json({ success: false, message: "अपडेट करने में समस्या हुई।" });
  }
};

// 4. विज्ञापन डिलीट करना
const deleteAdminAdvertisement = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `
  UPDATE admin_advertisements
  SET is_active = false
  WHERE id = $1
  RETURNING *;
  `,
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "विज्ञापन नहीं मिला!" });
    }

    res
      .status(200)
      .json({ success: true, message: "विज्ञापन हटा दिया गया है। 🗑️" });
  } catch (error) {
    console.error("Delete Admin Ad Error:", error);
    res.status(500).json({ success: false, message: "हटाने में समस्या हुई।" });
  }
};

module.exports = {
  createAdminAdvertisement,
  getAdminAdvertisements,
  updateAdminAdvertisement,
  deleteAdminAdvertisement,
};
