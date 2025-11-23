const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  energyAmount: {
    type: Number,
    required: true,
    min: 0
  },
  pricePerUnit: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['open', 'completed', 'cancelled'],
    default: 'open'
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    default: null
  },
  expiresAt: {
    type: Date,
    default: () => new Date(+new Date() + 24*60*60*1000) // 24 hours from creation
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Add index for better query performance
OrderSchema.index({ status: 1, expiresAt: 1 });
OrderSchema.index({ seller: 1, status: 1 });
OrderSchema.index({ buyer: 1, status: 1 });

module.exports = mongoose.model('Order', OrderSchema);