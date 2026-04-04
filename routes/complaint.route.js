const express = require("express");
const { verifyToken } = require("../middleware/auth.middleware");
const adminGuard = require("../middleware/adminGuard.middleware");
const {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  updateComplaintStatus,
} = require("../controllers/complaint.controller");

const router = express.Router();

// مستخدم عادي
router.post("/", verifyToken, createComplaint);
router.get("/my", verifyToken, getMyComplaints);

// أدمن فقط
router.get("/all", verifyToken, adminGuard, getAllComplaints);
router.patch("/:id/status", verifyToken, adminGuard, updateComplaintStatus);

module.exports = router;
