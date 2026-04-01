const nodemailer = require('nodemailer');
const twilio = require('twilio');
const User = require('../models/user.models');

// ─── إعداد Nodemailer ────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ─── إعداد Twilio (SMS + WhatsApp) ──────────────────────────────────────────
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

// ─── ألوان ورموز بحسب الحالة ──────────────────────────────────────────────
const STATUS_META = {
    critical: {
        emoji: '⚠️',
        label: 'حرجة',
        color: '#FF8C00',
        subject: `⚠️ تحذير: برج في حالة حرجة`
    },
    danger: {
        emoji: '🚨',
        label: 'خطر',
        color: '#FF0000',
        subject: `🚨 عاجل: برج في حالة خطر`
    }
};

/**
 * إرسال بريد إلكتروني للمديرين
 * @param {Object} tower - بيانات البرج
 * @param {Array} admins - قائمة المديرين
 * @param {string} status - 'critical' | 'danger'
 */
const sendEmailAlert = async (tower, admins, status = 'danger') => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.log('⚠️ خدمة الإيميل معطلة: EMAIL_USER أو EMAIL_PASS غير موجودة في .env');
            return;
        }

        const meta = STATUS_META[status] || STATUS_META.danger;
        const emails = admins.map(admin => admin.email).join(',');

        const mailOptions = {
            from: `"TowerMap Alerts 📡" <${process.env.EMAIL_USER}>`,
            to: emails,
            subject: `${meta.subject} — ${tower.TowerName}`,
            html: `
                <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: auto; border: 2px solid ${meta.color}; border-radius: 10px; padding: 24px;">
                    <h2 style="color: ${meta.color};">${meta.emoji} تنبيه: برج في حالة ${meta.label}</h2>
                    <p>تم اكتشاف مشكلة في البرج التالي، يرجى التصرف فوراً:</p>
                    <table style="width:100%; border-collapse:collapse; margin-top:12px;">
                        <tr style="background:#f5f5f5;"><td style="padding:8px; font-weight:bold;">اسم البرج</td><td style="padding:8px;">${tower.TowerName}</td></tr>
                        <tr><td style="padding:8px; font-weight:bold;">عنوان IP</td><td style="padding:8px;">${tower.ip_address}</td></tr>
                        <tr style="background:#f5f5f5;"><td style="padding:8px; font-weight:bold;">المزود</td><td style="padding:8px;">${tower.vendor || 'غير محدد'}</td></tr>
                        <tr><td style="padding:8px; font-weight:bold;">الحالة</td><td style="padding:8px; color:${meta.color}; font-weight:bold;">${meta.label.toUpperCase()}</td></tr>
                        <tr style="background:#f5f5f5;"><td style="padding:8px; font-weight:bold;">Latency</td><td style="padding:8px;">${tower.lastMeasurement?.latency ?? 'N/A'} ms</td></tr>
                        <tr><td style="padding:8px; font-weight:bold;">Packet Loss</td><td style="padding:8px;">${tower.lastMeasurement?.packetLoss ?? 'N/A'}%</td></tr>
                        <tr style="background:#f5f5f5;"><td style="padding:8px; font-weight:bold;">Jitter</td><td style="padding:8px;">${tower.lastMeasurement?.jitter ?? 'N/A'} ms</td></tr>
                        <tr><td style="padding:8px; font-weight:bold;">Throughput</td><td style="padding:8px;">${tower.lastMeasurement?.throughput ?? 'N/A'} Mbps</td></tr>
                        <tr style="background:#f5f5f5;"><td style="padding:8px; font-weight:bold;">آخر فحص</td><td style="padding:8px;">${tower.lastCheck ? new Date(tower.lastCheck).toLocaleString('ar-EG') : 'N/A'}</td></tr>
                    </table>
                    <p style="margin-top:20px; color:#555;">يرجى من الإدارة التوجه لفحص المشكلة في أقرب وقت ممكن.</p>
                    <hr style="border-color:#eee; margin-top:20px;" />
                    <p style="font-size:12px; color:#999;">TowerMap Monitoring System — رسالة تلقائية</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 تم إرسال تنبيه الإيميل بنجاح لـ ${admins.length} مديرين (الحالة: ${status}).`);
    } catch (error) {
        console.error('❌ فشل إرسال بريد التنبيه:', error.message);
    }
};

/**
 * إرسال رسالة SMS للمديرين
 * @param {Object} tower - بيانات البرج
 * @param {Array} admins - قائمة المديرين
 * @param {string} status - 'critical' | 'danger'
 */
const sendSMSAlert = async (tower, admins, status = 'danger') => {
    try {
        if (!process.env.TWILIO_ACCOUNT_SID) {
            console.log('⚠️ خدمة SMS معطلة: بيانات Twilio غير موجودة في .env');
            return;
        }

        const meta = STATUS_META[status] || STATUS_META.danger;
        const messageBody = `${meta.emoji} [TowerMap] برج "${tower.TowerName}" في حالة ${meta.label}!\nIP: ${tower.ip_address}\nLatency: ${tower.lastMeasurement?.latency ?? 'N/A'} ms | PacketLoss: ${tower.lastMeasurement?.packetLoss ?? 'N/A'}%\nيرجى الفحص فوراً.`;

        for (const admin of admins) {
            if (admin.phone) {
                await twilioClient.messages.create({
                    body: messageBody,
                    from: twilioPhoneNumber,
                    to: admin.phone
                });
            }
        }
        console.log(`📱 تم إرسال رسائل SMS بنجاح لـ ${admins.length} مديرين (الحالة: ${status}).`);
    } catch (error) {
        console.error('❌ فشل إرسال رسالة SMS:', error.message);
    }
};

/**
 * إرسال رسالة WhatsApp للمديرين عبر Twilio WhatsApp API
 * @param {Object} tower - بيانات البرج
 * @param {Array} admins - قائمة المديرين
 * @param {string} status - 'critical' | 'danger'
 */
const sendWhatsAppAlert = async (tower, admins, status = 'danger') => {
    try {
        if (!process.env.TWILIO_ACCOUNT_SID) {
            console.log('⚠️ خدمة WhatsApp معطلة: بيانات Twilio غير موجودة في .env');
            return;
        }

        const meta = STATUS_META[status] || STATUS_META.danger;
        const messageBody =
            `${meta.emoji} *تنبيه TowerMap*\n\n` +
            `البرج *${tower.TowerName}* في حالة *${meta.label.toUpperCase()}*\n\n` +
            `📍 IP: ${tower.ip_address}\n` +
            `🏭 المزود: ${tower.vendor || 'غير محدد'}\n` +
            `⏱ Latency: ${tower.lastMeasurement?.latency ?? 'N/A'} ms\n` +
            `📉 Packet Loss: ${tower.lastMeasurement?.packetLoss ?? 'N/A'}%\n` +
            `📊 Throughput: ${tower.lastMeasurement?.throughput ?? 'N/A'} Mbps\n\n` +
            `يرجى التصرف الفوري.`;

        let sentCount = 0;
        for (const admin of admins) {
            if (admin.phone) {
                // رقم الهاتف بصيغة دولية، مثال: +201012345678
                const toWhatsApp = `whatsapp:${admin.phone}`;
                await twilioClient.messages.create({
                    body: messageBody,
                    from: twilioWhatsAppFrom,
                    to: toWhatsApp
                });
                sentCount++;
            }
        }
        console.log(`💬 تم إرسال رسائل WhatsApp بنجاح لـ ${sentCount} مديرين (الحالة: ${status}).`);
    } catch (error) {
        console.error('❌ فشل إرسال رسالة WhatsApp:', error.message);
        // لا نوقف العملية لو فشل WhatsApp
    }
};

/**
 * الدالة الرئيسية لإرسال كل الإشعارات
 * @param {Object} tower - بيانات البرج
 * @param {string} status - 'critical' | 'danger'
 */
const notifyAdmins = async (tower, status = 'danger') => {
    try {
        const admins = await User.find({ isAdmin: true });

        if (!admins || admins.length === 0) {
            console.log('⚠️ لم يتم العثور على مديرين لإرسال الإشعارات.');
            return;
        }

        const meta = STATUS_META[status] || STATUS_META.danger;
        console.log(`🚀 بدء إرسال الإشعارات — البرج: "${tower.TowerName}" — الحالة: ${meta.label.toUpperCase()}`);

        // إرسال الثلاث قنوات بالتوازي
        await Promise.allSettled([
            sendEmailAlert(tower, admins, status),
            sendSMSAlert(tower, admins, status),
            sendWhatsAppAlert(tower, admins, status)
        ]);

        console.log(`✅ اكتمل إرسال جميع الإشعارات للبرج "${tower.TowerName}".`);
    } catch (error) {
        console.error('❌ حدث خطأ أثناء إعلام المديرين:', error.message);
    }
};

module.exports = {
    notifyAdmins,
    sendEmailAlert,
    sendSMSAlert,
    sendWhatsAppAlert
};
