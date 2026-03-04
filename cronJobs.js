const cron = require("node-cron");
const Tower = require("./models/tower.models"); // موديل البرج بتاعك
const { getTowerMetrics } = require("./services/snmpService"); // الدالة اللي عملناها قبل كدا
const axios = require("axios"); // عشان ننادي الـ AI API

// تشغيل المهمة كل دقيقة
cron.schedule("* * * * *", async () => {
    console.log("Running SNMP check...");

    try {
        // 1. جلب كل الأبراج من قاعدة البيانات
        const towers = await Tower.find({});

        for (const tower of towers) {
            try {
                // 2. جلب البيانات بـ SNMP
                const metrics = await getTowerMetrics(tower.ip_address);

                // 3. تحديث البيانات في قاعدة البيانات
                tower.lastMeasurement = {
                    ...tower.lastMeasurement,
                    temperature: metrics.temperature,
                    throughput: metrics.throughput,
                    updatedAt: new Date()
                };
                await tower.save();

                console.log(`Updated ${tower.TowerName}`);

                // 4. نداء الـ AI API للتحليل بناءً على البيانات الجديدة
                await axios.post("http://localhost:5000/api/ai/analyze", {
                    towerId: tower._id,
                    // ... باقى البيانات
                });

            } catch (snmpError) {
                console.error(`Failed to get SNMP for ${tower.TowerName}:`, snmpError.message);
                // هنا ممكن نحدث حالة البرج إنه "مش متاح"
            }
        }
    } catch (dbError) {
        console.error("Database error:", dbError.message);
    }
});
module.exports = { getTowerMetrics };