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
                // لحماية المحاكي: لو الـ SNMP فشل ورجع 0 لأن البرج وهمي، نحافظ على قيمة المحاكي الحالية
                const newThroughput = metrics.isOffline && tower.lastMeasurement?.throughput > 0 
                  ? tower.lastMeasurement.throughput 
                  : metrics.throughput;

                const newTemp = metrics.isOffline && tower.lastMeasurement?.temperature > 0 
                  ? tower.lastMeasurement.temperature 
                  : metrics.temperature;

                tower.lastMeasurement = {
                    ...tower.lastMeasurement,
                    temperature: newTemp,
                    throughput: newThroughput,
                    updatedAt: new Date()
                };
                await tower.save();

                console.log(`Updated ${tower.TowerName}`);

                const baseUrl = process.env.CLIENT_URL || "http://localhost:5000";
                await axios.post(`${baseUrl}/api/ai/analyze`, {
                    towerId: tower._id,
                    stats: [metrics.latency, metrics.packetLoss, 2, metrics.throughput]
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
module.exports = {};