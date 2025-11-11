const asyncHandler = require("../utils/asyncHandler");
const Energy = require("../models/energy");
const Client = require("../models/clients");
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

module.exports = { getClientEnergy, addEnergy, addBulkEnergy };
