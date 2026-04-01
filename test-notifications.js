/**
 * اختبار نظام الإشعارات — Email + SMS + WhatsApp
 * التشغيل: node test-notifications.js
 */
require('dotenv').config();
const { notifyAdmins, sendEmailAlert, sendSMSAlert, sendWhatsAppAlert } = require('./services/notification.service');

// بيانات برج وهمية للاختبار
const mockTower = {
    TowerName: 'برج الاختبار - Cairo North',
    ip_address: '192.168.1.100',
    vendor: 'Huawei',
    status: 'critical',
    lastMeasurement: {
        latency: 180,
        packetLoss: 8,
        jitter: 12,
        throughput: 45
    },
    lastCheck: new Date()
};

// مديرين وهميين للاختبار
const mockAdmins = [
    {
        fullName: 'Admin Test',
        email: process.env.EMAIL_USER || 'test@example.com',
        phone: '+201551440727'   // ← غيّر لرقمك الحقيقي للاختبار
    }
];

async function runTest() {
    console.log('🧪 بدء اختبار نظام الإشعارات...\n');

    // ── اختبار 1: Email فقط ─────────────────────────────────────────────────
    console.log('--- اختبار 1: Email (critical) ---');
    await sendEmailAlert(mockTower, mockAdmins, 'critical');

    // ── اختبار 2: WhatsApp فقط ──────────────────────────────────────────────
    console.log('\n--- اختبار 2: WhatsApp (critical) ---');
    await sendWhatsAppAlert(mockTower, mockAdmins, 'critical');

    // ── اختبار 3: SMS فقط ───────────────────────────────────────────────────
    console.log('\n--- اختبار 3: SMS (danger) ---');
    const dangerTower = { ...mockTower, status: 'danger', lastMeasurement: { latency: 450, packetLoss: 20, jitter: 30, throughput: 5 } };
    await sendSMSAlert(dangerTower, mockAdmins, 'danger');

    // ── اختبار 4: كل القنوات دفعة واحدة (يحتاج DB) ──────────────────────────
    // console.log('\n--- اختبار 4: notifyAdmins (يحتاج اتصال MongoDB) ---');
    // await notifyAdmins(mockTower, 'critical');

    console.log('\n✅ اكتملت الاختبارات.');
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ فشل الاختبار:', err.message);
    process.exit(1);
});
