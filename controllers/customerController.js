const { createClient } = require("@supabase/supabase-js");

// सीधे आपकी .env फाइल से URL और Key लेकर Supabase चालू करें
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.registerCustomer = async (req, res) => {
  try {
    const { name, phone } = req.body;
    console.log("📱 Flutter से डेटा आया:", name, phone);

    // 1. चेक करें कि क्या यह नंबर पहले से डेटाबेस में है?
    const { data: existingCustomer, error: searchError } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .single();

    if (existingCustomer) {
      console.log("✅ पुराना ग्राहक वापस आया:", phone);
      return res.status(200).json({
        success: true,
        message: "Welcome back!",
        data: existingCustomer,
      });
    }

    // 2. अगर नया ग्राहक है, तो डेटाबेस में Insert करें
    const { data, error } = await supabase
      .from("customers")
      .insert([{ name, phone }])
      .select();

    if (error) {
      console.error("❌ Supabase Insert Error:", error.message);
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
