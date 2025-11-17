const mongoose = require('mongoose');

const communityBatterySchema = new mongoose.Schema({
  totalStoredKwh: {
    type: Number,
    required: true,
    default: 0
  },
  energyPricePerKwh: {
    type: Number,
    required: true,
    default: 0.15 // Default price per kWh
  },
  releases: [
    {
      client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
      amountKwh: { type: Number, required: true },
      pricePerKwh: { type: Number, required: true },
      totalCost: { type: Number, required: true },
      releasedAt: { type: Date, default: Date.now }
    }
  ],
  deposits: [
    {
      client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
      amountKwh: { type: Number, required: true },
      pricePerKwh: { type: Number, required: true },
      totalEarnings: { type: Number, required: true },
      depositedAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('CommunityBattery', communityBatterySchema);