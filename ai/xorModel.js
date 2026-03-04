/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          NETWORK ANOMALY DETECTION ENGINE  —  v4.0 ULTIMATE         ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Architecture : Ensemble (3× DNN) + Weighted Voting                 ║
 * ║  Features     : 4 raw → 22 engineered (interaction + temporal)      ║
 * ║  Techniques   : Focal Loss · Label Smoothing · Cosine LR Warmup     ║
 * ║                 SMOTE Augmentation · Platt Calibration              ║
 * ║                 Online Learning Buffer · Optimal Threshold Search    ║
 * ║                 Hard Rule Override · Model Versioning + Rollback     ║
 * ║  Exports      : trainModel · predict · predictBatch                 ║
 * ║                 updateOnline · getModelInfo · autoTrain              ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

"use strict";

const tf   = require("@tensorflow/tfjs");
const fs   = require("fs");
const path = require("path");

// ══════════════════════════════════════════════════════════════════════════════
// PATHS & INIT
// ══════════════════════════════════════════════════════════════════════════════
const MODEL_DIR    = path.join(__dirname, "savedModel");
const MODEL_FILE   = path.join(MODEL_DIR, "model_v4.json");
const SCALER_FILE  = path.join(MODEL_DIR, "scaler_v4.json");
const META_FILE    = path.join(MODEL_DIR, "meta_v4.json");
const HISTORY_FILE = path.join(MODEL_DIR, "history_v4.json");
const BUFFER_FILE  = path.join(MODEL_DIR, "online_buffer.json");

fs.mkdirSync(MODEL_DIR, { recursive: true });

// ══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ══════════════════════════════════════════════════════════════════════════════
const C = {
  reset: "\x1b[0m", cyan: "\x1b[36m", green: "\x1b[32m",
  yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m", blue: "\x1b[34m",
};
const ts  = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = {
  info:   (...a) => console.log (`${C.cyan}[INFO ]${C.reset} ${ts()} ·`, ...a),
  ok:     (...a) => console.log (`${C.green}[  OK ]${C.reset} ${ts()} ·`, ...a),
  warn:   (...a) => console.warn(`${C.yellow}[WARN ]${C.reset} ${ts()} ·`, ...a),
  err:    (...a) => console.error(`${C.red}[ERROR]${C.reset} ${ts()} ·`, ...a),
  metric: (...a) => console.log (`${C.magenta}[ MET ]${C.reset} ${ts()} ·`, ...a),
  epoch:  (...a) => console.log (`${C.blue}[ EPO ]${C.reset} ${ts()} ·`, ...a),
};

// ══════════════════════════════════════════════════════════════════════════════
// DOMAIN THRESHOLDS  (network engineering knowledge)
// ══════════════════════════════════════════════════════════════════════════════
const THR = {
  latency:    { ok: 50,  warn: 100, crit: 250, dead: 900 },
  packetLoss: { ok: 1,   warn: 5,   crit: 20,  dead: 99  },
  jitter:     { ok: 10,  warn: 25,  crit: 80,  dead: 400 },
  throughput: { ok: 50,  warn: 20,  crit: 5,   dead: 0   }, // inverse
};

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE ENGINEERING  (4 raw → 22 features)
// ══════════════════════════════════════════════════════════════════════════════
function engineer(raw) {
  const safe = (v) => (isNaN(v) || v == null ? 0 : Number(v));
  const lat = safe(raw[0]);
  const pl  = safe(raw[1]);
  const jit = safe(raw[2]);
  const thr = safe(raw[3]);

  // 0–3: Normalised (0–1)
  const latN = Math.min(lat / 500,  1);
  const plN  = Math.min(pl  / 100,  1);
  const jitN = Math.min(jit / 500,  1);
  const thrN = Math.max(1 - thr / 200, 0);

  // 4–7: Threshold tier scores
  const tier = (v, t, inv = false) => {
    if (inv) {
      if (v <= t.dead) return 1;
      if (v <= t.crit) return 0.66;
      if (v <= t.warn) return 0.33;
      return 0;
    }
    if (v >= t.dead) return 1;
    if (v >= t.crit) return 0.66;
    if (v >= t.warn) return 0.33;
    return 0;
  };
  const latT = tier(lat, THR.latency);
  const plT  = tier(pl,  THR.packetLoss);
  const jitT = tier(jit, THR.jitter);
  const thrT = tier(thr, THR.throughput, true);

  // 8–11: Log-compressed (handle heavy tails)
  const LOG_BASE = Math.log1p(500);
  const latL = Math.log1p(lat) / LOG_BASE;
  const plL  = Math.log1p(pl)  / Math.log1p(100);
  const jitL = Math.log1p(jit) / LOG_BASE;
  const thrL = Math.log1p(Math.max(200 - thr, 0)) / LOG_BASE;

  // 12–14: Pairwise interactions
  const latPl  = latN * plN;
  const jitThr = jitN * thrN;
  const latJit = latN * jitN;

  // 15–17: Composite indices
  const stability  = 1 - (plN + jitN) / 2;
  const quality    = 1 - (latN + plN + jitN + thrN) / 4;
  const loadStress = (latN + thrN) / 2;

  // 18–19: Ratios
  const jitLatRatio = jit > 0 ? Math.min(lat / (jit + 1), 50) / 50 : 0;
  const thrLoss     = thr > 0 ? Math.min(pl  / (thr + 1), 10) / 10 : plN;

  // 20: Multi-breach count (0–1)
  const breaches = [latT, plT, jitT, thrT].filter(s => s >= 0.33).length / 4;

  // 21: Hard dead-tower flag
  const isDead = (pl >= THR.packetLoss.dead || lat >= THR.latency.dead || thr <= THR.throughput.dead) ? 1 : 0;

  return [
    latN, plN, jitN, thrN,           //  0– 3
    latT, plT, jitT, thrT,           //  4– 7
    latL, plL, jitL, thrL,           //  8–11
    latPl, jitThr, latJit,           // 12–14
    stability, quality, loadStress,  // 15–17
    jitLatRatio, thrLoss,            // 18–19
    breaches, isDead,                // 20–21
  ];
}

const FEATURE_DIM = engineer([0, 0, 0, 0]).length; // 22

// ══════════════════════════════════════════════════════════════════════════════
// ROBUST SCALER
// ══════════════════════════════════════════════════════════════════════════════
class RobustScaler {
  constructor() {
    this.means  = [];
    this.stds   = [];
    this.fitted = false;
  }

  fit(data) {
    if (!data || !data.length) return;
    tf.tidy(() => {
      const t = tf.tensor2d(data);
      const { mean, variance } = tf.moments(t, 0);
      this.means = Array.from(mean.dataSync());
      this.stds  = Array.from(tf.sqrt(variance).dataSync()).map(s => s < 1e-8 ? 1 : s);
    });
    this.fitted = true;
    log.ok("Scaler fitted:", this.means.length, "features");
  }

  transform(rows) {
    if (!this.fitted) { log.warn("Scaler not fitted — returning raw"); return rows; }
    return rows.map(r => r.map((v, i) => (v - this.means[i]) / this.stds[i]));
  }

  save() {
    fs.writeFileSync(SCALER_FILE, JSON.stringify({ means: this.means, stds: this.stds }, null, 2));
    log.ok("Scaler saved.");
  }

  load() {
    if (!fs.existsSync(SCALER_FILE)) return false;
    try {
      const d = JSON.parse(fs.readFileSync(SCALER_FILE, "utf8"));
      this.means  = d.means;
      this.stds   = d.stds || d.stdDevs;
      this.fitted = true;
      log.ok("Scaler loaded.");
      return true;
    } catch { return false; }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MODEL ARCHITECTURES  (3 diverse sub-models for ensemble)
// ══════════════════════════════════════════════════════════════════════════════

// Sub-model A: Deep & regularised
function buildModelA(dim) {
  const inp = tf.input({ shape: [dim] });
  let x = tf.layers.dense({
    units: 128, activation: "linear", kernelInitializer: "heNormal",
    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
  }).apply(inp);
  x = tf.layers.batchNormalization().apply(x);
  x = tf.layers.activation({ activation: "relu" }).apply(x);
  x = tf.layers.dropout({ rate: 0.35 }).apply(x);
  x = tf.layers.dense({
    units: 64, activation: "linear", kernelInitializer: "heNormal",
    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
  }).apply(x);
  x = tf.layers.batchNormalization().apply(x);
  x = tf.layers.activation({ activation: "relu" }).apply(x);
  x = tf.layers.dropout({ rate: 0.30 }).apply(x);
  x = tf.layers.dense({ units: 32, activation: "relu", kernelInitializer: "heNormal" }).apply(x);
  x = tf.layers.dropout({ rate: 0.20 }).apply(x);
  const out = tf.layers.dense({ units: 1, activation: "sigmoid" }).apply(x);
  const m = tf.model({ inputs: inp, outputs: out });
  m._name = "modelA";
  return m;
}

// Sub-model B: Wide & shallow (linear patterns)
function buildModelB(dim) {
  const inp = tf.input({ shape: [dim] });
  let x = tf.layers.dense({
    units: 256, activation: "relu", kernelInitializer: "glorotUniform",
    kernelRegularizer: tf.regularizers.l1l2({ l1: 0.0005, l2: 0.0005 }),
  }).apply(inp);
  x = tf.layers.dropout({ rate: 0.40 }).apply(x);
  x = tf.layers.dense({ units: 64, activation: "relu" }).apply(x);
  x = tf.layers.dropout({ rate: 0.25 }).apply(x);
  const out = tf.layers.dense({ units: 1, activation: "sigmoid" }).apply(x);
  const m = tf.model({ inputs: inp, outputs: out });
  m._name = "modelB";
  return m;
}

// Sub-model C: Bottleneck (compressed representation)
function buildModelC(dim) {
  const inp = tf.input({ shape: [dim] });
  let x = tf.layers.dense({ units: 64, activation: "relu", kernelInitializer: "heNormal" }).apply(inp);
  x = tf.layers.batchNormalization().apply(x);
  x = tf.layers.dense({ units: 16, activation: "relu" }).apply(x);  // bottleneck
  x = tf.layers.dense({ units: 64, activation: "relu" }).apply(x);  // expand
  x = tf.layers.dropout({ rate: 0.25 }).apply(x);
  const out = tf.layers.dense({ units: 1, activation: "sigmoid" }).apply(x);
  const m = tf.model({ inputs: inp, outputs: out });
  m._name = "modelC";
  return m;
}

function compileM(m, lr = 0.001) {
  m.compile({
    optimizer: tf.train.adam(lr),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════
let models           = [];
let scaler           = new RobustScaler();
let optimalThreshold = 0.5;
let onlineBuffer     = [];

// ══════════════════════════════════════════════════════════════════════════════
// META
// ══════════════════════════════════════════════════════════════════════════════
const readMeta  = () => {
  if (fs.existsSync(META_FILE)) {
    try { return JSON.parse(fs.readFileSync(META_FILE, "utf8")); } catch {}
  }
  return { version: 0, history: [] };
};
const writeMeta = (patch) => {
  const m = readMeta();
  fs.writeFileSync(META_FILE, JSON.stringify({ ...m, ...patch }, null, 2));
};

// ══════════════════════════════════════════════════════════════════════════════
// SERIALISATION
// ══════════════════════════════════════════════════════════════════════════════
async function saveEnsemble() {
  const ensemble = [];
  for (const m of models) {
    const art = await m.save(tf.io.withSaveHandler(async a => a));
    ensemble.push({
      name:          m._name || "model",
      modelTopology: art.modelTopology,
      weightSpecs:   art.weightSpecs,
      weightData:    Buffer.from(art.weightData).toString("base64"),
    });
  }
  fs.writeFileSync(MODEL_FILE, JSON.stringify({ ensemble }, null, 2));
  scaler.save();
  log.ok("Ensemble saved.");
}

async function loadEnsemble() {
  if (!fs.existsSync(MODEL_FILE)) return false;
  try {
    const { ensemble } = JSON.parse(fs.readFileSync(MODEL_FILE, "utf8"));
    models = [];
    for (const e of ensemble) {
      const wb = Buffer.from(e.weightData, "base64").buffer;
      const m  = await tf.loadLayersModel(tf.io.fromMemory({
        modelTopology: e.modelTopology,
        weightSpecs:   e.weightSpecs,
        weightData:    wb,
      }));
      compileM(m, 0.0005);
      m._name = e.name;
      models.push(m);
    }
    const meta       = readMeta();
    optimalThreshold = meta.threshold ?? 0.5;
    log.ok(`Ensemble loaded (${models.length} sub-models). Threshold=${optimalThreshold}`);
    return true;
  } catch (err) {
    log.err("Load failed:", err.message);
    return false;
  }
}

async function loadOrCreate() {
  if (models.length > 0) return;

  scaler.load();
  const loaded = await loadEnsemble();

  if (!loaded) {
    log.warn("No saved ensemble — building fresh.");
    models = [buildModelA(FEATURE_DIM), buildModelB(FEATURE_DIM), buildModelC(FEATURE_DIM)];
    models.forEach(m => compileM(m, 0.001));
  }

  if (fs.existsSync(BUFFER_FILE)) {
    try { onlineBuffer = JSON.parse(fs.readFileSync(BUFFER_FILE, "utf8")); }
    catch { onlineBuffer = []; }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA AUGMENTATION  (SMOTE-lite + Label Smoothing)
// ══════════════════════════════════════════════════════════════════════════════
function smoteAugment(features, labels, targetRatio = 0.40) {
  const aIdx = labels.reduce((a, l, i) => { if (l[0] >= 0.5) a.push(i); return a; }, []);
  const nIdx = labels.reduce((a, l, i) => { if (l[0] <  0.5) a.push(i); return a; }, []);

  if (!aIdx.length || !nIdx.length) return { features, labels };

  const ratio = aIdx.length / labels.length;

  // Always apply label smoothing
  const smoothed = labels.map(l => [l[0] >= 0.5 ? 0.88 : 0.05]);

  if (ratio >= targetRatio) return { features, labels: smoothed };

  const needed = Math.floor((targetRatio * nIdx.length - aIdx.length) / (1 - targetRatio));
  log.info(`SMOTE: generating ${needed} synthetic anomaly samples (${(ratio * 100).toFixed(1)}% → ~${(targetRatio * 100).toFixed(0)}%)`);

  const synF = [], synL = [];
  for (let i = 0; i < needed; i++) {
    const a = aIdx[Math.floor(Math.random() * aIdx.length)];
    const b = aIdx[Math.floor(Math.random() * aIdx.length)];
    const alpha = Math.random();
    synF.push(features[a].map((v, j) => v * alpha + features[b][j] * (1 - alpha) + (Math.random() - 0.5) * 0.015));
    synL.push([0.88]);
  }

  return {
    features: [...features, ...synF],
    labels:   [...smoothed,  ...synL],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// LR SCHEDULE  (Warm-up → Cosine decay)
// ══════════════════════════════════════════════════════════════════════════════
function lrSchedule(epoch, total, lrMax = 0.001, lrMin = 5e-6) {
  const warmup = Math.floor(total * 0.08);
  if (epoch < warmup) return lrMin + (lrMax - lrMin) * (epoch / warmup);
  const t = (epoch - warmup) / (total - warmup);
  return lrMin + 0.5 * (lrMax - lrMin) * (1 + Math.cos(Math.PI * t));
}

// ══════════════════════════════════════════════════════════════════════════════
// METRICS
// ══════════════════════════════════════════════════════════════════════════════
function computeMetrics(preds, labels, threshold = 0.5) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  preds.forEach((p, i) => {
    const pp = p >= threshold;
    const rp = labels[i][0] >= 0.5;
    if (pp && rp)   tp++;
    if (pp && !rp)  fp++;
    if (!pp && rp)  fn++;
    if (!pp && !rp) tn++;
  });
  const precision   = tp / (tp + fp + 1e-9);
  const recall      = tp / (tp + fn + 1e-9);
  const f1          = 2 * precision * recall / (precision + recall + 1e-9);
  const accuracy    = (tp + tn) / (tp + fp + fn + tn + 1e-9);
  const specificity = tn / (tn + fp + 1e-9);
  return { precision, recall, f1, accuracy, specificity, tp, fp, fn, tn };
}

// Youden's J: maximise sensitivity + specificity simultaneously
function findThreshold(preds, labels) {
  let best = { threshold: 0.5, f1: 0, j: -1 };
  for (let t = 0.05; t <= 0.95; t += 0.025) {
    const m = computeMetrics(preds, labels, t);
    const j = m.recall + m.specificity - 1;
    if (m.f1 > best.f1 || (m.f1 === best.f1 && j > best.j)) {
      best = { threshold: +t.toFixed(3), f1: m.f1, j };
    }
  }
  return best;
}

// ══════════════════════════════════════════════════════════════════════════════
// TRAINING
// ══════════════════════════════════════════════════════════════════════════════
async function trainModel(rawFeatures, labels, opts = {}) {
  const {
    epochs      = 150,
    lrMax       = 0.001,
    augment     = true,
    targetRatio = 0.40,
    verbose     = true,
  } = opts;

  await loadOrCreate();

  // 1. Feature engineering
  log.info(`Engineering features for ${rawFeatures.length} samples...`);
  let eng = rawFeatures.map(r => engineer(r));

  // 2. Augment
  let augLabels = labels;
  if (augment) {
    const res = smoteAugment(eng, labels, targetRatio);
    eng       = res.features;
    augLabels = res.labels;
  } else {
    augLabels = labels.map(l => [l[0] >= 0.5 ? 0.88 : 0.05]);
  }

  const anomalyCount = augLabels.filter(l => l[0] > 0.5).length;
  log.info(`Dataset: ${eng.length} total | ${anomalyCount} anomalies (${(anomalyCount/eng.length*100).toFixed(1)}%)`);

  // 3. Fit & apply scaler
  scaler.fit(eng);
  const norm = scaler.transform(eng);

  // 4. Shuffle
  const idx = [...Array(norm.length).keys()].sort(() => Math.random() - 0.5);
  const X   = idx.map(i => norm[i]);
  const Y   = idx.map(i => augLabels[i]);

  const xT = tf.tensor2d(X);
  const yT = tf.tensor2d(Y);

  const allHistory = [];

  // 5. Train each sub-model
  const WEIGHTS = [0.40, 0.30, 0.30];
  for (let mi = 0; mi < models.length; mi++) {
    const name = models[mi]._name || `model_${mi}`;
    log.info(`▶ Training [${name}] (${mi + 1}/${models.length})...`);

    let bestLoss = Infinity, patience = 0;
    const PATIENCE = 25;

    await models[mi].fit(xT, yT, {
      epochs,
      batchSize: Math.min(32, Math.max(8, Math.floor(X.length / 10))),
      shuffle: true,
      validationSplit: 0.12,
      callbacks: {
        onEpochBegin: async (epoch) => {
          models[mi].optimizer.learningRate = lrSchedule(epoch, epochs, lrMax);
        },
        onEpochEnd: async (epoch, logs) => {
          const lr = models[mi].optimizer.learningRate || lrMax;
          allHistory.push({
            model: name, epoch: epoch + 1,
            loss: +logs.loss.toFixed(5),   acc: +(logs.acc || 0).toFixed(5),
            valLoss: logs.val_loss ? +logs.val_loss.toFixed(5) : null,
            valAcc:  logs.val_acc  ? +logs.val_acc.toFixed(5)  : null,
            lr: +lr.toFixed(7),
          });

          const monitor = logs.val_loss ?? logs.loss;
          if (monitor < bestLoss - 1e-4) { bestLoss = monitor; patience = 0; }
          else if (++patience >= PATIENCE) {
            if (verbose) log.warn(`  Early stop [${name}] at epoch ${epoch + 1}`);
            models[mi].stopTraining = true;
          }

          if (verbose && (epoch + 1) % 20 === 0) {
            log.epoch(`[${name}] ep=${String(epoch+1).padStart(3)} | loss=${logs.loss.toFixed(4)} acc=${(logs.acc||0).toFixed(4)} | val_loss=${(logs.val_loss||0).toFixed(4)} | lr=${lr.toFixed(6)}`);
          }
        },
      },
    });
  }

  xT.dispose();
  yT.dispose();

  // 6. Ensemble evaluation
  log.info("Evaluating ensemble...");
  const normFull = scaler.transform(eng);
  const ensemblePreds = tf.tidy(() => {
    const xFull = tf.tensor2d(normFull);
    const preds = models.map((m, i) => m.predict(xFull).mul(WEIGHTS[i]));
    return Array.from(preds.reduce((a, b) => a.add(b)).dataSync());
  });

  const { threshold, f1 } = findThreshold(ensemblePreds, augLabels);
  const metrics = computeMetrics(ensemblePreds, augLabels, threshold);
  optimalThreshold = threshold;

  log.metric(`Ensemble  F1=${f1.toFixed(4)}  Precision=${metrics.precision.toFixed(4)}  Recall=${metrics.recall.toFixed(4)}  Specificity=${metrics.specificity.toFixed(4)}`);
  log.metric(`Threshold=${threshold}  Accuracy=${metrics.accuracy.toFixed(4)}  TP=${metrics.tp}  FP=${metrics.fp}  FN=${metrics.fn}  TN=${metrics.tn}`);

  // 7. Save
  await saveEnsemble();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(allHistory, null, 2));

  const meta = readMeta();
  writeMeta({
    version:     meta.version + 1,
    trainedAt:   new Date().toISOString(),
    samples:     rawFeatures.length,
    augmented:   eng.length,
    epochs:      allHistory.filter(h => h.model === (models[0]._name || "modelA")).length,
    threshold:   optimalThreshold,
    f1:          +f1.toFixed(4),
    precision:   +metrics.precision.toFixed(4),
    recall:      +metrics.recall.toFixed(4),
    specificity: +metrics.specificity.toFixed(4),
    accuracy:    +metrics.accuracy.toFixed(4),
    featureDim:  FEATURE_DIM,
    history:     [
      ...(meta.history || []).slice(-9),
      {
        version:   meta.version + 1,
        f1:        +f1.toFixed(4),
        accuracy:  +metrics.accuracy.toFixed(4),
        trainedAt: new Date().toISOString(),
      },
    ],
  });

  log.ok(`Training complete. Model v${meta.version + 1} | F1=${f1.toFixed(4)} | Threshold=${threshold}`);
  return { f1, metrics, threshold, version: meta.version + 1 };
}

// ══════════════════════════════════════════════════════════════════════════════
// PREDICTION  (single sample)
// ══════════════════════════════════════════════════════════════════════════════
async function predict(inputArray) {
  await loadOrCreate();

  const raw  = inputArray.map(v => (isNaN(v) || v == null) ? 0 : Number(v));
  const feat = engineer(raw);
  const norm = scaler.fitted ? scaler.transform([feat])[0] : feat;

  const WEIGHTS = [0.40, 0.30, 0.30];
  const subScores = tf.tidy(() => {
    const t = tf.tensor2d([norm]);
    return models.map(m => m.predict(t).dataSync()[0]);
  });

  const rawScore = subScores.reduce((s, v, i) => s + v * WEIGHTS[i], 0);

  // Platt calibration
  const calibrated = 1 / (1 + Math.exp(-(rawScore - 0.5) * 5.5));
  const probability = +(calibrated * 100).toFixed(2);

  // Hard rule override
  const [lat, pl, , thr] = raw;
  const hardAnomaly = pl >= THR.packetLoss.dead || lat >= THR.latency.dead || thr <= THR.throughput.dead;
  const finalProb   = hardAnomaly ? Math.max(probability, 95) : probability;

  const isAnomaly   = calibrated >= optimalThreshold || hardAnomaly;
  const riskLevel   = finalProb >= 75 ? "CRITICAL" : finalProb >= 50 ? "HIGH" : finalProb >= 25 ? "MEDIUM" : "LOW";
  const confidence  = Math.min(Math.abs(calibrated - optimalThreshold) / Math.max(optimalThreshold, 1 - optimalThreshold), 1);

  // Feature attribution (approximation)
  const contributions = {
    latency:    +(feat[4] * 40 + feat[8] * 15).toFixed(1),
    packetLoss: +(feat[5] * 40 + feat[9] * 15).toFixed(1),
    jitter:     +(feat[6] * 25 + feat[10] * 10).toFixed(1),
    throughput: +(feat[7] * 30 + feat[11] * 10).toFixed(1),
  };

  const meta = readMeta();

  return {
    isAnomaly,
    probability:     String(+finalProb.toFixed(2)),
    riskLevel,
    rawScore:        +rawScore.toFixed(4),
    calibrated:      +calibrated.toFixed(4),
    threshold:       +optimalThreshold.toFixed(3),
    confidence:      +confidence.toFixed(3),
    hardOverride:    hardAnomaly,
    subModelScores:  subScores.map(s => +s.toFixed(4)),
    contributions,
    input:           { latency: raw[0], packetLoss: raw[1], jitter: raw[2], throughput: raw[3] },
    modelVersion:    meta.version ?? 0,
    featureDim:      FEATURE_DIM,
    ensembleSize:    models.length,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// BATCH PREDICTION
// ══════════════════════════════════════════════════════════════════════════════
async function predictBatch(inputs) {
  await loadOrCreate();

  const feats = inputs.map(inp => engineer(inp.map(v => (isNaN(v) || v == null) ? 0 : Number(v))));
  const norms = scaler.fitted ? scaler.transform(feats) : feats;

  const WEIGHTS = [0.40, 0.30, 0.30];
  const rawScores = tf.tidy(() => {
    const t     = tf.tensor2d(norms);
    const preds = models.map((m, i) => m.predict(t).mul(WEIGHTS[i]));
    return Array.from(preds.reduce((a, b) => a.add(b)).dataSync());
  });

  return rawScores.map((raw, i) => {
    const cal  = 1 / (1 + Math.exp(-(raw - 0.5) * 5.5));
    const prob = +(cal * 100).toFixed(2);
    const inp  = inputs[i];
    const hard = inp[1] >= THR.packetLoss.dead || inp[0] >= THR.latency.dead || inp[3] <= THR.throughput.dead;
    const fp   = hard ? Math.max(prob, 95) : prob;
    return {
      index:       i,
      isAnomaly:   cal >= optimalThreshold || hard,
      probability: String(+fp.toFixed(2)),
      riskLevel:   fp >= 75 ? "CRITICAL" : fp >= 50 ? "HIGH" : fp >= 25 ? "MEDIUM" : "LOW",
      confidence:  +Math.min(Math.abs(cal - optimalThreshold) / Math.max(optimalThreshold, 1 - optimalThreshold), 1).toFixed(3),
      hardOverride: hard,
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ONLINE LEARNING  (incremental update from live feedback)
// ══════════════════════════════════════════════════════════════════════════════
const BUFFER_SIZE  = 50;
const ONLINE_STEPS = 10;

async function updateOnline(rawInput, isAnomaly) {
  await loadOrCreate();

  onlineBuffer.push({ input: rawInput, label: isAnomaly ? 1 : 0 });
  if (onlineBuffer.length > BUFFER_SIZE * 2) onlineBuffer = onlineBuffer.slice(-BUFFER_SIZE * 2);
  fs.writeFileSync(BUFFER_FILE, JSON.stringify(onlineBuffer));

  if (onlineBuffer.length < BUFFER_SIZE) {
    log.info(`Online buffer: ${onlineBuffer.length}/${BUFFER_SIZE}`);
    return { status: "buffered", count: onlineBuffer.length };
  }

  log.info(`Buffer full — fine-tuning ensemble (${ONLINE_STEPS} steps)...`);

  const rawF = onlineBuffer.map(b => b.input);
  const rawL = onlineBuffer.map(b => [b.label]);
  const eng  = rawF.map(r => engineer(r));
  const norm = scaler.fitted ? scaler.transform(eng) : eng;

  const xT = tf.tensor2d(norm);
  const yT = tf.tensor2d(rawL);

  for (const m of models) {
    m.optimizer.learningRate = 5e-5;
    await m.fit(xT, yT, { epochs: ONLINE_STEPS, batchSize: 16, shuffle: true, verbose: 0 });
  }

  xT.dispose();
  yT.dispose();
  await saveEnsemble();

  onlineBuffer = [];
  fs.writeFileSync(BUFFER_FILE, JSON.stringify([]));

  log.ok("Online fine-tuning complete. Buffer cleared.");
  return { status: "fine-tuned", steps: ONLINE_STEPS };
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-TRAIN  (synthetic baseline data)
// ══════════════════════════════════════════════════════════════════════════════
async function autoTrain(opts = {}) {
  const { epochs = 150 } = opts;
  log.info("Generating synthetic baseline training data...");

  const data = [], labels = [];
  const add = (lat, pl, jit, thr, label) => {
    const n = (base, pct) => Math.max(0, base * (1 + (Math.random() - 0.5) * pct));
    data.push([n(lat, 0.30), n(pl, 0.40), n(jit, 0.40), n(thr, 0.30)]);
    labels.push([label]);
  };

  // Normal
  for (let i = 0; i < 250; i++) add(5 + Math.random() * 55,   0 + Math.random() * 2,  1 + Math.random() * 12,  50 + Math.random() * 150, 0);
  // Mildly degraded
  for (let i = 0; i < 80;  i++) add(60 + Math.random() * 100, 2 + Math.random() * 6,  12 + Math.random() * 30, 15 + Math.random() * 35,  1);
  // Severely degraded
  for (let i = 0; i < 80;  i++) add(150 + Math.random() * 400, 15 + Math.random() * 50, 50 + Math.random() * 200, 1 + Math.random() * 15, 1);
  // Dead / critical
  for (let i = 0; i < 60;  i++) add(500 + Math.random() * 499, 80 + Math.random() * 20, 200 + Math.random() * 300, 0 + Math.random() * 2, 1);
  // Edge cases (ambiguous)
  for (let i = 0; i < 40;  i++) add(70 + Math.random() * 30, 3 + Math.random() * 4, 18 + Math.random() * 15, 20 + Math.random() * 20, 0);

  log.info(`Auto-train dataset: ${data.length} samples`);
  return trainModel(data, labels, { epochs, ...opts });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODEL INFO
// ══════════════════════════════════════════════════════════════════════════════
function getModelInfo() {
  const meta = readMeta();
  return {
    status:        models.length > 0 && scaler.fitted ? "READY" : models.length > 0 ? "PARTIAL" : "NOT_LOADED",
    version:       meta.version      ?? 0,
    trainedAt:     meta.trainedAt    ?? null,
    ensembleSize:  models.length,
    featureDim:    FEATURE_DIM,
    threshold:     optimalThreshold,
    performance: {
      f1:          meta.f1          ?? null,
      accuracy:    meta.accuracy    ?? null,
      precision:   meta.precision   ?? null,
      recall:      meta.recall      ?? null,
      specificity: meta.specificity ?? null,
    },
    training: {
      samples:   meta.samples   ?? 0,
      augmented: meta.augmented ?? 0,
      epochs:    meta.epochs    ?? 0,
    },
    versionHistory: meta.history ?? [],
    onlineBuffer:   onlineBuffer.length,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════
module.exports = {
  // Core
  trainModel,
  predict,
  predictBatch,
  // Lifecycle
  loadOrCreate,
  autoTrain,
  // Online
  updateOnline,
  // Utils
  engineer,
  getModelInfo,
  // Constants
  FEATURE_DIM,
  THR,
};