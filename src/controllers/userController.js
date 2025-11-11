const jwt = require("jsonwebtoken");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your_jwt_secret', {
    expiresIn: '30d',
  });
};

// Register user
const registerUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    location,
    userType,
    solarPanel 
  } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({
      status: "error",
      message: "User already exists"
    });
  }

  // Create user
  const user = await User.create({
    firstName,
    lastName,
    email,
    password,
    location,
    userType,
    solarPanel
  });

  if (user) {
    const token = generateToken(user._id);

    return res.status(201).json({
      status: "success",
      message: "User registered successfully",
      data: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        location: user.location,
        userType: user.userType,
        status: user.status,
        isDeleted: user.isDeleted,
        solarPanel: user.solarPanel,
        estimatedDailyProductionKwh: user.estimatedDailyProductionKwh,
        token: token
      }
    });
  } else {
    return res.status(400).json({
      status: "error",
      message: "Invalid user data"
    });
  }
});

// Login user
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    return res.status(200).json({
      status: "success",
      message: "User logged in successfully",
      data: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        location: user.location,
        userType: user.userType,
        status: user.status,
        isDeleted: user.isDeleted,
        solarPanel: user.solarPanel,
        estimatedDailyProductionKwh: user.estimatedDailyProductionKwh,
        token: generateToken(user._id)
      }
    });
  } else {
    return res.status(401).json({
      status: "error",
      message: "Invalid email or password"
    });
  }
});

// Get current user's profile
const getUserProfile = asyncHandler(async (req, res) => {
  const userId = req.user && req.user.id ? req.user.id : null;
  if (!userId) {
    return res.status(401).json({ status: "error", message: "Not authorized" });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ status: "error", message: "User not found" });
  }

  return res.status(200).json({
    status: "success",
    data: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      location: user.location,
      userType: user.userType,
      status: user.status,
      isDeleted: user.isDeleted,
      solarPanel: user.solarPanel,
      estimatedDailyProductionKwh: user.estimatedDailyProductionKwh
    }
  });
});

// Update current user's profile
const updateUserProfile = asyncHandler(async (req, res) => {
  const userId = req.user && req.user.id ? req.user.id : null;
  if (!userId) {
    return res.status(401).json({ status: "error", message: "Not authorized" });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ status: "error", message: "User not found" });
  }

  const {
    firstName,
    lastName,
    email,
    password,
    location,
    userType,
    solarPanel // allow updating solarPanel object
  } = req.body;

  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (email) user.email = email;
  if (typeof location !== "undefined") user.location = location;
  if (typeof userType !== "undefined") user.userType = userType;
  if (solarPanel) user.solarPanel = {
    ...user.solarPanel?.toObject?.() || user.solarPanel || {},
    ...solarPanel
  };
  if (password) user.password = password; // will be hashed by pre-save

  const updatedUser = await user.save();

  return res.status(200).json({
    status: "success",
    message: "Profile updated",
    data: {
      _id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      location: updatedUser.location,
      userType: updatedUser.userType,
      status: updatedUser.status,
      isDeleted: updatedUser.isDeleted,
      solarPanel: updatedUser.solarPanel,
      estimatedDailyProductionKwh: updatedUser.estimatedDailyProductionKwh
    }
  });
});

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile
};