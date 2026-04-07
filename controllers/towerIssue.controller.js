const TowerIssue = require("../models/towerIssue.model");
const Tower = require("../models/tower.models");

// ─── إنشاء تذكرة/مشكلة جديدة ──────────────────────────────────────────────
exports.createIssue = async (req, res) => {
  try {
    const {
      towerId,
      issueType,
      title,
      description,
      measurements,
      aiResult,
      priority,
    } = req.body;

    const tower = await Tower.findById(towerId);
    if (!tower) {
      return res.status(404).json({ success: false, message: "البرج غير موجود" });
    }

    const issue = new TowerIssue({
      towerId,
      towerName: tower.TowerName,
      issueType: issueType || tower.status || "warning",
      title:
        title ||
        `مشكلة في برج ${tower.TowerName} — ${new Date().toLocaleDateString("ar-EG")}`,
      description,
      measurements: measurements || tower.lastMeasurement,
      aiResult,
      priority: priority || (issueType === "danger" ? "critical" : issueType === "critical" ? "high" : "medium"),
      createdBy: req.user?._id,
      createdByName: req.user?.fullName || "النظام",
      status: "open",
    });

    await issue.save();

    res.status(201).json({
      success: true,
      message: "تم فتح التذكرة بنجاح",
      data: issue,
    });
  } catch (error) {
    console.error("Error creating issue:", error);
    res.status(500).json({ success: false, message: "خطأ في إنشاء التذكرة" });
  }
};

// ─── جلب مشاكل برج معين ────────────────────────────────────────────────────
exports.getIssuesByTower = async (req, res) => {
  try {
    const { towerId } = req.params;
    const { status, limit = 50, page = 1 } = req.query;

    const query = { towerId };
    if (status) query.status = status;

    const issues = await TowerIssue.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await TowerIssue.countDocuments(query);

    res.json({
      success: true,
      data: issues,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "خطأ في جلب المشاكل" });
  }
};

// ─── جلب جميع التذاكر (للأدمن) ───────────────────────────────────────────
exports.getAllIssues = async (req, res) => {
  try {
    const { status, priority, towerId, limit = 100, page = 1 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (towerId) query.towerId = towerId;

    const issues = await TowerIssue.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await TowerIssue.countDocuments(query);

    res.json({
      success: true,
      data: issues,
      total,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "خطأ في جلب التذاكر" });
  }
};

// ─── جلب تذكرة بالـ ID ────────────────────────────────────────────────────
exports.getIssueById = async (req, res) => {
  try {
    const issue = await TowerIssue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ success: false, message: "التذكرة غير موجودة" });
    }
    res.json({ success: true, data: issue });
  } catch (error) {
    res.status(500).json({ success: false, message: "خطأ في جلب التذكرة" });
  }
};

// ─── تحديث حالة التذكرة ───────────────────────────────────────────────────
exports.updateIssueStatus = async (req, res) => {
  try {
    const { status, resolvedBy } = req.body;

    const updateData = { status };

    if (status === "resolved" || status === "closed") {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = resolvedBy || req.user?.fullName || "مجهول";
    }

    const issue = await TowerIssue.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!issue) {
      return res.status(404).json({ success: false, message: "التذكرة غير موجودة" });
    }

    res.json({
      success: true,
      message: "تم تحديث حالة التذكرة",
      data: issue,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "خطأ في تحديث التذكرة" });
  }
};

// ─── إضافة ملاحظة المهندس ────────────────────────────────────────────────
exports.addEngineerNote = async (req, res) => {
  try {
    const { note } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, message: "الملاحظة مطلوبة" });
    }

    const issue = await TowerIssue.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          engineerNotes: {
            note: note.trim(),
            addedBy: req.user?.fullName || "مهندس",
            addedById: req.user?._id,
            addedAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!issue) {
      return res.status(404).json({ success: false, message: "التذكرة غير موجودة" });
    }

    res.json({
      success: true,
      message: "تمت إضافة الملاحظة بنجاح",
      data: issue,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "خطأ في إضافة الملاحظة" });
  }
};

// ─── حذف تذكرة ────────────────────────────────────────────────────────────
exports.deleteIssue = async (req, res) => {
  try {
    const issue = await TowerIssue.findByIdAndDelete(req.params.id);
    if (!issue) {
      return res.status(404).json({ success: false, message: "التذكرة غير موجودة" });
    }
    res.json({ success: true, message: "تم حذف التذكرة بنجاح" });
  } catch (error) {
    res.status(500).json({ success: false, message: "خطأ في حذف التذكرة" });
  }
};

// ─── إحصائيات المشاكل لبرج معين ──────────────────────────────────────────
exports.getIssueStats = async (req, res) => {
  try {
    const { towerId } = req.params;

    const stats = await TowerIssue.aggregate([
      { $match: { towerId: require("mongoose").Types.ObjectId.createFromHexString(towerId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const result = { open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 };
    stats.forEach((s) => {
      result[s._id] = s.count;
      result.total += s.count;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: "خطأ في جلب الإحصائيات" });
  }
};
