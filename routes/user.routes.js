const express = require("express");
const { register, login, checkMe, logout, updateMe, changePassword } = require("../controllers/user.control");
const {
  registerValid,
  loginValid,
} = require("../middleware/userVlidation.middleware");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/register", registerValid, register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/checkMe", verifyToken, checkMe)

router.patch("/updateMe", verifyToken, updateMe)
router.patch("/changePassword", verifyToken, changePassword)

module.exports = router;
