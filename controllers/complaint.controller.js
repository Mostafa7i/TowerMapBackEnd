const Complaint = require("../models/complaint.model");

// ===== المستخدم العادي =====

// إنشاء شكوى جديدة
exports.createComplaint = async (req, res) => {
  try {
    const { title, description, userLocation, towerName, towerLocation, problemType } = req.body;

    const complaint = new Complaint({
      userId: req.user._id,
      userName: req.user.fullName,
      title,
      description,
      userLocation,
      towerName,
      towerLocation,
      problemType,
    });

    await complaint.save();
    res.status(201).json({ message: "تم رفع الشكوى بنجاح", complaint });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء رفع الشكوى", error: error.message });
  }
};

// جلب شكاوى المستخدم الحالي
exports.getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ complaints });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب الشكاوى" });
  }
};

// ===== الأدمن =====

// جلب كل الشكاوى
exports.getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find()
      .sort({ createdAt: -1 })
      .populate("userId", "fullName email phone section");
    res.status(200).json({ complaints });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب الشكاوى" });
  }
};

// تحديث حالة الشكوى
exports.updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    const complaint = await Complaint.findByIdAndUpdate(
      id,
      { status, adminNote },
      { new: true }
    );

    if (!complaint) return res.status(404).json({ message: "الشكوى غير موجودة" });
    res.status(200).json({ message: "تم تحديث الشكوى", complaint });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء التحديث" });
  }
};

// تحديد الشكوى كمقروءة
exports.markComplaintAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    // يمكننا جعلها تقرأ شكوى واحدة أو كل الشكاوى إذا كان id = 'all'
    if (id === 'all') {
      await Complaint.updateMany({ isReadByAdmin: false }, { isReadByAdmin: true });
      return res.status(200).json({ message: "تم تحديد كل الشكاوى كمقروءة" });
    }

    const complaint = await Complaint.findByIdAndUpdate(
      id,
      { isReadByAdmin: true },
      { new: true }
    );
    
    if (!complaint) return res.status(404).json({ message: "الشكوى غير موجودة" });
    res.status(200).json({ message: "تم تحديد الشكوى كمقروءة", complaint });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء التحديث" });
  }
};
