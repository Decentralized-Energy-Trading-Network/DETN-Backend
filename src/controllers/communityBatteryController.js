const asyncHandler = require("../utils/asyncHandler");
const CommunityBattery = require("../models/communityBattery");
const Client = require("../models/clients");

/*
------------------------------------------------
 GET COMMUNITY BATTERY STATUS
------------------------------------------------
*/
const getBatteryStatus = asyncHandler(async (req, res) => {
  // Get or create community battery instance
  let battery = await CommunityBattery.findOne();
  
  if (!battery) {
    battery = await CommunityBattery.create({
      totalStoredKwh: 0,
      energyPricePerKwh: 0.15
    });
  }

  return res.json({
    status: "success",
    data: {
      battery: {
        _id: battery._id,
        totalStoredKwh: parseFloat(battery.totalStoredKwh.toFixed(4)),
        energyPricePerKwh: parseFloat(battery.energyPricePerKwh.toFixed(4)),
        totalReleases: battery.releases.length,
        totalDeposits: battery.deposits.length,
        createdAt: battery.createdAt,
        updatedAt: battery.updatedAt
      }
    }
  });
});

/*
------------------------------------------------
 GET ALL TRANSACTIONS
------------------------------------------------
*/
const getAllTransactions = asyncHandler(async (req, res) => {
  const { type, limit = 50, page = 1 } = req.query;
  
  const battery = await CommunityBattery.findOne()
    .populate('releases.client', 'firstName lastName email')
    .populate('deposits.client', 'firstName lastName email');

  if (!battery) {
    return res.status(404).json({
      status: "error",
      message: "Community battery not found"
    });
  }

  let transactions = [];

  // Combine and format all transactions
  if (!type || type === 'deposit') {
    const depositTransactions = battery.deposits.map(deposit => ({
      type: 'deposit',
      transactionId: deposit._id,
      client: deposit.client,
      amountKwh: parseFloat(deposit.amountKwh.toFixed(4)),
      pricePerKwh: parseFloat(deposit.pricePerKwh.toFixed(4)),
      totalAmount: parseFloat(deposit.totalEarnings.toFixed(4)),
      timestamp: deposit.depositedAt
    }));
    transactions = transactions.concat(depositTransactions);
  }

  if (!type || type === 'release') {
    const releaseTransactions = battery.releases.map(release => ({
      type: 'release',
      transactionId: release._id,
      client: release.client,
      amountKwh: parseFloat(release.amountKwh.toFixed(4)),
      pricePerKwh: parseFloat(release.pricePerKwh.toFixed(4)),
      totalAmount: parseFloat(release.totalCost.toFixed(4)),
      timestamp: release.releasedAt
    }));
    transactions = transactions.concat(releaseTransactions);
  }

  // Sort by timestamp (newest first)
  transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const paginatedTransactions = transactions.slice(skip, skip + parseInt(limit));

  return res.json({
    status: "success",
    data: {
      totalTransactions: transactions.length,
      currentPage: parseInt(page),
      totalPages: Math.ceil(transactions.length / parseInt(limit)),
      transactions: paginatedTransactions
    }
  });
});

/*
------------------------------------------------
 DEPOSIT ENERGY TO BATTERY
------------------------------------------------
*/
const depositEnergy = asyncHandler(async (req, res) => {
  const { clientId, amountKwh } = req.body;

  // Validate input
  if (!clientId || !amountKwh || amountKwh <= 0) {
    return res.status(400).json({
      status: "error",
      message: "Valid clientId and positive amountKwh are required"
    });
  }

  // Fetch client
  const client = await Client.findById(clientId);
  if (!client) {
    return res.status(404).json({
      status: "error",
      message: "Client not found"
    });
  }

  if (client.energyBalance < amountKwh) {
    return res.status(400).json({
      status: "error",
      message: "Insufficient energy balance"
    });
  }

  // Get or create battery
  let battery = await CommunityBattery.findOne();
  if (!battery) {
    battery = await CommunityBattery.create({
      totalStoredKwh: 0,
      energyPricePerKwh: 0.15
    });
  }

  // Calculate earnings at current market price
  const totalEarnings = amountKwh * battery.energyPricePerKwh;

  // Update battery
  battery.totalStoredKwh += amountKwh;
  battery.deposits.push({
    client: clientId,
    amountKwh: amountKwh,
    pricePerKwh: battery.energyPricePerKwh,
    totalEarnings: totalEarnings
  });

  await battery.save();

  // Update client balance
  client.energyBalance -= amountKwh;
  await client.save();

  return res.status(201).json({
    status: "success",
    message: "Energy deposited to community battery successfully",
    data: {
      deposit: {
        amountKwh: parseFloat(amountKwh.toFixed(4)),
        pricePerKwh: parseFloat(battery.energyPricePerKwh.toFixed(4)),
        totalEarnings: parseFloat(totalEarnings.toFixed(4)),
        depositedAt: battery.deposits[battery.deposits.length - 1].depositedAt
      },
      client: {
        _id: client._id,
        energyBalance: parseFloat(client.energyBalance.toFixed(4))
      },
      battery: {
        totalStoredKwh: parseFloat(battery.totalStoredKwh.toFixed(4)),
        energyPricePerKwh: parseFloat(battery.energyPricePerKwh.toFixed(4))
      }
    }
  });
});

/*
------------------------------------------------
 RELEASE ENERGY FROM BATTERY
------------------------------------------------
*/
const releaseEnergy = asyncHandler(async (req, res) => {
  const { clientId, amountKwh } = req.body;

  // Validate input
  if (!clientId || !amountKwh || amountKwh <= 0) {
    return res.status(400).json({
      status: "error",
      message: "Valid clientId and positive amountKwh are required"
    });
  }

  // Fetch client
  const client = await Client.findById(clientId);
  if (!client) {
    return res.status(404).json({
      status: "error",
      message: "Client not found"
    });
  }

  // Get battery
  const battery = await CommunityBattery.findOne();
  if (!battery) {
    return res.status(404).json({
      status: "error",
      message: "Community battery not found"
    });
  }

  if (battery.totalStoredKwh < amountKwh) {
    return res.status(400).json({
      status: "error",
      message: "Insufficient energy in community battery"
    });
  }

  // Calculate cost at current market price
  const totalCost = amountKwh * battery.energyPricePerKwh;

  // Update battery
  battery.totalStoredKwh -= amountKwh;
  battery.releases.push({
    client: clientId,
    amountKwh: amountKwh,
    pricePerKwh: battery.energyPricePerKwh,
    totalCost: totalCost
  });

  await battery.save();

  // Update client balance
  client.energyBalance += amountKwh;
  await client.save();

  return res.status(201).json({
    status: "success",
    message: "Energy released from community battery successfully",
    data: {
      release: {
        amountKwh: parseFloat(amountKwh.toFixed(4)),
        pricePerKwh: parseFloat(battery.energyPricePerKwh.toFixed(4)),
        totalCost: parseFloat(totalCost.toFixed(4)),
        releasedAt: battery.releases[battery.releases.length - 1].releasedAt
      },
      client: {
        _id: client._id,
        energyBalance: parseFloat(client.energyBalance.toFixed(4))
      },
      battery: {
        totalStoredKwh: parseFloat(battery.totalStoredKwh.toFixed(4)),
        energyPricePerKwh: parseFloat(battery.energyPricePerKwh.toFixed(4))
      }
    }
  });
});

/*
------------------------------------------------
 UPDATE ENERGY PRICE
------------------------------------------------
*/
const updateEnergyPrice = asyncHandler(async (req, res) => {
  const { energyPricePerKwh } = req.body;

  if (!energyPricePerKwh || energyPricePerKwh < 0) {
    return res.status(400).json({
      status: "error",
      message: "Valid positive energyPricePerKwh is required"
    });
  }

  let battery = await CommunityBattery.findOne();
  if (!battery) {
    battery = await CommunityBattery.create({
      totalStoredKwh: 0,
      energyPricePerKwh: energyPricePerKwh
    });
  } else {
    battery.energyPricePerKwh = energyPricePerKwh;
    await battery.save();
  }

  return res.json({
    status: "success",
    message: "Energy price updated successfully",
    data: {
      battery: {
        _id: battery._id,
        energyPricePerKwh: parseFloat(battery.energyPricePerKwh.toFixed(4)),
        updatedAt: battery.updatedAt
      }
    }
  });

  
});

const purchaseFromBattery = asyncHandler(async (req, res) => {
  const { clientId, energyAmount, pricePerKwh, totalCost } = req.body;

  // Validate required fields
  if (!clientId || !energyAmount || energyAmount <= 0) {
    return res.status(400).json({
      status: "error",
      message: "Client ID and valid energy amount are required"
    });
  }

  try {
    // Find or create community battery (single instance)
    let battery = await CommunityBattery.findOne();
    if (!battery) {
      battery = await CommunityBattery.create({
        totalStoredKwh: 0,
        energyPricePerKwh: 0.15
      });
    }

    // Check if battery has sufficient energy
    if (battery.totalStoredKwh < energyAmount) {
      return res.status(400).json({
        status: "error",
        message: `Insufficient energy in community battery. Available: ${battery.totalStoredKwh.toFixed(1)} kWh, Requested: ${energyAmount} kWh`
      });
    }

    // Find client
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        status: "error",
        message: "Client not found"
      });
    }

    // Calculate actual price and cost (use battery price if not provided)
    const actualPricePerKwh = pricePerKwh || battery.energyPricePerKwh;
    const actualTotalCost = totalCost || (energyAmount * actualPricePerKwh);

    // Update battery energy level and add to releases
    battery.totalStoredKwh -= energyAmount;
    
    battery.releases.push({
      client: clientId,
      amountKwh: energyAmount,
      pricePerKwh: actualPricePerKwh,
      totalCost: actualTotalCost,
      releasedAt: new Date()
    });

    await battery.save();

    // Update client energy balance
    client.energyBalance += energyAmount;
    await client.save();

    // Create transaction record (if you have a Transaction model)
    // const transaction = await Transaction.create({
    //   from: 'Community Battery',
    //   to: clientId,
    //   energyAmount: energyAmount,
    //   pricePerKwh: actualPricePerKwh,
    //   totalValue: actualTotalCost,
    //   type: 'battery_purchase',
    //   status: 'completed'
    // });

    res.status(200).json({
      status: "success",
      message: `Successfully purchased ${energyAmount} kWh from community battery`,
      data: {
        purchase: {
          client: {
            id: client._id,
            name: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
            newBalance: client.energyBalance
          },
          energyAmount,
          pricePerKwh: actualPricePerKwh,
          totalCost: actualTotalCost,
          batteryRemaining: battery.totalStoredKwh
        }
      }
    });

  } catch (error) {
    console.error('Purchase from battery error:', error);
    res.status(500).json({
      status: "error",
      message: "Failed to process purchase from battery"
    });
  }
});

module.exports = {
  getBatteryStatus,
  getAllTransactions,
  depositEnergy,
  releaseEnergy,
  updateEnergyPrice,
  purchaseFromBattery
};