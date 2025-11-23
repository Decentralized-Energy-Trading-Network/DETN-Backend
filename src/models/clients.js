const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ClientSchema = new mongoose.Schema({
  firstName: {
    type: String,
    trim: true,
    default: null
  },
  lastName: {
    type: String,
    trim: true,
    default: null
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    default: null
  },
  password: {
    type: String,
    select: false
  },
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  energyBalance: {
    type: Number,
    default: 0
  },
  transactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }],
  
  // NEW: Add solar panel and location fields
  location: { 
    type: String,
    default: null
  },
  lat: { 
    type: Number, 
    default: null 
  },
  lon: { 
    type: Number, 
    default: null 
  },
  status: { 
    type: String, 
    enum: ['active', 'deactive'], 
    default: 'active' 
  },
  isDeleted: { 
    type: Boolean, 
    default: false 
  },
  userType: { 
    type: String, 
    enum: ['factory', 'home'], 
    default: 'home' 
  },

  // NEW: Solar panel configuration
  solarPanel: {
    size: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium'
    },
    dailyProductionKwh: { 
      type: Number, 
      default: null 
    }
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  nonce: {
    type: String,
    default: () => Math.floor(Math.random() * 1000000).toString()
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add virtual for estimated daily production
ClientSchema.virtual('estimatedDailyProductionKwh').get(function() {
  if (this.solarPanel && typeof this.solarPanel.dailyProductionKwh === 'number') {
    return this.solarPanel.dailyProductionKwh;
  }
  const map = {
    small: 3.5,
    medium: 8.5,
    large: 15.0
  };
  const size = this.solarPanel && this.solarPanel.size ? this.solarPanel.size : 'medium';
  return map[size] || map['medium'];
});

// Hash password only if it exists and is modified
ClientSchema.pre('save', async function(next) {
  if (this.password && this.isModified('password')) {
    try {
      this.password = await bcrypt.hash(this.password, 12);
    } catch (error) {
      return next(error);
    }
  }
  
  if (this.walletAddress && this.isModified('walletAddress')) {
    this.walletAddress = this.walletAddress.toLowerCase();
  }
  
  next();
});

// Method to compare password
ClientSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate new nonce
ClientSchema.methods.generateNonce = function() {
  this.nonce = Math.floor(Math.random() * 1000000).toString();
  return this.nonce;
};

module.exports = mongoose.model('Client', ClientSchema);