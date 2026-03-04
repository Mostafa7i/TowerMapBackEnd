const express = require('express');
const AuthProduct = require('../middleware/auth.middleware');
const { getTower, addTower, getTowerById, updateTowerByIP } = require('../controllers/tower.controller');
const router = express.Router();


router.post("/addTowers", AuthProduct , addTower);
router.get("/getTower", AuthProduct , getTower);
router.get('/getOneTower/:id', AuthProduct, getTowerById);
router.post('/updateByIP', AuthProduct, updateTowerByIP);
module.exports = router;