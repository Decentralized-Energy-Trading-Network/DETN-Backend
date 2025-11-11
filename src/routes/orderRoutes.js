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
  getEarnedAndSpentStats
} = require('../controllers/OrderController');

router.post('/', createOrder);
router.get('/open', getOpenOrders);
router.get('/my-orders', getMyOrders);
router.post('/:orderId/buy', buyOrder);
router.post('/:orderId/cancel', cancelOrder);
router.get('/transactions/:clientId', getClientTransactions);
router.get('/transaction/:transactionId', getTransactionDetails);
router.post('/getEarnedAndSpentStats', getEarnedAndSpentStats);

module.exports = router;