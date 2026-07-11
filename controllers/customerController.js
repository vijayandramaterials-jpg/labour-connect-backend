const { createClient } = require("@supabase/supabase-js");

// सीधे आपकी .env फाइल से URL और Key लेकर Supabase चालू करें
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.registerCustomer = async (req, res) => {
  try {
    const {
      name,

      phone,

      latitude,

      longitude,

      state,

      city,

      area,
    } = req.body;
    console.log({
      name,
      phone,
      state,
      city,
      area,
      latitude,
      longitude,
    });

    // 1. चेक करें कि क्या यह नंबर पहले से डेटाबेस में है?
    const { data: existingCustomer, error: searchError } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .single();

    if (searchError && searchError.code !== "PGRST116") {
      console.error("Search Error:", searchError);
      throw searchError;
    }

    if (existingCustomer) {
      const locationChanged =
        existingCustomer.latitude != latitude ||
        existingCustomer.longitude != longitude;

      console.log("Location Changed :", locationChanged);
      if (locationChanged) {
        console.log("Updating Customer GPS");
      }
      await supabase
        .from("customers")
        .update({
          latitude,
          longitude,
          state,
          city,
          area,
          last_login: new Date(),
          is_online: true,

          last_location_update: new Date(),
        })
        .eq("phone", phone);

      console.log("✅ पुराना ग्राहक वापस आया:", phone);

      const { data: updatedCustomer } = await supabase
        .from("customers")
        .select("*")
        .eq("phone", phone)
        .single();

      return res.status(200).json({
        success: true,
        message: "Welcome back!",
        data: updatedCustomer,
      });
    }

    // 2. अगर नया ग्राहक है, तो डेटाबेस में Insert करें
    const { data, error } = await supabase
      .from("customers")
      .upsert(
        {
          name,
          phone,
          latitude,
          longitude,
          state,
          city,
          area,
          last_login: new Date(),
          is_online: true,

          last_location_update: new Date(),
        },
        {
          onConflict: "phone",
        },
      )
      .select();

    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("customers")
          .select("*")
          .eq("phone", phone)
          .single();

        return res.status(200).json({
          success: true,
          message: "Welcome back",
          data: existing,
        });
      }

      throw error;
    }

    console.log("🎉 नया ग्राहक सफलतापूर्वक सेव हो गया:", data);
    res
      .status(200)
      .json({ success: true, message: "नया ग्राहक रजिस्टर हो गया!", data });
  } catch (error) {
    console.error("❌ Server Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
