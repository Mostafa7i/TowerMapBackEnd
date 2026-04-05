const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    // مقدم الشكوى
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },

    // عنوان الشكوى
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // وصف المشكلة
    description: {
      type: String,
      required: true,
      trim: true,
    },

    // موقع المستخدم
    userLocation: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String, trim: true },
    },

    // معلومات البرج
    towerName: {
      type: String,
      trim: true,
    },
    towerLocation: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String, trim: true },
    },

    // نوع المشكلة
    problemType: {
      type: String,
      enum: ["انقطاع الإشارة", "ضعف الإشارة", "تداخل في الشبكة", "مشكلة اتصال", "أخرى"],
      default: "أخرى",
    },

    // حالة الشكوى
    status: {
      type: String,
      enum: ["pending", "in_progress", "resolved", "rejected"],
      default: "pending",
    },

    isReadByAdmin: {
      type: Boolean,
      default: false,
    },


    // ملاحظة الإدارة
    adminNote: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

const Complaint = mongoose.model("Complaint", complaintSchema);
module.exports = Complaint;
