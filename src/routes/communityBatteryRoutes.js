const express = require('express');
const router = express.Router();
const {
  getBatteryStatus,
  getAllTransactions,
  depositEnergy,
  releaseEnergy,
  updateEnergyPrice,
  purchaseFromBattery
} = require('../controllers/communityBatteryController');

router.get('/status', getBatteryStatus);
router.get('/transactions', getAllTransactions);
router.post('/deposit', depositEnergy);
router.post('/release', releaseEnergy);
router.post('/price', updateEnergyPrice);
router.post('/purchase', purchaseFromBattery); 

module.exports = router;