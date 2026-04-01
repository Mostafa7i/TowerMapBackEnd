const User = require("../models/user.models");

const adminGuard = async (req, res, next) => {
    try {
        if (!req.user || !req.user.isAdmin) {
            return res.status(403).json({ success: false, message: "غير مصرح، يجب أن تكون مسؤولاً" });
        }
        next();
    } catch (error) {
        return res.status(500).json({ success: false, message: "حدث خطأ أثناء التحقق من الصلاحيات" });
    }
};

module.exports = adminGuard;
