const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true},
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // new fields
    location: { type: String },
    lat: { type: Number, default: null },
    lon: { type: Number, default: null },
    status: { type: String, enum: ['active', 'deactive'], default: 'active' },
    isDeleted: { type: Boolean, default: false },

    userType: { type: String, enum: ['factory', 'home'], default: 'home' },

    solarPanel: {
        size: {
            type: String,
            enum: ['small', 'medium', 'large'],
            default: 'medium'
        },
        // daily production in kWh (kilowatt-hours per day)
        dailyProductionKwh: { type: Number, default: null }
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Hash the password before saving
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Get full name virtual
userSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Estimate daily production (kWh/day) based on solarPanel.size unless dailyProductionKwh is explicitly set
userSchema.virtual('estimatedDailyProductionKwh').get(function() {
    if (this.solarPanel && typeof this.solarPanel.dailyProductionKwh === 'number') {
        return this.solarPanel.dailyProductionKwh;
    }
    const map = {
        small: 3.5,   // example kWh/day for small system
        medium: 8.5,  // example kWh/day for medium system
        large: 15.0   // example kWh/day for large system
    };
    const size = this.solarPanel && this.solarPanel.size ? this.solarPanel.size : 'medium';
    return map[size] || map['medium'];
});

module.exports = mongoose.model("User", userSchema);