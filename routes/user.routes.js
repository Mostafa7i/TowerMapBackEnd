const express = require("express");
const { register, login, checkMe, logout, updateMe, changePassword, getPendingUsers, getAllUsers, verifyUser } = require("../controllers/user.control");
const {
  registerValid,
  loginValid,
} = require("../middleware/userVlidation.middleware");
const { verifyToken } = require("../middleware/auth.middleware");
const adminGuard = require("../middleware/adminGuard.middleware");

const router = express.Router();

router.post("/register", registerValid, register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/checkMe", verifyToken, checkMe)

router.patch("/updateMe", verifyToken, updateMe)
router.patch("/changePassword", verifyToken, changePassword)

// Admin routes
router.get("/admin/users", verifyToken, adminGuard, getAllUsers);
router.get("/admin/pending", verifyToken, adminGuard, getPendingUsers);
router.patch("/admin/verify/:id", verifyToken, adminGuard, verifyUser);

module.exports = router;
