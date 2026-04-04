require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cookie = require("cookie-parser");
const cors = require("cors");
const { monitorAndAnalyzeTowers } = require('./services/monitorService');
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const app = express();

// الاتصال بقاعدة البيانات
connectDB();

app.use(cookie());
app.use(express.json());

// Middlewares
app.use(helmet());
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan("dev"));
}

// Rate Limiting for Auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: "❌ طلبات كثيرة جداً، يرجى المحاولة لاحقاً."
});
app.use("/api/auth", authLimiter);

app.use(cors({
  origin: true,
  credentials: true
}));

require("./cronJobs")
// Routes
app.use("/api/auth", require("./routes/user.routes"));
app.use("/api/ai", require("./routes/ai.route"));
app.use("/api/towerMap", require("./routes/tower.route"));
app.use("/api/complaints", require("./routes/complaint.route"));

// اختبار  للتأكد أن السيرفر يعمل بعد الرفع
app.get("/", (req, res) => res.json({ success: true, message: "Server is ready!" }));

// 404 Route
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: "❌ المسار غير موجود" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global Error:", err.stack);
  res.status(500).json({ success: false, message: "❌ حدث خطأ في الخادم", error: err.message });
});

// تصدير التطبيق لـ Vercel
module.exports = app;

// التشغيل المحلي فقط
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    // بدء المراقبة عند تشغيل السيرفر
    monitorAndAnalyzeTowers();
  });
}

