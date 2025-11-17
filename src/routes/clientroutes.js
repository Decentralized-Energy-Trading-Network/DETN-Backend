const express = require('express');
const router = express.Router();
const {
  registerClient,
  loginClient,
  getNonce,
  walletLogin,
  updateEnergyBalance,
  getClientProfile,
  getAllUsers,
  getUserStats,
  getUserById,
  getUserActivity,
  createUser,
  updateUser,
  deleteUser,
  updateUserPassword,
  bulkUpdateUserStatus
} = require('../controllers/clientController');

router.post('/register', registerClient);
router.post('/login', loginClient);
router.get('/nonce/:walletAddress', getNonce);
router.post('/wallet-login', walletLogin);
router.post("/update-energy", updateEnergyBalance);
router.post("/client-details", getClientProfile);
router.get('/users', getAllUsers);
router.get('/users/stats', getUserStats);
router.get('/users/:id', getUserById);
router.get('/users/:id/activity', getUserActivity);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.put('/users/:id/password', updateUserPassword);
router.put('/users/bulk/status', bulkUpdateUserStatus);

module.exports = router;