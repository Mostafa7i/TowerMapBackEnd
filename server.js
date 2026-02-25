require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cookie = require("cookie-parser");
const cors = require("cors");

const app = express();

// الاتصال بقاعدة البيانات
connectDB();

// Middlewares
app.use(cors({
  origin: true, 
  credentials: true
}));
app.use(cookie());
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/user.routes"));

// اختبار بسيط للتأكد أن السيرفر يعمل بعد الرفع
app.get("/", (req, res) => res.send("Server is ready!"));

// تصدير التطبيق لـ Vercel
module.exports = app;

// التشغيل المحلي فقط
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}