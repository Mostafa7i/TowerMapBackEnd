const Tower = require('../models/tower.models');
const ai = require('../ai/xorModel'); 
const { getTowerMetrics } = require('./snmpService'); 

/**
 * دالة مراقبة وتحليل الأبراج
 */
const MANUAL_CONTROL_MODE = true;
async function monitorAndAnalyzeTowers() {
    console.log("📡 فحص دوري للأبراج...");
    try {
        const towers = await Tower.find({});
        for (const tower of towers) {
            // جلب البيانات الحقيقية من السنسور أو المحاكي
            const metrics = await getTowerMetrics(tower.ip_address);

            // تحضير مدخلات الـ AI
            const inputForAI = [
                tower.lastMeasurement.latency || 20, // نستخدم اللي متسجل يدوي أو الـ metrics
                tower.lastMeasurement.packetLoss || 0.001,
                2, // jitter افتراضي
                tower.lastMeasurement.throughput || 100
            ];

            const prediction = await ai.predict(inputForAI);

            // تحديد الحالة بناءً على الـ AI + أرقامك اللي إنت حاططها يدوي
            const isDanger = prediction.isAnomaly || tower.lastMeasurement.latency > 200 || tower.lastMeasurement.packetLoss > 10;
            const finalStatus = isDanger ? 'Danger' : 'Safe';

            // التحديث: بنحدث الحالة والـ lastCheck فقط عشان نحافظ على أرقامك اليدوية
            await Tower.findByIdAndUpdate(tower._id, {
                status: finalStatus,
                lastCheck: new Date()
            });
        }
    } catch (err) {
        console.error("Error in auto-monitor:", err);
    }
}

// تشغيل الفحص كل 30 ثانية أوتوماتيكياً
setInterval(monitorAndAnalyzeTowers, 30000);

module.exports = { monitorAndAnalyzeTowers };