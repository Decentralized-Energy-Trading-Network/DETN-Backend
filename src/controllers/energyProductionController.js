const asyncHandler = require("../utils/asyncHandler");
const Energy = require("../models/energy");
const Client = require("../models/clients");
const CommunityBattery = require("../models/communityBattery");
const axios = require("axios");

// Panel capacity map
const PANEL_CAPACITY = {
  small: 1.5,
  medium: 3.0,
  large: 5.0,
};

// Fixed project location
const FIXED_LOCATION = "colombo";

// Fetch real weather data for Colombo
const getSolarIrradiance = async () => {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${FIXED_LOCATION}&appid=${apiKey}`;

  const response = await axios.get(url);
  const weather = response.data;

  const cloudCover = weather.clouds?.all || 0;

  // Simple irradiance model
  // 1.0 kW/m² max sun intensity
  const irradianceKw = (1 - cloudCover / 100) * 1.0;

  return irradianceKw;
};

// Returns production in kWh for a single interval
const calculateSolarProduction = (
  panelSize = "medium",
  irradiance = 0.5,
  intervalMinutes = 30
) => {
  const PANEL_CAPACITY = {
    small: 1.5,
    medium: 3.0,
    large: 5.0,
  };

  const capacity = PANEL_CAPACITY[panelSize] || PANEL_CAPACITY["medium"];

  // Full day sunlight = 12 hours = 720 minutes
  const fullDayMinutes = 720;
  const dailyProduction = capacity * irradiance * 0.85; // 85% efficiency
  const perMinuteProduction = dailyProduction / fullDayMinutes;

  return parseFloat((perMinuteProduction * intervalMinutes).toFixed(4));
};

/*
------------------------------------------------
 GET CLIENT ENERGY
------------------------------------------------
*/
const getClientEnergy = asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const { startDate, endDate, limit = 30 } = req.query;

  const client = await Client.findById(clientId);
  if (!client)
    return res
      .status(404)
      .json({ status: "error", message: "Client not found" });

  const query = { client: clientId };  // Changed from 'client' to 'user'

  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const energyRecords = await Energy.find(query)
    .sort({ date: -1 })
    .limit(parseInt(limit));

  const totalProduction = energyRecords.reduce(
    (sum, r) => sum + r.dailyProductionKwh,
    0
  );
  const avg = energyRecords.length ? totalProduction / energyRecords.length : 0;

  return res.json({
    status: "success",
    data: {
      client: {
        _id: client._id,
        name: `${client.firstName} ${client.lastName}`,
        location: FIXED_LOCATION,
        panelSize: client.solarPanel?.size,
        energyBalance: client.energyBalance,
      },
      statistics: {
        totalRecords: energyRecords.length,
        totalProduction: parseFloat(totalProduction.toFixed(2)),
        averageProduction: parseFloat(avg.toFixed(2)),
      },
      records: energyRecords,
    },
  });
});

/*
------------------------------------------------
 ADD ENERGY (REAL SOLAR)
------------------------------------------------
*/
const addEnergy = asyncHandler(async (req, res) => {
  const {
    clientId,
    solarIrradiance,
    manualProduction,
    intervalMinutes = 30,
  } = req.body;

  // Fetch client
  const client = await Client.findById(clientId);
  if (!client) {
    return res
      .status(404)
      .json({ status: "error", message: "Client not found" });
  }

  if (client.status !== "active" || client.isDeleted) {
    return res
      .status(400)
      .json({ status: "error", message: "Client is not active" });
  }

  // Calculate production for this interval
  let productionKwh;
  let source;

  if (manualProduction !== undefined && manualProduction !== null) {
    productionKwh = parseFloat(manualProduction);
    source = "manual";
  } else {
    const panelSize = client.solarPanel?.size || "medium";
    const irradiance =
      solarIrradiance !== undefined ? parseFloat(solarIrradiance) : 4.5;
    productionKwh = calculateSolarProduction(
      panelSize,
      irradiance,
      intervalMinutes
    );
    source = "calculated";
  }

  // Clamp production if needed (optional)
  productionKwh = Math.min(productionKwh, 1);

  // Normalize date to UTC midnight
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Fix: Change 'client' to 'user' to match your schema
  const energyRecord = await Energy.findOneAndUpdate(
    { client: clientId, date: today },  // Changed from 'client' to 'user'
    {
      $inc: { dailyProductionKwh: productionKwh },
      $set: { source },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Update client balance
  client.energyBalance += productionKwh;
  await client.save();

  return res.status(201).json({
    status: "success",
    message: "Energy production recorded successfully",
    data: {
      producedKwh: parseFloat(productionKwh.toFixed(6)),
      totalDailyKwh: parseFloat(energyRecord.dailyProductionKwh.toFixed(6)),
      energyRecord: {
        _id: energyRecord._id,
        date: energyRecord.date,
        dailyProductionKwh: parseFloat(
          energyRecord.dailyProductionKwh.toFixed(6)
        ),
        source: energyRecord.source,
      },
      client: {
        _id: client._id,
        energyBalance: parseFloat(client.energyBalance.toFixed(6)),
      },
    },
  });
});


const getLiveProduction = asyncHandler(async (req, res) => {
  try {
    // Normalize date to UTC midnight (same as your addEnergy controller)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Get all active clients
    const clients = await Client.find({ 
      status: 'active', 
      isDeleted: false 
    }).select('firstName lastName walletAddress energyBalance solarPanel location lat lon userType status isDeleted');

    // Get today's energy production for all clients in one query
    const todayEnergy = await Energy.find({
      date: today,
      client: { $in: clients.map(client => client._id) }
    }).populate('client', 'firstName lastName walletAddress');

    // Create a map for quick lookup
    const energyMap = new Map();
    todayEnergy.forEach(energy => {
      energyMap.set(energy.client._id.toString(), energy);
    });

    // Format response data client-wise
    const clientProductions = clients.map(client => {
      const energyRecord = energyMap.get(client._id.toString());
      const dailyProductionKwh = energyRecord ? 
        parseFloat(energyRecord.dailyProductionKwh.toFixed(6)) : 0;

      return {
        clientId: client._id,
        name: `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Anonymous',
        walletAddress: client.walletAddress,
        energyBalance: parseFloat(client.energyBalance.toFixed(6)),
        dailyProductionKwh: dailyProductionKwh,
        estimatedDailyProductionKwh: client.estimatedDailyProductionKwh,
        location: client.location,
        coordinates: client.lat && client.lon ? 
          { lat: client.lat, lon: client.lon } : null,
        userType: client.userType,
        solarPanelSize: client.solarPanel?.size || 'medium',
        status: client.status,
        lastUpdated: energyRecord?.updatedAt || null,
        energyRecordId: energyRecord?._id || null
      };
    });

    // Calculate totals (similar to your structure)
    const totalEnergyProduced = clientProductions.reduce((sum, client) => 
      sum + client.dailyProductionKwh, 0
    );
    
    const totalEnergyBalance = clientProductions.reduce((sum, client) => 
      sum + client.energyBalance, 0
    );

    return res.status(200).json({
      status: "success",
      message: "Live energy production data fetched successfully",
      data: {
        clients: clientProductions,
        totals: {
          totalClients: clientProductions.length,
          totalEnergyProduced: parseFloat(totalEnergyProduced.toFixed(6)),
          totalEnergyBalance: parseFloat(totalEnergyBalance.toFixed(6))
        },
        timestamp: new Date().toISOString(),
        date: today
      }
    });

  } catch (error) {
    console.error('Dashboard API Error:', error);
    return res.status(500).json({
      status: "error",
      message: "Error fetching live production data",
      error: error.message
    });
  }
});



/*
------------------------------------------------
 BULK ENERGY USING REAL WEATHER
------------------------------------------------
*/
const addBulkEnergy = asyncHandler(async (req, res) => {
  const { interval = 30 } = req.body;

  const clients = await Client.find({ status: "active", isDeleted: false });

  let success = 0;
  let failed = 0;

  for (const client of clients) {
    try {
      const panelSize = client.solarPanel?.size || "medium";
      const energyKwh = await calculateSolarProduction(panelSize, interval);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existing = await Energy.findOne({
        client: client._id,  // Changed from 'client' to 'user'
        date: today,
      });

      if (existing) {
        existing.dailyProductionKwh += energyKwh;
        existing.source = "real-weather";
        await existing.save();
      } else {
        await Energy.create({
          client: client._id,  // Changed from 'client' to 'user'
          date: today,
          dailyProductionKwh: energyKwh,
          source: "real-weather",
        });
      }

      client.energyBalance += energyKwh;
      await client.save();

      success++;
    } catch (e) {
      failed++;
    }
  }

  res.json({
    status: "success",
    message: "Bulk solar energy (real weather) processed",
    data: { total: clients.length, success, failed },
  });
});


const getTotalEnergyProduction = asyncHandler(async (req, res) => {
  const { period = 'today' } = req.query; // today, week, month, year
  
  let startDate, endDate = new Date();
  
  switch (period) {
    case 'today':
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case 'year':
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
  }

  // Get total energy production
  const totalProduction = await Energy.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalProduction: { $sum: "$dailyProductionKwh" },
        recordCount: { $sum: 1 }
      }
    }
  ]);

  // Get active clients count
  const activeClients = await Client.countDocuments({ 
    status: "active", 
    isDeleted: false 
  });

  // Get today's production for comparison
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const todayProduction = await Energy.aggregate([
    {
      $match: {
        date: { $gte: todayStart, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$dailyProductionKwh" }
      }
    }
  ]);

  const yesterdayProduction = await Energy.aggregate([
    {
      $match: {
        date: { $gte: yesterdayStart, $lt: todayStart }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$dailyProductionKwh" }
      }
    }
  ]);

  const todayTotal = todayProduction[0]?.total || 0;
  const yesterdayTotal = yesterdayProduction[0]?.total || 0;
  
  // Calculate percentage change
  let percentageChange = 0;
  if (yesterdayTotal > 0) {
    percentageChange = ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100;
  }

  return res.json({
    status: "success",
    data: {
      period,
      totalProduction: parseFloat((totalProduction[0]?.totalProduction || 0).toFixed(2)),
      averagePerClient: parseFloat(((totalProduction[0]?.totalProduction || 0) / activeClients).toFixed(2)),
      activeClients,
      recordCount: totalProduction[0]?.recordCount || 0,
      todayProduction: parseFloat(todayTotal.toFixed(2)),
      percentageChange: parseFloat(percentageChange.toFixed(1)),
      timeRange: {
        start: startDate,
        end: endDate
      }
    }
  });
});

/*
------------------------------------------------
 GET ENERGY TRADE TODAY
------------------------------------------------
*/
const getEnergyTradeToday = asyncHandler(async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Get community battery transactions for today
  const battery = await CommunityBattery.findOne()
    .populate('deposits.client', 'firstName lastName')
    .populate('releases.client', 'firstName lastName');

  if (!battery) {
    return res.json({
      status: "success",
      data: {
        totalTraded: 0,
        totalDeposits: 0,
        totalReleases: 0,
        totalValue: 0,
        deposits: [],
        releases: [],
        hourlyFlow: generateEmptyHourlyFlow()
      }
    });
  }

  // Filter today's transactions
  const todayDeposits = battery.deposits.filter(deposit => 
    deposit.depositedAt >= todayStart && deposit.depositedAt <= todayEnd
  );

  const todayReleases = battery.releases.filter(release => 
    release.releasedAt >= todayStart && release.releasedAt <= todayEnd
  );

  // Calculate totals
  const totalDeposits = todayDeposits.reduce((sum, deposit) => sum + deposit.amountKwh, 0);
  const totalReleases = todayReleases.reduce((sum, release) => sum + release.amountKwh, 0);
  const totalTraded = totalDeposits + totalReleases;
  const totalValue = (totalDeposits * battery.energyPricePerKwh) + (totalReleases * battery.energyPricePerKwh);

  // Generate hourly flow data
  const hourlyFlow = generateHourlyFlowData(todayDeposits, todayReleases);

  return res.json({
    status: "success",
    data: {
      totalTraded: parseFloat(totalTraded.toFixed(2)),
      totalDeposits: parseFloat(totalDeposits.toFixed(2)),
      totalReleases: parseFloat(totalReleases.toFixed(2)),
      totalValue: parseFloat(totalValue.toFixed(2)),
      currentPrice: parseFloat(battery.energyPricePerKwh.toFixed(4)),
      transactionCount: todayDeposits.length + todayReleases.length,
      deposits: todayDeposits.map(d => ({
        id: d._id,
        client: d.client,
        amountKwh: parseFloat(d.amountKwh.toFixed(2)),
        pricePerKwh: parseFloat(d.pricePerKwh.toFixed(4)),
        totalEarnings: parseFloat(d.totalEarnings.toFixed(2)),
        timestamp: d.depositedAt
      })),
      releases: todayReleases.map(r => ({
        id: r._id,
        client: r.client,
        amountKwh: parseFloat(r.amountKwh.toFixed(2)),
        pricePerKwh: parseFloat(r.pricePerKwh.toFixed(4)),
        totalCost: parseFloat(r.totalCost.toFixed(2)),
        timestamp: r.releasedAt
      })),
      hourlyFlow
    }
  });
});

/*
------------------------------------------------
 GET REAL-TIME ENERGY FLOW
------------------------------------------------
*/
const getRealTimeEnergyFlow = asyncHandler(async (req, res) => {
  const now = new Date();
  const currentHour = now.getHours();
  
  // Generate time slots for the last 12 hours
  const timeSlots = [];
  for (let i = 11; i >= 0; i--) {
    const hour = (currentHour - i + 24) % 24;
    timeSlots.push({
      time: `${hour.toString().padStart(2, '0')}:00`,
      hour: hour
    });
  }

  // Get production data for today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const energyData = await Energy.aggregate([
    {
      $match: {
        date: { $gte: todayStart }
      }
    },
    {
      $group: {
        _id: { $hour: "$createdAt" },
        production: { $sum: "$dailyProductionKwh" },
        recordCount: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Get trading data for today from community battery
  const battery = await CommunityBattery.findOne();
  let tradingData = [];
  
  if (battery) {
    tradingData = await getTradingDataByHour(battery, todayStart);
  }

  // Combine data into time slots
  const flowData = timeSlots.map(slot => {
    const productionRecord = energyData.find(d => d._id === slot.hour);
    const tradingRecord = tradingData.find(d => d.hour === slot.hour);
    
    // Simulate consumption based on production and time of day
    const baseConsumption = getBaseConsumption(slot.hour);
    const production = productionRecord ? productionRecord.production / productionRecord.recordCount : 0;
    const trading = tradingRecord ? tradingRecord.trading : 0;
    const consumption = baseConsumption + (production * 0.3); // Consumption increases with production

    return {
      time: slot.time,
      production: parseFloat(production.toFixed(2)),
      consumption: parseFloat(consumption.toFixed(2)),
      trading: parseFloat(trading.toFixed(2)),
      netFlow: parseFloat((production - consumption).toFixed(2))
    };
  });

  // Get current system status
  const currentProduction = flowData[flowData.length - 1]?.production || 0;
  const currentConsumption = flowData[flowData.length - 1]?.consumption || 0;
  const currentTrading = flowData[flowData.length - 1]?.trading || 0;

  return res.json({
    status: "success",
    data: {
      current: {
        production: currentProduction,
        consumption: currentConsumption,
        trading: currentTrading,
        netFlow: parseFloat((currentProduction - currentConsumption).toFixed(2)),
        timestamp: now
      },
      hourlyFlow: flowData,
      summary: {
        totalProduction: parseFloat(flowData.reduce((sum, d) => sum + d.production, 0).toFixed(2)),
        totalConsumption: parseFloat(flowData.reduce((sum, d) => sum + d.consumption, 0).toFixed(2)),
        totalTrading: parseFloat(flowData.reduce((sum, d) => sum + d.trading, 0).toFixed(2))
      }
    }
  });
});

// Helper function to generate hourly flow data for trading
async function getTradingDataByHour(battery, todayStart) {
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);

  const todayDeposits = battery.deposits.filter(d => 
    d.depositedAt >= todayStart && d.depositedAt <= todayEnd
  );
  
  const todayReleases = battery.releases.filter(r => 
    r.releasedAt >= todayStart && r.releasedAt <= todayEnd
  );

  const hourlyData = {};
  
  // Initialize all hours
  for (let hour = 0; hour < 24; hour++) {
    hourlyData[hour] = { trading: 0 };
  }
  
  // Sum deposits by hour
  todayDeposits.forEach(deposit => {
    const hour = new Date(deposit.depositedAt).getHours();
    hourlyData[hour].trading += deposit.amountKwh;
  });
  
  // Sum releases by hour
  todayReleases.forEach(release => {
    const hour = new Date(release.releasedAt).getHours();
    hourlyData[hour].trading += release.amountKwh;
  });

  return Object.entries(hourlyData).map(([hour, data]) => ({
    hour: parseInt(hour),
    trading: data.trading
  }));
}

// Helper function to generate base consumption based on time of day
function getBaseConsumption(hour) {
  // Consumption pattern: low at night, peaks in morning and evening
  if (hour >= 0 && hour < 6) return 5 + Math.random() * 5; // Night
  if (hour >= 6 && hour < 9) return 15 + Math.random() * 10; // Morning peak
  if (hour >= 9 && hour < 17) return 10 + Math.random() * 8; // Day
  if (hour >= 17 && hour < 22) return 20 + Math.random() * 15; // Evening peak
  return 8 + Math.random() * 6; // Late evening
}

// Helper function to generate hourly flow data
function generateHourlyFlowData(deposits, releases) {
  const hourlyData = {};
  
  // Initialize all hours with 0
  for (let hour = 0; hour < 24; hour++) {
    hourlyData[hour] = { deposits: 0, releases: 0 };
  }
  
  // Sum deposits by hour
  deposits.forEach(deposit => {
    const hour = new Date(deposit.depositedAt).getHours();
    hourlyData[hour].deposits += deposit.amountKwh;
  });
  
  // Sum releases by hour
  releases.forEach(release => {
    const hour = new Date(release.releasedAt).getHours();
    hourlyData[hour].releases += release.amountKwh;
  });

  // Convert to array format for chart
  return Object.entries(hourlyData).map(([hour, data]) => ({
    time: `${hour.toString().padStart(2, '0')}:00`,
    deposits: parseFloat(data.deposits.toFixed(2)),
    releases: parseFloat(data.releases.toFixed(2)),
    netFlow: parseFloat((data.deposits - data.releases).toFixed(2))
  }));
}

// Helper function for empty hourly flow
function generateEmptyHourlyFlow() {
  const flow = [];
  for (let hour = 0; hour < 24; hour++) {
    flow.push({
      time: `${hour.toString().padStart(2, '0')}:00`,
      deposits: 0,
      releases: 0,
      netFlow: 0
    });
  }
  return flow;
}

// Export all functions including the new ones
module.exports = { 
  getClientEnergy, 
  addEnergy, 
  addBulkEnergy,
  getTotalEnergyProduction,
  getEnergyTradeToday,
  getRealTimeEnergyFlow,
  getLiveProduction
};
