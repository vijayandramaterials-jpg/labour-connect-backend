const supabase = require("../config/db"); // अगर आपका सुपाबेस फाइल का नाम अलग है, तो उसे यहाँ सही कर लें

exports.registerCustomer = async (req, res) => {
  try {
    const { name, phone } = req.body;
    console.log("📱 Flutter से डेटा आया:", name, phone); // यह Render के लॉग्स में दिखेगा

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
