const express = require("express");
const { verifyToken } = require("../middleware/auth.middleware");
const adminGuard = require("../middleware/adminGuard.middleware");
const {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  updateComplaintStatus,
  markComplaintAsRead,
} = require("../controllers/complaint.controller");

const router = express.Router();

// مستخدم عادي
router.post("/", verifyToken, createComplaint);
router.get("/my", verifyToken, getMyComplaints);

// أدمن فقط
router.get("/all", verifyToken, adminGuard, getAllComplaints);

// تحديد الكل كمقروء (يجب أن يكون قبل /:id لتجنب التعارض)
router.patch("/all/read", verifyToken, adminGuard, (req, res, next) => {
  req.params.id = "all";
  return markComplaintAsRead(req, res, next);
});

router.patch("/:id/status", verifyToken, adminGuard, updateComplaintStatus);
router.patch("/:id/read", verifyToken, adminGuard, markComplaintAsRead);

module.exports = router;
