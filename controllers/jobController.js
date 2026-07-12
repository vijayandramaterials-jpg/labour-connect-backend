const db = require("../config/db");
const { sendPushNotification } = require("./notificationController");

// 1. नया विज्ञापन पोस्ट करना (PhonePe पेमेंट के बाद)
exports.createJobAdvertisement = async (req, res) => {
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
    latitude,
    longitude,
  } = req.body;

  try {
    const query = `
      INSERT INTO jobs 
      (customer_phone, skill_needed, area, city, state, scope, radius, urgent, description, latitude, longitude, status, response_count, created_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', 0,  NOW(), NOW() + INTERVAL '24 HOURS')
      RETURNING *;
    `;

    const values = [
      customer_phone,
      skill_needed,
      area,
      city,
      state,
      scope,
      radius ? parseInt(radius) : 5, // डिफ़ॉल्ट 5 KM
      urgent || false,
      description,
      latitude || null,
      longitude || null,
    ];

    const result = await db.query(query, values);
    const savedJob = result.rows[0];

    // तुरंत मैचिंग लेबर को अलर्ट भेजें
    await triggerJobNotifications(savedJob);

    res.status(201).json({
      success: true,
      message: "विज्ञापन लाइव हो गया है!",
      data: savedJob,
    });
  } catch (error) {
    console.error("Create Job Error:", error);
    res
      .status(500)
      .json({ success: false, message: "विज्ञापन सेव करने में एरर।" });
  }
};

// 2. लेबर द्वारा 'Interested' बटन क्लिक करने का फ्लो (Privacy Safe)
exports.respondToJob = async (req, res) => {
  const { job_id, labour_id, status } = req.body; // status: 'interested' या 'not_interested'

  try {
    // चेक करें कि लेबर पहले ही रिस्पॉन्स तो नहीं कर चुका
    const checkExist = await db.query(
      "SELECT * FROM job_responses WHERE job_id = $1 AND labour_id = $2",
      [job_id, labour_id],
    );

    if (checkExist.rows.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "आप पहले ही रिस्पॉन्स दे चुके हैं।" });
    }

    // response टेबल में एंट्री करें
    await db.query(
      "INSERT INTO job_responses (job_id, labour_id, status, created_at) VALUES ($1, $2, $3, NOW())",
      [job_id, labour_id, status],
    );

    if (status === "interested") {
      // जॉब टेबल में रिस्पॉन्स काउंट बढ़ाएं
      await db.query(
        "UPDATE jobs SET response_count = response_count + 1 WHERE id = $1",
        [job_id],
      );

      // ग्राहक का फ़ोन नंबर निकाले बिना केवल उसे सूचित करें
      const jobData = await db.query(
        "SELECT customer_phone FROM jobs WHERE id = $1",
        [job_id],
      );
      console.log(
        `📞 ग्राहक ${jobData.rows[0].customer_phone} को सूचित किया गया कि एक लेबर इंटरेस्टेड है।`,
      );
    }

    res
      .status(200)
      .json({ success: true, message: "आपका रिस्पॉन्स दर्ज कर लिया गया है।" });
  } catch (error) {
    console.error("Job Respond Error:", error);
    res.status(500).json({ success: false, message: "सर्वर एरर।" });
  }
};

// 3. मैचिंग टोकन्स ढूंढकर पुश नोटिफिकेशन भेजने का कोर फ़ंक्शन
async function triggerJobNotifications(job) {
  console.log("========== JOB NOTIFICATION ==========");
  console.log(job);

  const sentTokens = new Set();
  let sql =
    "SELECT id, fcm_token, latitude, longitude, is_online, last_login FROM labours WHERE skill = $1 AND is_verified = true";
  let params = [job.skill_needed];

  const workersResult = await db.query(sql, params);
  let eligibleTokens = [];

  const title = job.urgent
    ? "🚨 तुरंत कारीगर चाहिए! (High Priority)"
    : "📢 नया काम उपलब्ध है";
  const body = `${job.skill_needed} की आवश्यकता है। स्थान: ${job.area || job.city}`;

  const extraData = {
    type: "JOB",
    job_id: job.id.toString(),
    skill: job.skill_needed,
    description: job.description,
    scope: job.scope,
    area: job.area,
    city: job.city,
    state: job.state,
  };

  if (job.scope === "AREA" && job.latitude && job.longitude && job.radius) {
    // हावरसाइन फ़ॉर्मूला (GPS डिस्टेंस कैलकुलेशन) से रेडियस फ़िल्टर लगाना
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371; // पृथ्वी की त्रिज्या KM में

    for (const labour of workersResult.rows) {
      if (labour.latitude && labour.longitude && labour.fcm_token) {
        const dLat = toRad(labour.latitude - parseFloat(job.latitude));
        const dLon = toRad(labour.longitude - parseFloat(job.longitude));
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(parseFloat(job.latitude))) *
            Math.cos(toRad(labour.latitude)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        if (distance <= parseFloat(job.radius)) {
          if (!sentTokens.has(labour.fcm_token)) {
            sentTokens.add(labour.fcm_token);

            const alreadySent = await db.query(
              `
            SELECT id FROM job_notification_history WHERE job_id=$1 AND labour_id=$2`,
              [job.id, labour.id],
            );
            if (alreadySent.rows.length === 0) {
              eligibleTokens.push(labour.fcm_token);

              await db.query(
                `
                      INSERT INTO job_notification_history
                      (job_id,labour_id)
                      VALUES($1,$2)
                      ON CONFLICT DO NOTHING
                      `,
                [job.id, labour.id],
              );
            }
          }
        }
      }
    }
  } else if (job.scope === "CITY") {
    const citySql = `SELECT fcm_token FROM labours WHERE skill = $1 AND city ILIKE $2 AND is_verified = true`;
    const cityRes = await db.query(citySql, [
      job.skill_needed,
      `%${job.city}%`,
    ]);
    eligibleTokens = cityRes.rows.map((r) => r.fcm_token).filter((t) => t);
  } else if (job.scope === "STATE") {
    const stateSql = `SELECT fcm_token FROM labours WHERE skill = $1 AND state ILIKE $2 AND is_verified = true`;
    const stateRes = await db.query(stateSql, [
      job.skill_needed,
      `%${job.state}%`,
    ]);
    eligibleTokens = stateRes.rows.map((r) => r.fcm_token).filter((t) => t);
  } else {
    // ALL_INDIA
    eligibleTokens = workersResult.rows
      .map((r) => r.fcm_token)
      .filter((t) => t);
  }

  if (eligibleTokens.length > 0) {
    console.log("Eligible Workers :", eligibleTokens.length);
    console.log("Notification Sent");
    await sendPushNotification(
      eligibleTokens,
      title,
      body,
      extraData,
      job.urgent,
    );
  }
}

// 4. ऑटो रेडियस एक्सपेंशन इंजन (इसे हर 5 मिनट में बैकएंड शेड्यूलर या क्रॉन जॉब से रन करें)
exports.checkAndExpandRadius = async () => {
  try {
    // उन एक्टिव विज्ञापनों को निकालें जिन्हें पोस्ट हुए 30 मिनट से ज़्यादा हो गए हैं और कोई रिस्पॉन्स नहीं आया है
    const query = `
      SELECT * FROM jobs 
      WHERE status = 'active' 
      AND response_count = 0 
      AND created_at <= NOW() - INTERVAL '30 minutes'
    `;
    const expiredJobs = await db.query(query);

    const radiusChain = [3, 5, 10, 25, 50, 100];

    for (let job of expiredJobs.rows) {
      let updatedFields = {};

      if (job.scope === "AREA") {
        let currentIdx = radiusChain.indexOf(parseInt(job.radius));
        if (currentIdx !== -1 && currentIdx < radiusChain.length - 1) {
          // अगला रेडियस सेट करें
          updatedFields.radius = radiusChain[currentIdx + 1];
        } else {
          // 100 KM के बाद पूरा City स्कोप कर दें
          updatedFields.scope = "CITY";
        }
      } else if (job.scope === "CITY") {
        updatedFields.scope = "STATE";
      } else if (job.scope === "STATE") {
        updatedFields.scope = "ALL_INDIA";
      }

      if (Object.keys(updatedFields).length > 0) {
        // डेटाबेस में नया स्कोप/रेडियस अपडेट करें और टाइमर रीसेट करें ताकि अगले 30 मिनट बाद फिर बढ़ सके
        await db.query(
          "UPDATE jobs SET scope = COALESCE($1, scope), radius = COALESCE($2, radius), created_at = NOW() WHERE id = $3",
          [updatedFields.scope || null, updatedFields.radius || null, job.id],
        );

        // अपडेटेड पैरामीटर्स के साथ नए लेबर्स को दोबारा री-नोटिफाई करें
        const { rows } = await db.query("SELECT * FROM jobs WHERE id = $1", [
          job.id,
        ]);
        console.log("================================");
        console.log("Radius Expanded");
        console.log("Job :", job.id);
        console.log("Scope :", updatedFields.scope || job.scope);
        console.log("Radius :", updatedFields.radius || job.radius);
        console.log("================================");
        await triggerJobNotifications(rows[0]);
        console.log(
          `🔄 जॉब विज्ञापन ID: ${job.id} का दायरा ऑटो-विस्तारित करके सूचित कर दिया गया है।`,
        );
      }
    }
  } catch (error) {
    console.error("Error in Auto Radius Expansion Loop:", error);
  }

  exports.getAvailableJobs = async (req, res) => {
    try {
      const { phone } = req.query;

      const labour = await db.query(
        `
      SELECT skill,city,state,area
      FROM labours
      WHERE phone=$1
      `,
        [phone],
      );

      if (labour.rows.length == 0) {
        return res.status(404).json({
          success: false,
        });
      }

      const worker = labour.rows[0];

      const jobs = await db.query(
        `
SELECT *
FROM jobs
WHERE
status='active'
AND expires_at > NOW()
AND skill_needed=$1
AND
(
(scope='AREA' AND area ILIKE $2)

OR

(scope='CITY' AND city ILIKE $3)

OR

(scope='STATE' AND state ILIKE $4)

OR

(scope='ALL_INDIA')
)

ORDER BY
urgent DESC,
created_at DESC
`,
        [worker.skill, worker.area, worker.city, worker.state],
      );

      res.json({
        success: true,
        data: jobs.rows,
      });
    } catch (e) {
      console.log(e);

      res.status(500).json({
        success: false,
      });
    }
  };
};
