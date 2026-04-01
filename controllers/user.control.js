const User = require("../models/user.models");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.register = async (req, res) => {
  try {
    const { fullName, email, password, phone, section } = req.body;

    let user = await User.findOne({ email });
    if (user)
      return res.status(403).send({ message: "Email is Already Exit!" });

    const salt = await bcryptjs.genSalt(10);
    const hashPass = await bcryptjs.hash(password, salt);

    user = new User({
      fullName,
      email,
      password: hashPass,
      phone,
      section,
    });

    await user.save();

    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET || "default_secret_key", {
      expiresIn: "7d",
    });
    res.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    
    // إرجاع بيانات المستخدم مثل الـ Login عشان الـ Context يشتغل صح
    const userWithoutPassword = await User.findById(user._id).select("-password");
    res.status(201).send({
      message: "Account created!",
      user: userWithoutPassword
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).send({ message: "Invalid email or password" });
        const isMatch = await bcryptjs.compare(password, user.password);
        if (!isMatch) return res.status(400).send({ message: "Invalid email or password" });
        const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET || "default_secret_key", { expiresIn: "7d" });
        res.cookie("access_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        // remove password before sending response
        const userWithoutPassword = await User.findById(user._id).select("-password");
        res.status(200).send({ message: "Login successful", user: userWithoutPassword });
    } catch (error) {
        res.status(500).send({ message: `Error in login: ${error.message}` });
    }
};
exports.logout = (req, res) => {
    res.clearCookie("access_token");
    res.status(200).send({ message: "Logged out successfully" });
};
exports.checkMe = async (req, res) => {
    try {
        // req.user is set by verifyToken middleware
        res.status(200).send({ user: req.user });
    } catch (error) {
        res.status(500).send({ message: "Error fetching user data" });
    }
};
exports.updateMe = async (req, res) => {
    try {
        const { fullName, section } = req.body;
        
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { fullName, section },
            { new: true }
        ).select("-password");
        res.status(200).send({ message: "Profile updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: "Error updating profile" });
    }
};
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id);
        const isMatch = await bcryptjs.compare(currentPassword, user.password);
        
        if (!isMatch) {
            return res.status(400).send({ message: "كلمة المرور الحالية غير صحيحة" });
        }
        const salt = await bcryptjs.genSalt(10);
        const hashPass = await bcryptjs.hash(newPassword, salt);
        user.password = hashPass;
        await user.save();
        res.status(200).send({ message: "Password changed successfully" });
    } catch (error) {
        res.status(500).send({ message: "Error changing password" });
    }
};

