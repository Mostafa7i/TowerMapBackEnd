const snmp = require("net-snmp");

/**
 * 🕹️ لوحة التحكم في المحاكي
 * ---------------------------------------
 * SIMULATION_MODE:
 * - true  => النظام هيشتغل بيانات وهمية (للمناقشة بدون إنترنت).
 * - false => النظام هيحاول يكلم أبراج حقيقية بجد بالـ IP.
 * * TOWER_IS_ALIVE:
 * - true  => البرج شغال (بيانات سليمة).
 * - false => البرج واقع (بيانات كارثية عشان الـ AI يقلب Danger).
 */
const SIMULATION_MODE = true;
const TOWER_IS_ALIVE = true;

const getTowerMetrics = (towerIp) => {
  return new Promise((resolve, reject) => {
    // 1. 🎭 فحص هل إنت شغال وضع المحاكي؟
    if (SIMULATION_MODE) {
      console.log(`🛠️ [محاكي] يتم الآن توليد بيانات لبرج: ${towerIp}`);

      if (!TOWER_IS_ALIVE) {
        // 🚨 سيناريو "الخطر" (البرج مقفول)
        // الأرقام دي هتخلي الـ AI يصرخ ويقول Danger
        return resolve({
          temperature: 95, // حرارة عالية جداً
          throughput: 0, // مفيش داتا بتعدي
          latency: 1200, // تأخير ضخم
          isOffline: true, // علامة إن البرج واقع
        });
      }

// ✅ سيناريو "الأمان" (البرج شغال تمام ومتوافق مع عقل الـ AI)
      return resolve({
        temperature: 35, // درجة حرارة عادية
        throughput: 100, // القيمة اللي الـ AI اتدرب عليها كأمان
        latency: 600, // القيمة اللي الـ AI اتدرب عليها كأمان
        isOffline: false,
      });
    }

    // 2. 🔌 لو مش محاكي، السيستم هيكلم SNMP حقيقي (لو الدوكر شغال)
    const session = snmp.createSession(towerIp, "public", {
      timeout: 2000, // وقت الانتظار قبل ما يقرر إن البرج واقع
      retries: 1,
    });

    const oids = {
      temp: "1.3.6.1.4.1.2021.13.16.2.1.3.1",
      throughput: "1.3.6.1.2.1.2.2.1.10.1",
      latency: "1.3.6.1.2.1.1.3.0",
    };

    session.get(Object.values(oids), (error, varbinds) => {
      if (error) {
        // لو البرج حقيقي ومردش، بنرجع بيانات "Danger" أوتوماتيك
        console.warn(
          `⚠️ البرج الحقيقي ${towerIp} لا يستجيب، نرسل بيانات طوارئ.`,
        );
        resolve({
          temperature: 0,
          throughput: 0,
          latency: 1000,
          isOffline: true,
        });
      } else {
        resolve({
          temperature: varbinds[0].value || 40,
          throughput: varbinds[1].value || 500,
          latency: 20,
          isOffline: false,
        });
      }
      session.close();
    });
  });
};

module.exports = { getTowerMetrics };
