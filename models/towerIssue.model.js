const mongoose = require("mongoose");

const towerIssueSchema = new mongoose.Schema(
  {
    // البرج المرتبط بالمشكلة
    towerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tower",
      required: true,
    },
    towerName: {
      type: String,
      required: true,
    },

    // نوع المشكلة والوصف
    issueType: {
      type: String,
      enum: ["critical", "danger", "warning", "maintenance", "other"],
      default: "warning",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    // قياسات وقت المشكلة
    measurements: {
      latency: { type: Number },
      packetLoss: { type: Number },
      jitter: { type: Number },
      throughput: { type: Number },
    },

    // نتيجة الذكاء الاصطناعي
    aiResult: {
      probability: { type: Number },
      isAnomaly: { type: Boolean },
      riskLevel: { type: String },
    },

    // حالة التذكرة
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },

    // من أنشأ التذكرة
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdByName: {
      type: String,
    },

    // ملاحظات المهندس المختص
    engineerNotes: [
      {
        note: { type: String, required: true },
        addedBy: { type: String },
        addedById: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        addedAt: { type: Date, default: Date.now },
      },
    ],

    // تاريخ الحل
    resolvedAt: { type: Date },
    resolvedBy: { type: String },

    // الأولوية
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TowerIssue", towerIssueSchema);
