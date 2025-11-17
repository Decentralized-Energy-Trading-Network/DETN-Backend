const express = require('express');
const router = express.Router();
const {
  getClientEnergy,
  addEnergy,
  addBulkEnergy,
  getTotalEnergyProduction,
  getEnergyTradeToday,
  getRealTimeEnergyFlow,
  getLiveProduction,
} = require('../controllers/energyProductionController');


router.get('/client/:clientId', getClientEnergy);
router.post('/add', addEnergy);
router.post('/add-bulk', addBulkEnergy);

router.get('/production/total', getTotalEnergyProduction);
router.get('/trade/today', getEnergyTradeToday);
router.get('/flow/realtime', getRealTimeEnergyFlow);
router.get('/dashboard', getLiveProduction);



module.exports = router;