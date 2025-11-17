const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOpenOrders,
  buyOrder,
  cancelOrder,
  getMyOrders,
  getClientTransactions,
  getTransactionDetails,
  getEarnedAndSpentStats,
  getRecentTransactions,
  getAllTransactions,
  getTransactionStats
} = require('../controllers/OrderController');

router.post('/', createOrder);
router.get('/open', getOpenOrders);
router.get('/my-orders', getMyOrders);
router.post('/:orderId/buy', buyOrder);
router.post('/:orderId/cancel', cancelOrder);
router.get('/transactions/:clientId', getClientTransactions);
router.get('/transaction/:transactionId', getTransactionDetails);
router.post('/getEarnedAndSpentStats', getEarnedAndSpentStats);

router.get('/transactions-orders/recent', getRecentTransactions);
router.get('/transactions', getAllTransactions);
router.get('/transactions/stats', getTransactionStats);




module.exports = router;