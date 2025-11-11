const express = require('express');
const router = express.Router();
const {
  registerClient,
  loginClient,
  getNonce,
  walletLogin,
  updateEnergyBalance,
  getClientProfile
} = require('../controllers/clientController');

router.post('/register', registerClient);
router.post('/login', loginClient);
router.get('/nonce/:walletAddress', getNonce);
router.post('/wallet-login', walletLogin);
router.post("/update-energy", updateEnergyBalance);
router.post("/client-details", getClientProfile);

module.exports = router;