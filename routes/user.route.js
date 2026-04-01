const express = require("express")
const { validUserFun } = require("../middleware/user.middleware")
const { register, login, logout, checkMe, updateMe, changePassword } = require("../controllers/user.control")
const { verifyToken } = require("../middleware/auth.middleware")

const router = express.Router()

router.post("/resgister", validUserFun, register)
router.post("/login", login)
router.post("/logout", logout)
router.get("/checkMe", verifyToken, checkMe)

router.patch("/updateMe", verifyToken, updateMe)
router.patch("/changePassword", verifyToken, changePassword)

module.exports = router