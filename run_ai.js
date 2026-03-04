/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          NETWORK AI TRAINING SCRIPT  —  v4.0                        ║
 * ║          متوافق مع aiModel.js (Ensemble + Feature Engineering)      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const ai = require("./ai/xorModel");

// ══════════════════════════════════════════════════════════════════════════════
// TRAINING DATASET
// ══════════════════════════════════════════════════════════════════════════════
// Format: [latency(ms), packetLoss(%), jitter(ms), throughput(Mbps)]
// ملحوظة: النموذج الجديد بيعمل Feature Engineering تلقائياً — بعت القيم الخام
// ══════════════════════════════════════════════════════════════════════════════

const TRAINING_DATA = [

  // ─── شبكة سليمة تماماً (label: 0) ────────────────────────────────────────
  { input: [10,  0.0,   0.5, 120], label: 0 },   // أداء مثالي
  { input: [15,  0.0,   1.0, 110], label: 0 },
  { input: [20,  0.001, 2.0, 100], label: 0 },
  { input: [25,  0.001, 1.5, 105], label: 0 },
  { input: [28,  0.001, 1.8, 102], label: 0 },
  { input: [30,  0.002, 3.0,  95], label: 0 },
  { input: [35,  0.001, 2.5,  98], label: 0 },
  { input: [40,  0.002, 4.0,  88], label: 0 },
  { input: [45,  0.003, 5.0,  82], label: 0 },
  { input: [50,  0.004, 6.0,  76], label: 0 },
  { input: [55,  0.003, 5.5,  79], label: 0 },
  { input: [60,  0.004, 6.5,  74], label: 0 },

  // ─── شبكة على الحدود (borderline) — لا تزال طبيعية (label: 0) ──────────
  { input: [70,  0.008, 10,   60], label: 0 },
  { input: [75,  0.01,  12,   55], label: 0 },
  { input: [80,  0.015, 14,   52], label: 0 },
  { input: [85,  0.02,  15,   50], label: 0 },

  // ─── تحذير خفيف — بدأت المشاكل (label: 1) ───────────────────────────────
  { input: [100, 0.03,  18,   45], label: 1 },
  { input: [120, 0.04,  20,   40], label: 1 },
  { input: [130, 0.05,  22,   38], label: 1 },
  { input: [150, 0.05,  15,   60], label: 1 },   // latency مرتفع
  { input: [160, 0.06,  25,   35], label: 1 },
  { input: [180, 0.07,  25,   45], label: 1 },
  { input: [200, 0.08,  18,   50], label: 1 },

  // ─── تدهور واضح (label: 1) ───────────────────────────────────────────────
  { input: [250, 0.10,  35,   30], label: 1 },
  { input: [300, 0.10,  20,   40], label: 1 },
  { input: [320, 0.12,  40,   25], label: 1 },
  { input: [350, 0.15,  45,   22], label: 1 },
  { input: [400, 0.18,  50,   18], label: 1 },
  { input: [450, 0.20,  40,   25], label: 1 },

  // ─── هجوم / عطل خطير (label: 1) ─────────────────────────────────────────
  { input: [500, 0.30,  50,   20], label: 1 },
  { input: [600, 0.40,  70,   15], label: 1 },
  { input: [700, 0.40,  90,   10], label: 1 },
  { input: [750, 0.50,  80,    5], label: 1 },
  { input: [800, 0.60,  60,   10], label: 1 },
  { input: [850, 0.70,  90,    4], label: 1 },
  { input: [900, 0.80, 100,    2], label: 1 },

  // ─── انهيار كامل / برج ميت (label: 1) ───────────────────────────────────
  { input: [950,  0.90, 110,   1], label: 1 },
  { input: [999,  0.99, 120,   0], label: 1 },   // برج ميت
  { input: [1000, 0.95, 150, 0.5], label: 1 },
  { input: [999,  1.00, 500,   0], label: 1 },   // إيقاف كامل (Kill)
  { input: [999,  1.00, 500,   0], label: 1 },   // مكرر للتأكيد
];

// ══════════════════════════════════════════════════════════════════════════════
// TEST SCENARIOS  (لا تدخل في التدريب)
// ══════════════════════════════════════════════════════════════════════════════
const TEST_SCENARIOS = [
  { name: "🟢 شبكة مثالية",        data: [22,  0.001, 1.5, 105], expected: "آمنة"         },
  { name: "🟢 أداء طبيعي",         data: [30,  0.001, 3.0,  92], expected: "آمنة"         },
  { name: "🟡 تدهور طفيف",         data: [90,  0.025, 14,   55], expected: "تحذير"        },
  { name: "🟡 حدودي",              data: [75,  0.015, 12,   50], expected: "حدودي"        },
  { name: "🟠 مشكلة متوسطة",       data: [200, 0.08,  25,   45], expected: "خطر متوسط"    },
  { name: "🔴 هجوم DDoS محتمل",   data: [700, 0.40,  90,   10], expected: "خطر شديد"     },
  { name: "🔴 تدهور كبير",         data: [500, 0.35,  60,   12], expected: "خطر"          },
  { name: "💀 انهيار كامل",        data: [999, 1.00, 500,    0], expected: "كارثي"        },
  { name: "💀 شبه ميت",           data: [950, 0.95, 120,    1], expected: "كارثي"        },
  { name: "⚡ سرعة عالية/طبيعي",   data: [18,  0.0,   1.0, 150], expected: "آمنة"         },
];

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function riskBar(prob) {
  const filled = Math.round(prob / 5);
  const empty  = 20 - filled;
  const color  = prob >= 75 ? "🔴" : prob >= 50 ? "🟠" : prob >= 25 ? "🟡" : "🟢";
  return `[${color.repeat(Math.ceil(filled / 4))}${"░".repeat(Math.ceil(empty / 4))}] ${prob}%`;
}

function separator(char = "─", len = 55) {
  return char.repeat(len);
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("\n" + "═".repeat(55));
  console.log("  🧠 SMART NETWORK ANOMALY DETECTION  —  v4.0");
  console.log("  Ensemble DNN + Feature Engineering + SMOTE");
  console.log("═".repeat(55) + "\n");

  // ── فصل الـ features عن الـ labels ──
  const rawFeatures = TRAINING_DATA.map(d => d.input);
  const labels      = TRAINING_DATA.map(d => [d.label]);

  const anomalyCount = labels.filter(l => l[0] === 1).length;
  const normalCount  = labels.filter(l => l[0] === 0).length;

  console.log(`📊 Dataset:`);
  console.log(`   • إجمالي الـ samples : ${TRAINING_DATA.length}`);
  console.log(`   • 🟢 حالة طبيعية    : ${normalCount}`);
  console.log(`   • 🔴 حالة خطر       : ${anomalyCount}`);
  console.log(`   • نسبة الـ anomalies : ${(anomalyCount / TRAINING_DATA.length * 100).toFixed(1)}%`);
  console.log(`\n   ⚙️  الـ model هيعمل SMOTE augmentation تلقائياً للـ balance`);
  console.log(`   ⚙️  Feature engineering: ${ai.FEATURE_DIM} features من 4 raw inputs\n`);

  try {
    // ── التدريب ──
    console.log(separator("─"));
    console.log("🚀 بدء التدريب...\n");

    const startTime = Date.now();

    const result = await ai.trainModel(rawFeatures, labels, {
      epochs:      200,       // النموذج هيعمل Early Stopping تلقائياً
      lrMax:       0.001,     // Cosine Warmup + Decay
      augment:     true,      // SMOTE لتحسين balance
      targetRatio: 0.40,      // هدف 40% anomalies بعد الـ augmentation
      verbose:     true,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + separator("═"));
    console.log("✅ التدريب اكتمل بنجاح!\n");
    console.log(`   ⏱️  الوقت          : ${elapsed}s`);
    console.log(`   📦 الـ version     : v${result.version}`);
    console.log(`   🎯 F1 Score        : ${(result.f1 * 100).toFixed(2)}%`);
    console.log(`   🎯 Precision       : ${(result.metrics.precision * 100).toFixed(2)}%`);
    console.log(`   🎯 Recall          : ${(result.metrics.recall * 100).toFixed(2)}%`);
    console.log(`   🎯 Specificity     : ${(result.metrics.specificity * 100).toFixed(2)}%`);
    console.log(`   🎯 Accuracy        : ${(result.metrics.accuracy * 100).toFixed(2)}%`);
    console.log(`   📍 Threshold       : ${result.threshold}`);
    console.log(`   TP=${result.metrics.tp} FP=${result.metrics.fp} FN=${result.metrics.fn} TN=${result.metrics.tn}`);
    console.log(separator("═") + "\n");

    // ── اختبار السيناريوهات ──
    console.log("🔍 تحليل سيناريوهات الاختبار:\n");

    let correct = 0;
    for (const scenario of TEST_SCENARIOS) {
      const pred = await ai.predict(scenario.data);
      const prob = parseFloat(pred.probability);

      const correct_flag = (
        (prob >= 50 && scenario.expected.includes("خطر")) ||
        (prob >= 50 && scenario.expected.includes("كارثي")) ||
        (prob >= 25 && prob < 50 && scenario.expected.includes("تحذير")) ||
        (prob < 25 && scenario.expected.includes("آمنة")) ||
        (prob >= 25 && prob < 50 && scenario.expected.includes("حدودي"))
      );
      if (correct_flag) correct++;

      console.log(`${scenario.name}`);
      console.log(`   Input    : Lat=${scenario.data[0]}ms  PL=${scenario.data[1]}%  Jit=${scenario.data[2]}ms  Thr=${scenario.data[3]}Mbps`);
      console.log(`   Risk     : ${riskBar(prob)}`);
      console.log(`   Level    : ${pred.riskLevel}   |   Anomaly: ${pred.isAnomaly ? "⚠️ نعم" : "✅ لا"}${pred.hardOverride ? " (Hard Rule)" : ""}`);
      console.log(`   Scores   : A=${pred.subModelScores[0]}  B=${pred.subModelScores[1]}  C=${pred.subModelScores[2]}  → ${pred.rawScore}`);
      console.log(`   Expected : ${scenario.expected}`);

      if (pred.contributions) {
        const c = pred.contributions;
        console.log(`   Contrib  : Lat=${c.latency}  PL=${c.packetLoss}  Jit=${c.jitter}  Thr=${c.throughput}`);
      }
      console.log(separator() + "\n");
    }

    console.log(`📈 دقة التنبؤ على سيناريوهات الاختبار: ${correct}/${TEST_SCENARIOS.length} (${(correct/TEST_SCENARIOS.length*100).toFixed(0)}%)\n`);

    // ── Model info ──
    const info = ai.getModelInfo();
    console.log("📋 معلومات النموذج:");
    console.log(`   Status       : ${info.status}`);
    console.log(`   Version      : v${info.version}`);
    console.log(`   Ensemble     : ${info.ensembleSize} sub-models`);
    console.log(`   Feature Dim  : ${info.featureDim}`);
    console.log(`   Online Buffer: ${info.onlineBuffer} samples`);
    console.log("\n" + "═".repeat(55));
    console.log("  ✅ النظام جاهز لاستقبال البيانات الحية من الأبراج");
    console.log("═".repeat(55) + "\n");

  } catch (e) {
    console.error("\n❌ خطأ:", e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

main();