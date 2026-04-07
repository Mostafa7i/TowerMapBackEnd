const express = require("express");
const router = express.Router();
const {
  createIssue,
  getIssuesByTower,
  getAllIssues,
  getIssueById,
  updateIssueStatus,
  addEngineerNote,
  deleteIssue,
  getIssueStats,
} = require("../controllers/towerIssue.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const adminGuard = require("../middleware/adminGuard.middleware");

// إنشاء تذكرة جديدة
router.post("/create", verifyToken, createIssue);

// جلب مشاكل برج معين
router.get("/tower/:towerId", verifyToken, getIssuesByTower);

// إحصائيات مشاكل برج معين
router.get("/stats/:towerId", verifyToken, getIssueStats);

// جلب جميع التذاكر (للأدمن)
router.get("/all", verifyToken, getAllIssues);

// جلب تذكرة بالـ ID
router.get("/:id", verifyToken, getIssueById);

// تحديث حالة التذكرة
router.patch("/:id/status", verifyToken, updateIssueStatus);

// إضافة ملاحظة مهندس
router.post("/:id/note", verifyToken, addEngineerNote);

// حذف تذكرة (أدمن فقط)
router.delete("/:id", verifyToken, adminGuard, deleteIssue);

module.exports = router;
