const Tower = require('../models/tower.models');
const ai = require('../ai/xorModel');
const { getTowerMetrics } = require('./snmpService');

// ─── حدود تحديد الحالة ───────────────────────────────────────────────────────
// ─── حدود تحديد الحالة ───────────────────────────────────────────────────────
const THRESHOLDS = {
    latency: {
        warning:  80,
        critical: 150,  // ms — 150 فما فوق → critical
        danger:   300,  // ms — فوق 300 → danger
    },
    packetLoss: {
        warning:  5,
        critical: 10,   // %  — 10 فما فوق  → critical
        danger:   15,   // %  — فوق 15% → danger
    }
};

/**
 * تحديد حالة البرج بناءً على قراءات الـ AI + الأرقام
 * @param {Object} prediction - نتيجة الـ AI { isAnomaly, riskLevel }
 * @param {Object} measurement - lastMeasurement { latency, packetLoss }
 * @returns {'safe'|'warning'|'critical'|'danger'}
 */
function determineTowerStatus(prediction, measurement) {
    const latency    = measurement?.latency    ?? 0;
    const packetLoss = measurement?.packetLoss ?? 0;

    // Danger: أرقام كارثية
    if (
        latency    > THRESHOLDS.latency.danger    ||
        packetLoss > THRESHOLDS.packetLoss.danger ||
        prediction.riskLevel === 'CRITICAL'
    ) {
        return 'danger';
    }

    // Critical: الـ AI شاف anomaly أو أرقام سيئة
    if (
        prediction.isAnomaly                           ||
        latency    >= THRESHOLDS.latency.critical      ||
        packetLoss >= THRESHOLDS.packetLoss.critical   ||
        prediction.riskLevel === 'HIGH'
    ) {
        return 'critical';
    }

    // Warning: رقم متوسط بدون anomaly
    if (
        latency    >= THRESHOLDS.latency.warning      ||
        packetLoss >= THRESHOLDS.packetLoss.warning   ||
        prediction.riskLevel === 'MEDIUM'
    ) {
        return 'warning';
    }

    return 'safe';
}

/**
 * هل يجب إرسال إشعار؟
 * — نرسل فقط إذا الحالة الجديدة أسوأ من القديمة أو تغيرت لحالة حرجة
 */
const ALERT_STATUSES   = ['critical', 'danger'];
const STATUS_SEVERITY  = { safe: 0, warning: 1, critical: 2, danger: 3 };

function shouldNotify(newStatus, oldStatus) {
    if (!ALERT_STATUSES.includes(newStatus)) return false;       // الحالة مش حرجة، لا داعي
    const newSeverity = STATUS_SEVERITY[newStatus] ?? 0;
    const oldSeverity = STATUS_SEVERITY[oldStatus] ?? 0;
    return newSeverity > oldSeverity;                            // الحالة اتدهورت
}

/**
 * دالة مراقبة وتحليل الأبراج — تُستدعى عند بدء السيرفر
 */
async function monitorAndAnalyzeTowers() {
    console.log('📡 فحص دوري للأبراج...');
    try {
        const towers = await Tower.find({});
        const notificationService = require('./notification.service');

        for (const tower of towers) {
            try {
                // 1. اجلب البيانات من SNMP / المحاكي
                const metrics = await getTowerMetrics(tower.ip_address);

                // 2. حضّر مدخلات الـ AI
                const inputForAI = [
                    tower.lastMeasurement?.latency    || metrics.latency    || 20,
                    tower.lastMeasurement?.packetLoss || 0.001,
                    tower.lastMeasurement?.jitter     || 2,
                    tower.lastMeasurement?.throughput || metrics.throughput || 100
                ];

                // 3. شغّل الـ AI
                const prediction = await ai.predict(inputForAI);

                // 4. حدد الحالة الجديدة
                const newStatus = determineTowerStatus(prediction, tower.lastMeasurement);
                const oldStatus = tower.status;

                // 5. حدّث قاعدة البيانات
                const updatedTower = await Tower.findByIdAndUpdate(
                    tower._id,
                    { status: newStatus, lastCheck: new Date() },
                    { new: true }
                );

                console.log(`🗼 ${tower.TowerName}: ${oldStatus} → ${newStatus}`);

                // 6. أرسل إشعار لو الحالة اتدهورت لـ critical أو danger
                if (shouldNotify(newStatus, oldStatus)) {
                    console.log(`🔔 إرسال إشعارات للبرج "${tower.TowerName}" (الحالة: ${newStatus})`);
                    notificationService.notifyAdmins(updatedTower, newStatus);
                }

            } catch (towerErr) {
                console.error(`❌ فشل فحص البرج "${tower.TowerName}":`, towerErr.message);
            }
        }

    } catch (err) {
        console.error('❌ خطأ في دورة المراقبة:', err.message);
    }
}

/**
 * تسجيل برج جديد للمراقبة — سيُفحص في الدورة القادمة
 */
const startMonitoringTower = (newTower) => {
    console.log(`📡 بدء مراقبة البرج الجديد: ${newTower.TowerName} — ${newTower.ip_address}`);
};

module.exports = { monitorAndAnalyzeTowers, startMonitoringTower };