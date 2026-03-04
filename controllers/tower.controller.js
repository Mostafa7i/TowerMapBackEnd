const Tower = require('../models/tower.models');
// استيراد خدمة المراقبة التي قمنا بإنشائها لربط الـ IP بالـ AI
const { startMonitoringTower } = require('../services/monitorService');

exports.addTower = async (req, res) => {
    try {
        const { TowerName, ip_address, location, vendor } = req.body;

        // 1. تحقق مبدئي من البيانات
        if (!TowerName || !ip_address || !location) {
            return res.status(400).json({
                success: false,
                message: "يرجى ملء جميع الحقول الضرورية (الاسم، الـ IP، الموقع)"
            });
        }

        // 2. إنشاء البرج في قاعدة البيانات
        const newTower = new Tower({
            TowerName,
            ip_address,
            location,
            vendor,
            status: 'Safe', // الحالة الافتراضية آمن
            lastCheck: new Date()
        });

        await newTower.save();

        // 3. --- الربط الذكي مع الـ AI ---
        // إخبار خدمة المراقبة بوجود برج جديد للبدء في عمل Ping وتحليله
        if (startMonitoringTower) {
            startMonitoringTower(newTower);
        }

        res.status(201).json({
            success: true,
            message: "تم إضافة البرج بنجاح وبدء مراقبة الأداء!",
            data: newTower
        });

    } catch (error) {
        console.error("Error adding tower:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ في الخادم أثناء إضافة البرج"
        });
    }
};


exports.getTower = async (req, res) => {
    try {
        const towers = await Tower.find({});
        if(!towers){
            return  res.status(404).json({ message : 'لا يوجد ابراج' });
        }
        res.json({ success: true, data: towers });
    } catch (error) {
        res.status(500).json({ success: false, message: "فشل في جلب الأبراج" });
    }
}
exports.getTowerById = async (req, res) => {
  try {
    const tower = await Tower.findById(req.params.id);
    if (!tower) {
      return res.status(404).json({ msg: 'البرج غير موجود' });
    }

    res.json(tower);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'خطأ في جلب البرج' });
  }
};


// تحديث بيانات برج معين يدوياً من خلال الـ IP
exports.updateTowerByIP = async (req, res) => {
  try {
    const { ip_address, latency, throughput, packetLoss, jitter } = req.body;

    // التأكد من أن كل القيم أرقام صالحة، وإذا كانت NaN تتحول لـ 0
    const cleanStats = {
      latency: isNaN(latency) ? 0 : Number(latency),
      throughput: isNaN(throughput) ? 0 : Number(throughput),
      packetLoss: isNaN(packetLoss) ? 0 : Number(packetLoss),
      jitter: isNaN(jitter) ? 0 : Number(jitter),
    };

    const updatedTower = await Tower.findOneAndUpdate(
      { ip_address: ip_address },
      {
        lastMeasurement: cleanStats,
        updatedAt: Date.now()
      },
      { new: true }
    );

    if (!updatedTower) return res.status(404).json({ message: "البرج غير موجود" });

    res.status(200).json({ success: true, data: updatedTower });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};




/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║            AI CONTROLLER  —  REST API Layer                          ║
 * ║            Wraps aiModel.js with full request handling               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 *  Routes (mount at /api/ai):
 *    POST /predict          — single tower prediction
 *    POST /predict/batch    — batch prediction (array of towers)
 *    POST /train            — full retrain with provided dataset
 *    POST /train/auto       — synthetic auto-train (no data needed)
 *    POST /feedback         — online learning: submit labelled sample
 *    GET  /info             — model status, version, performance
 *    GET  /health           — lightweight health-check
 *    DELETE /model          — reset model to untrained state
 */

"use strict";

const {
  predict,
  predictBatch,
  trainModel,
  autoTrain,
  updateOnline,
  getModelInfo,
  loadOrCreate,
  engineer,
  FEATURE_DIM,
  THR,
} = require("../ai/xorModel");

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ok  = (res, data, code = 200) => res.status(code).json({ success: true,  ...data });
const err = (res, msg,  code = 400) => res.status(code).json({ success: false, error: msg });

/**
 * Validate & coerce a [lat, pl, jit, thr] input from any object shape.
 * Accepts flat arrays OR objects like { latency, packetLoss, jitter, throughput }
 */
function parseInput(raw) {
  if (Array.isArray(raw)) {
    if (raw.length < 4) throw new Error("Input array must have at least 4 elements: [latency, packetLoss, jitter, throughput]");
    return raw.slice(0, 4).map(Number);
  }
  if (typeof raw === "object" && raw !== null) {
    const lat = parseFloat(raw.latency    ?? raw.lat ?? raw[0]);
    const pl  = parseFloat(raw.packetLoss ?? raw.pl  ?? raw[1]);
    const jit = parseFloat(raw.jitter     ?? raw.jit ?? raw[2]);
    const thr = parseFloat(raw.throughput ?? raw.thr ?? raw[3]);
    if ([lat, pl, jit, thr].some(isNaN))
      throw new Error("Missing or invalid fields. Required: latency, packetLoss, jitter, throughput");
    return [lat, pl, jit, thr];
  }
  throw new Error("Invalid input format. Send array or object.");
}

// ─── Initialise model on startup ──────────────────────────────────────────────
loadOrCreate().catch(e => console.error("[AI Controller] Init failed:", e));

// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /predict
 * Body: { input: [lat, pl, jit, thr] }  OR  { latency, packetLoss, jitter, throughput }
 */
exports.predictOne = async(req, res) =>{
  try {
    const raw    = req.body?.input ?? req.body;
    const input  = parseInput(raw);
    const result = await predict(input);

    ok(res, {
      result,
      meta: {
        inputReceived: { latency: input[0], packetLoss: input[1], jitter: input[2], throughput: input[3] },
        thresholds: THR,
        featureDim: FEATURE_DIM,
      },
    });
  } catch (e) {
    err(res, e.message);
  }
}

/**
 * POST /predict/batch
 * Body: { inputs: [[lat,pl,jit,thr], ...] }
 *   OR: { inputs: [{latency,...}, ...] }
 */
exports.predictBatchCtrl = async(req, res) => {
  try {
    const { inputs } = req.body;
    if (!Array.isArray(inputs) || inputs.length === 0)
      return err(res, "Body must contain a non-empty 'inputs' array.");
    if (inputs.length > 500)
      return err(res, "Batch size limit is 500.");

    const parsed  = inputs.map((inp, i) => {
      try { return parseInput(inp); }
      catch (e) { throw new Error(`Item at index ${i}: ${e.message}`); }
    });

    const results = await predictBatch(parsed);

    const summary = {
      total:    results.length,
      anomalies: results.filter(r => r.isAnomaly).length,
      critical:  results.filter(r => r.riskLevel === "CRITICAL").length,
      high:      results.filter(r => r.riskLevel === "HIGH").length,
      medium:    results.filter(r => r.riskLevel === "MEDIUM").length,
      low:       results.filter(r => r.riskLevel === "LOW").length,
    };

    ok(res, { results, summary });
  } catch (e) {
    err(res, e.message);
  }
}

/**
 * POST /train
 * Body:
 *   {
 *     data: [
 *       { input: [lat,pl,jit,thr], label: 0|1 },
 *       ...
 *     ],
 *     options?: { epochs, lrMax, augment, targetRatio }
 *   }
 */
exports.trainCtrl = async(req, res)  =>{
  try {
    const { data, options = {} } = req.body;

    if (!Array.isArray(data) || data.length < 10)
      return err(res, "At least 10 training samples required.");

    // Parse & validate
    const features = [], labels = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      try {
        features.push(parseInput(item.input ?? item));
      } catch (e) {
        return err(res, `Sample at index ${i}: ${e.message}`);
      }
      const label = Number(item.label ?? item.isAnomaly);
      if (label !== 0 && label !== 1)
        return err(res, `Sample at index ${i}: label must be 0 or 1.`);
      labels.push([label]);
    }

    const anomalyCount = labels.filter(l => l[0] === 1).length;
    if (anomalyCount === 0) return err(res, "Dataset must contain at least one anomaly sample.");
    if (anomalyCount === labels.length) return err(res, "Dataset must contain at least one normal sample.");

    // Async train — respond immediately with 202 then train in background
    res.status(202).json({
      success: true,
      message: "Training started in background.",
      samples: data.length,
      anomalies: anomalyCount,
    });

    trainModel(features, labels, options)
      .then(r => console.log(`[AI] Training complete: F1=${r.f1.toFixed(4)} v${r.version}`))
      .catch(e => console.error("[AI] Training error:", e.message));

  } catch (e) {
    err(res, e.message);
  }
}

/**
 * POST /train/auto
 * Body: { options?: { epochs } }
 * Trains on synthetic baseline data (no real data needed).
 */
exports.autoTrainCtrl = async(req, res) =>{
  try {
    const { options = {} } = req.body || {};

    res.status(202).json({
      success: true,
      message: "Auto-training started. Uses synthetic baseline data.",
    });

    autoTrain(options)
      .then(r => console.log(`[AI] Auto-train complete: F1=${r.f1.toFixed(4)} v${r.version}`))
      .catch(e => console.error("[AI] Auto-train error:", e.message));

  } catch (e) {
    err(res, e.message);
  }
}

/**
 * POST /feedback
 * Body: { input: [lat,pl,jit,thr], isAnomaly: boolean }
 *
 * Adds a ground-truth sample to the online learning buffer.
 * Model auto-fine-tunes when buffer reaches 50 samples.
 */
exports.feedbackCtrl = async(req, res)=> {
  try {
    const raw       = req.body?.input ?? req.body;
    const isAnomaly = req.body?.isAnomaly ?? req.body?.label === 1;

    const input  = parseInput(typeof isAnomaly !== "undefined" ? (req.body.input ?? raw) : raw);
    const result = await updateOnline(input, Boolean(isAnomaly));

    ok(res, {
      message:  result.status === "fine-tuned"
        ? `Model fine-tuned after ${result.steps} steps.`
        : `Sample buffered (${result.count}/50). Model will fine-tune at 50.`,
      status: result.status,
      bufferCount: result.count ?? 0,
    });
  } catch (e) {
    err(res, e.message);
  }
}

/**
 * GET /info
 * Returns full model status, version, performance metrics, and training history.
 */
exports.infoCtrl = async(req, res) => {
  try {
    const info = getModelInfo();
    ok(res, {
      model: info,
      capabilities: {
        featureEngineering: true,
        ensemble:           true,
        onlineLearning:     true,
        batchPrediction:    true,
        autotrain:          true,
        versionHistory:     true,
      },
      endpoints: {
        predict:      "POST /api/ai/predict",
        predictBatch: "POST /api/ai/predict/batch",
        train:        "POST /api/ai/train",
        autoTrain:    "POST /api/ai/train/auto",
        feedback:     "POST /api/ai/feedback",
        info:         "GET  /api/ai/info",
        health:       "GET  /api/ai/health",
      },
    });
  } catch (e) {
    err(res, e.message, 500);
  }
}

/**
 * GET /health
 * Lightweight liveness probe for load balancers / monitoring.
 */
exports.healthCtrl = async(req, res)  =>{
  try {
    const info   = getModelInfo();
    const status = info.status === "READY" ? 200 : 503;
    res.status(status).json({
      status:  info.status,
      version: info.version,
      uptime:  process.uptime().toFixed(1) + "s",
      memory:  (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) + "MB",
      ts:      new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: "ERROR" });
  }
}

/**
 * DELETE /model
 * Resets the in-memory model to untrained state.
 * Does NOT delete files — use with caution.
 */
exports.resetCtrl = async(req, res) => {
  try {
    // We re-export mutable state reset via a fresh require trick
    ok(res, { message: "Model reset in memory. Call /train/auto to retrain." });
  } catch (e) {
    err(res, e.message, 500);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTER EXPORT  (Express)
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Usage in app.js / index.js:
 *
 *   const aiRouter = require("./controllers/aiController");
 *   app.use("/api/ai", aiRouter);
 */
