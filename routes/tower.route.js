const express = require('express');
const { getTower, addTower, getTowerById, updateTowerByIP, deleteTower, updateTower } = require('../controllers/tower.controller');
const router = express.Router();
const adminGuard = require('../middleware/adminGuard.middleware');
const { verifyToken } = require('../middleware/auth.middleware');


router.post("/addTowers", verifyToken, addTower);
router.get("/getTower", getTower);
router.get('/getOneTower/:id', verifyToken, getTowerById);
router.post('/updateByIP', verifyToken, updateTowerByIP);

router.delete('/deleteTower/:id', verifyToken, adminGuard, deleteTower);
router.patch('/updateTower/:id', verifyToken, adminGuard, updateTower);

module.exports = router;