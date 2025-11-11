const Order = require('../models/Order');
const Client = require('../models/clients');
const asyncHandler = require('../utils/asyncHandler');

// Create a new sell order
const createOrder = asyncHandler(async (req, res) => {
  const { energyAmount, pricePerUnit } = req.body;
  const sellerId = req.body.clientId; // Assuming client ID is passed in request

  

  // Validate seller exists and has enough energy
  const seller = await Client.findById(sellerId);
  
  if (!seller) {
    return res.status(404).json({ status: 'error', message: 'Seller not found' });
  }

  if (seller.energyBalance < energyAmount) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Insufficient energy balance' 
    });
  }

  // Create order
  const order = await Order.create({
    seller: sellerId,
    energyAmount,
    pricePerUnit,
  });

  // Temporarily lock the energy amount
  await Client.findByIdAndUpdate(sellerId, {
    $inc: { energyBalance: -energyAmount }
  });

  return res.status(201).json({ status: 'success', data: order });
});

// Get all open orders
const getOpenOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ 
    status: 'open',
    expiresAt: { $gt: new Date() }
  })
  .populate('seller', 'firstName lastName walletAddress')
  .sort('-createdAt');

  return res.status(200).json({
    status: 'success',
    count: orders.length,
    data: orders
  });
});

// Buy an order
const buyOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const buyerId = req.body.clientId;

  const order = await Order.findById(orderId);
  if (!order) {
    return res.status(404).json({ 
      status: 'error', 
      message: 'Order not found' 
    });
  }

  if (order.status !== 'open') {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Order is not available' 
    });
  }

  if (order.expiresAt < new Date()) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Order has expired' 
    });
  }

  // Complete the transaction
  order.status = 'completed';
  order.buyer = buyerId;
  order.completedAt = new Date();
  await order.save();

  // Transfer energy to buyer
  await Client.findByIdAndUpdate(buyerId, {
    $inc: { energyBalance: order.energyAmount }
  });

  return res.status(200).json({ 
    status: 'success', 
    message: 'Order completed successfully',
    data: order 
  });
});

// Cancel an order
const cancelOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const sellerId = req.body.clientId;

  const order = await Order.findOne({ 
    _id: orderId,
    seller: sellerId,
    status: 'open'
  });

  if (!order) {
    return res.status(404).json({ 
      status: 'error', 
      message: 'Order not found or already processed' 
    });
  }

  // Cancel order and return energy to seller
  order.status = 'cancelled';
  await order.save();

  await Client.findByIdAndUpdate(sellerId, {
    $inc: { energyBalance: order.energyAmount }
  });

  return res.status(200).json({ 
    status: 'success', 
    message: 'Order cancelled successfully' 
  });
});

// Get my orders (as seller or buyer)
const getMyOrders = asyncHandler(async (req, res) => {
  const clientId = req.body.clientId;
  const { role = 'all', status } = req.query;

  const query = {};
  
  if (role === 'seller') {
    query.seller = clientId;
  } else if (role === 'buyer') {
    query.buyer = clientId;
  } else {
    query.$or = [{ seller: clientId }, { buyer: clientId }];
  }

  if (status) {
    query.status = status;
  }

  const orders = await Order.find(query)
    .populate('seller', 'firstName lastName walletAddress')
    .populate('buyer', 'firstName lastName walletAddress')
    .sort('-createdAt');

  return res.status(200).json({
    status: 'success',
    count: orders.length,
    data: orders
  });
});

const getEarnedAndSpentStats = asyncHandler(async (req, res) => {
  const clientId = req.body.clientId;

  if (!clientId) {
    return res.status(400).json({
      status: 'error',
      message: 'Client ID is required'
    });
  }

  try {
    // Get all completed orders where client is either seller or buyer
    const orders = await Order.find({
      $or: [
        { seller: clientId, status: 'completed' },
        { buyer: clientId, status: 'completed' }
      ]
    })
    .populate('seller', 'firstName lastName walletAddress')
    .populate('buyer', 'firstName lastName walletAddress')
    .select('energyAmount pricePerUnit seller buyer');

    // Calculate totals
    let totalEarned = 0;
    let totalSpent = 0;

    orders.forEach(order => {
      const orderValue = order.energyAmount * order.pricePerUnit;
      
      // If client is seller, they earned money
      if (order.seller._id.toString() === clientId) {
        totalEarned += orderValue;
      }
      
      // If client is buyer, they spent money
      if (order.buyer && order.buyer._id.toString() === clientId) {
        totalSpent += orderValue;
      }
    });

    return res.status(200).json({
      status: 'success',
      data: {
        totalEarned: parseFloat(totalEarned.toFixed(2)),
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        netProfit: parseFloat((totalEarned - totalSpent).toFixed(2)),
        transactionCount: orders.length
      }
    });

  } catch (error) {
    console.error('Error fetching earned/spent stats:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch financial statistics'
    });
  }
});

/*
------------------------------------------------
 GET CLIENT TRANSACTION HISTORY
------------------------------------------------
*/
const getClientTransactions = asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const { 
    status, 
    type, // 'bought', 'sold', or 'all'
    limit = 50, 
    page = 1,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Verify client exists
  const client = await Client.findById(clientId);
  if (!client) {
    return res.status(404).json({ 
      status: "error", 
      message: "Client not found" 
    });
  }

  // Build query
  const query = {
    $or: [
      { seller: clientId },
      { buyer: clientId }
    ]
  };

  // Filter by status if provided
  if (status) {
    query.status = status;
  }

  // Filter by type (bought/sold)
  if (type === 'bought') {
    query.$or = [{ buyer: clientId }];
  } else if (type === 'sold') {
    query.$or = [{ seller: clientId }];
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  // Execute query
  const [transactions, totalCount] = await Promise.all([
    Order.find(query)
      .populate('seller', 'firstName lastName email')
      .populate('buyer', 'firstName lastName email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Order.countDocuments(query)
  ]);

  // Transform data for frontend
  const transformedTransactions = transactions.map(transaction => {
    const isSeller = transaction.seller._id.toString() === clientId;
    const isBuyer = transaction.buyer && transaction.buyer._id.toString() === clientId;

    return {
      id: transaction._id,
      type: isSeller ? 'sold' : 'bought',
      amount: transaction.energyAmount,
      pricePerUnit: transaction.pricePerUnit,
      total: parseFloat((transaction.energyAmount * transaction.pricePerUnit).toFixed(2)),
      status: transaction.status,
      date: transaction.completedAt || transaction.createdAt,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      expiresAt: transaction.expiresAt,
      // Other party details
      counterParty: isSeller 
        ? (transaction.buyer ? {
            id: transaction.buyer._id,
            name: `${transaction.buyer.firstName} ${transaction.buyer.lastName}`,
            email: transaction.buyer.email
          } : null)
        : {
            id: transaction.seller._id,
            name: `${transaction.seller.firstName} ${transaction.seller.lastName}`,
            email: transaction.seller.email
          }
    };
  });

  // Calculate statistics
  const stats = {
    totalTransactions: totalCount,
    totalSold: transactions.filter(t => t.seller._id.toString() === clientId).length,
    totalBought: transactions.filter(t => t.buyer && t.buyer._id.toString() === clientId).length,
    totalEnergySold: transactions
      .filter(t => t.seller._id.toString() === clientId && t.status === 'completed')
      .reduce((sum, t) => sum + t.energyAmount, 0),
    totalEnergyBought: transactions
      .filter(t => t.buyer && t.buyer._id.toString() === clientId && t.status === 'completed')
      .reduce((sum, t) => sum + t.energyAmount, 0),
    totalRevenue: transactions
      .filter(t => t.seller._id.toString() === clientId && t.status === 'completed')
      .reduce((sum, t) => sum + (t.energyAmount * t.pricePerUnit), 0),
    totalSpent: transactions
      .filter(t => t.buyer && t.buyer._id.toString() === clientId && t.status === 'completed')
      .reduce((sum, t) => sum + (t.energyAmount * t.pricePerUnit), 0)
  };

  return res.json({
    status: "success",
    data: {
      client: {
        id: client._id,
        name: `${client.firstName} ${client.lastName}`,
        email: client.email
      },
      transactions: transformedTransactions,
      statistics: {
        ...stats,
        totalEnergySold: parseFloat(stats.totalEnergySold.toFixed(2)),
        totalEnergyBought: parseFloat(stats.totalEnergyBought.toFixed(2)),
        totalRevenue: parseFloat(stats.totalRevenue.toFixed(2)),
        totalSpent: parseFloat(stats.totalSpent.toFixed(2))
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalRecords: totalCount,
        limit: parseInt(limit),
        hasNextPage: skip + transactions.length < totalCount,
        hasPrevPage: parseInt(page) > 1
      }
    }
  });
});

/*
------------------------------------------------
 GET TRANSACTION DETAILS
------------------------------------------------
*/
const getTransactionDetails = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;

  const transaction = await Order.findById(transactionId)
    .populate('seller', 'firstName lastName email energyBalance')
    .populate('buyer', 'firstName lastName email energyBalance');

  if (!transaction) {
    return res.status(404).json({
      status: "error",
      message: "Transaction not found"
    });
  }

  return res.json({
    status: "success",
    data: {
      id: transaction._id,
      energyAmount: transaction.energyAmount,
      pricePerUnit: transaction.pricePerUnit,
      totalPrice: parseFloat((transaction.energyAmount * transaction.pricePerUnit).toFixed(2)),
      status: transaction.status,
      seller: {
        id: transaction.seller._id,
        name: `${transaction.seller.firstName} ${transaction.seller.lastName}`,
        email: transaction.seller.email,
        energyBalance: transaction.seller.energyBalance
      },
      buyer: transaction.buyer ? {
        id: transaction.buyer._id,
        name: `${transaction.buyer.firstName} ${transaction.buyer.lastName}`,
        email: transaction.buyer.email,
        energyBalance: transaction.buyer.energyBalance
      } : null,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      expiresAt: transaction.expiresAt,
      updatedAt: transaction.updatedAt
    }
  });
});

module.exports = {
  createOrder,
  getOpenOrders,
  buyOrder,
  cancelOrder,
  getMyOrders,
  getClientTransactions,
  getTransactionDetails,
  getEarnedAndSpentStats
};