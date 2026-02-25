const express = require("express");
const { regstier, login, checkMe, logOut, logout } = require("../controllers/user.control");
const {
  registerValid,
  loginValid,
} = require("../middleware/userVlidation.middleware");
const AuthProduct = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/register", registerValid, regstier);
router.post("/login", loginValid, login);
router.post("/logout",AuthProduct, logout);
router.get("/checkMe", AuthProduct, checkMe);


module.exports = router;
