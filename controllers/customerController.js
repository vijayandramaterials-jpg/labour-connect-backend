const supabase = require("../config/db"); // आपका सुपाबेस कनेक्शन

exports.registerCustomer = async (req, res) => {
  try {
    const { name, phone } = req.body;

    // Upsert का मतलब है: अगर फोन नंबर पहले से है, तो कुछ मत करो, अगर नया है तो सेव कर लो।
    const { data, error } = await supabase
      .from("customers")
      .upsert([{ name, phone }], { onConflict: "phone" })
      .select();

    if (error) throw error;

    res
      .status(200)
      .json({ success: true, message: "ग्राहक रजिस्टर हो गया!", data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
