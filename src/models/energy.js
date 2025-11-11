const mongoose = require("mongoose");

const energySchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  dailyProductionKwh: {
    type: Number,
    required: true,
    default: 0
  },
  source: {
    type: String,
    enum: ['manual', 'estimation', 'meter'],
    default: 'manual'
  }
}, {
  timestamps: true
});

energySchema.index({ client: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Energy", energySchema);