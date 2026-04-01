const express = require('express');
const ai = require('../ai/xorModel'); // تأكد إن ده المسار الفعلي للملف
const { trainCtrl, predictBatchCtrl, predictOne, autoTrainCtrl, feedbackCtrl, infoCtrl, healthCtrl, resetCtrl, analyzeTower } = require('../controllers/tower.controller');
const routerAI = express.Router();



routerAI.post("/predict", predictOne);
routerAI.post("/predict/batch", predictBatchCtrl);
routerAI.post("/train", trainCtrl);
routerAI.post("/train/auto", autoTrainCtrl);
routerAI.post("/feedback", feedbackCtrl);
routerAI.get("/info", infoCtrl);
routerAI.get("/health", healthCtrl);
routerAI.delete("/model", resetCtrl);
// Endpoint - التعديل هنا: المسار اصبح /analyze فقط
routerAI.post('/analyze', analyzeTower);

module.exports = routerAI;