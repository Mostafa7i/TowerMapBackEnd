require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cookie = require("cookie-parser");
const cors = require("cors");
const { monitorAndAnalyzeTowers } = require('./services/monitorService');
const app = express();

// الاتصال بقاعدة البيانات
connectDB();

app.use(cookie());
app.use(express.json());

// Middlewares
app.use(cors({
  origin: true, 
  credentials: true
}));

require("./cronJobs")
// Routes
app.use("/api/auth", require("./routes/user.routes"));
app.use("/api/ai", require("./routes/ai.route"));
app.use("/api/towerMap", require("./routes/tower.route"));

// اختبار  للتأكد أن السيرفر يعمل بعد الرفع
app.get("/", (req, res) => res.send("Server is ready!"));

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

const snmp = require("net-snmp");
const testSession = snmp.createSession("127.0.0.1", "public");
testSession.get(["1.3.6.1.2.1.1.5.0"], (error, varbinds) => {
    if (error) {
        console.log("❌ SNMP TEST FAILED: " + error.message);
    } else {
        console.log("✅ SNMP TEST SUCCESS: " + varbinds[0].value);
    }
});