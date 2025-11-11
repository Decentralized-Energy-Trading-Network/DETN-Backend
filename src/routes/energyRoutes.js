const express = require('express');
const router = express.Router();
const {
  getClientEnergy,
  addEnergy,
  addBulkEnergy
} = require('../controllers/energyProductionController');


router.get('/client/:clientId', getClientEnergy);
router.post('/add', addEnergy);
router.post('/add-bulk', addBulkEnergy);

module.exports = router;