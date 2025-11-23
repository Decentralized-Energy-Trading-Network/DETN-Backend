const Client = require("../models/clients");
const asyncHandler = require("../utils/asyncHandler");
const { ethers } = require("ethers");

const registerClient = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    walletAddress,
    signature,
    registrationMessage,
  } = req.body;

  // Validate required fields
  if (!walletAddress) {
    return res.status(400).json({
      status: "error",
      message: "Wallet address is required",
    });
  }

  // Check if client exists with email (if provided)
  if (email) {
    const clientWithEmail = await Client.findOne({ email });
    if (clientWithEmail) {
      return res.status(400).json({
        status: "error",
        message: "Email already registered",
      });
    }
  }

  // Check if wallet address already exists
  const normalizedWalletAddress = walletAddress.toLowerCase();
  const clientWithWallet = await Client.findOne({
    walletAddress: normalizedWalletAddress,
  });

  if (clientWithWallet) {
    return res.status(400).json({
      status: "error",
      message: "Wallet address already registered",
    });
  }

  // Verify signature if provided (for Web3 registration)
  if (signature && registrationMessage) {
    try {
      const recoveredAddress = ethers.verifyMessage(
        registrationMessage,
        signature
      );
      if (
        recoveredAddress.toLowerCase() !== normalizedWalletAddress.toLowerCase()
      ) {
        return res.status(401).json({
          status: "error",
          message: "Invalid signature for registration",
        });
      }
    } catch (error) {
      return res.status(401).json({
        status: "error",
        message: "Signature verification failed",
      });
    }
  }

  // Create client
  const clientData = {
    walletAddress: normalizedWalletAddress,
    nonce: Math.floor(Math.random() * 1000000).toString(),
  };

  // Add optional fields only if they exist
  if (firstName) clientData.firstName = firstName;
  if (lastName) clientData.lastName = lastName;
  if (email) clientData.email = email;
  if (password) clientData.password = password;

  const client = await Client.create(clientData);

  return res.status(201).json({
    status: "success",
    message: "Client registered successfully",
    data: {
      _id: client._id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      walletAddress: client.walletAddress,
      energyBalance: client.energyBalance,
    },
  });
});

const loginClient = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: "error",
      message: "Email and password are required",
    });
  }

  // Find client by email and explicitly select password
  const client = await Client.findOne({ email }).select("+password");

  if (!client) {
    return res.status(401).json({
      status: "error",
      message: "Invalid email or password",
    });
  }

  if (!client.password) {
    return res.status(401).json({
      status: "error",
      message: "Password login not available for this account",
    });
  }

  const isPasswordValid = await client.comparePassword(password);

  if (!isPasswordValid) {
    return res.status(401).json({
      status: "error",
      message: "Invalid email or password",
    });
  }

  return res.status(200).json({
    status: "success",
    message: "Login successful",
    data: {
      _id: client._id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      walletAddress: client.walletAddress,
      energyBalance: client.energyBalance,
    },
  });
});

const getNonce = asyncHandler(async (req, res) => {
  const { walletAddress } = req.params;

  if (!walletAddress) {
    return res.status(400).json({
      status: "error",
      message: "Wallet address is required",
    });
  }

  const normalizedWalletAddress = walletAddress.toLowerCase();
  let client = await Client.findOne({ walletAddress: normalizedWalletAddress });

  // Create client if doesn't exist (for first-time wallet users)
  if (!client) {
    client = await Client.create({
      walletAddress: normalizedWalletAddress,
      nonce: Math.floor(Math.random() * 1000000).toString(),
    });
  } else {
    // Update nonce for existing client
    client.nonce = Math.floor(Math.random() * 1000000).toString();
    await client.save();
  }

  return res.status(200).json({
    status: "success",
    message: "Nonce generated successfully",
    data: {
      nonce: client.nonce,
      walletAddress: client.walletAddress,
    },
  });
});

const walletLogin = asyncHandler(async (req, res) => {
  const { walletAddress, signature } = req.body;

  if (!walletAddress || !signature) {
    return res.status(400).json({
      status: "error",
      message: "Wallet address and signature are required",
    });
  }

  const normalizedWalletAddress = walletAddress.toLowerCase();
  const client = await Client.findOne({
    walletAddress: normalizedWalletAddress,
  });

  if (!client) {
    return res.status(404).json({
      status: "error",
      message: "Wallet not registered. Please sign up first.",
    });
  }

  // Create the exact same message that was shown to the user
  const message = `I am signing my one-time nonce: ${client.nonce}`;

  console.log("Verifying signature:", {
    walletAddress: normalizedWalletAddress,
    message: message,
    signature: signature,
    nonce: client.nonce,
  });

  try {
    // Verify the signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    console.log("Recovered address:", recoveredAddress);

    
    // Update nonce after successful verification
    client.nonce = Math.floor(Math.random() * 1000000).toString();
    await client.save();

    return res.status(200).json({
      status: "success",
      message: "Wallet authentication successful",
      data: {
        _id: client._id,
        walletAddress: client.walletAddress,
        energyBalance: client.energyBalance,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
      },
    });
  } catch (error) {
    console.error("Signature verification error:", error);
    return res.status(401).json({
      status: "error",
      message: `Signature verification failed: ${error.message}`,
    });
  }
});

const getClientProfile = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.user.id);

  if (!client) {
    return res.status(404).json({
      status: "error",
      message: "Client not found",
    });
  }

  return res.status(200).json({
    status: "success",
    data: {
      _id: client._id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      walletAddress: client.walletAddress,
      energyBalance: client.energyBalance,
      createdAt: client.createdAt,
    },
  });
});

const updateEnergyBalance = asyncHandler(async (req, res) => {
  const { walletAddress, amount } = req.body;

  if (!walletAddress || amount === undefined) {
    return res.status(400).json({
      status: "error",
      message: "Wallet address and amount are required",
    });
  }

  const normalizedWalletAddress = walletAddress.toLowerCase();
  const client = await Client.findOne({ walletAddress: normalizedWalletAddress });

  if (!client) {
    return res.status(404).json({
      status: "error",
      message: "Client not found",
    });
  }

  // Replace the energy balance with the new value instead of adding
  const oldEnergyBalance = client.energyBalance;
  client.energyBalance = Number(amount);
  await client.save();

  return res.status(200).json({
    status: "success",
    message: "Energy balance updated successfully",
    data: {
      walletAddress: client.walletAddress,
      oldEnergyBalance: oldEnergyBalance,
      newEnergyBalance: client.energyBalance,
    },
  });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || '';
  const userType = req.query.userType || 'all';
  const status = req.query.status || 'all';

  const skip = (page - 1) * limit;

  // Build filter object
  let filter = { isDeleted: false };

  // Search filter
  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { walletAddress: { $regex: search, $options: 'i' } }
    ];
  }

  // User type filter
  if (userType !== 'all') {
    filter.userType = userType;
  }

  // Status filter
  if (status !== 'all') {
    filter.status = status;
  }

  try {
    // Try to populate transactions, but fallback if model doesn't exist
    let usersQuery = Client.find(filter)
      .select('-password -nonce')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Check if Transaction model exists before populating
    const mongoose = require('mongoose');
    if (mongoose.models.Transaction) {
      usersQuery = usersQuery.populate('transactions');
    }

    const users = await usersQuery;

    const total = await Client.countDocuments(filter);

    res.status(200).json({
      status: "success",
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    if (error.name === 'MissingSchemaError') {
      // If population fails, get users without transactions
      const users = await Client.find(filter)
        .select('-password -nonce')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      const total = await Client.countDocuments(filter);

      res.status(200).json({
        status: "success",
        data: {
          users,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } else {
      throw error;
    }
  }
});

const getUserById = asyncHandler(async (req, res) => {
  const user = await Client.findById(req.params.id)
    .select('-password -nonce')
    .populate('transactions');

  if (!user || user.isDeleted) {
    return res.status(404).json({
      status: "error",
      message: "User not found"
    });
  }

  res.status(200).json({
    status: "success",
    data: { user }
  });
});

// @desc    Create new user (Admin)
// @route   POST /api/users
// @access  Private/Admin
const createUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    walletAddress,
    location,
    lat,
    lon,
    userType,
    solarPanel
  } = req.body;

  // Check if wallet address already exists
  const existingWallet = await Client.findOne({ 
    walletAddress: walletAddress.toLowerCase(),
    isDeleted: false 
  });

  if (existingWallet) {
    return res.status(400).json({
      status: "error",
      message: "Wallet address already exists"
    });
  }

  // Check if email already exists (if provided)
  if (email) {
    const existingEmail = await Client.findOne({ 
      email: email.toLowerCase(),
      isDeleted: false 
    });

    if (existingEmail) {
      return res.status(400).json({
        status: "error",
        message: "Email already exists"
      });
    }
  }

  const user = await Client.create({
    firstName,
    lastName,
    email: email ? email.toLowerCase() : null,
    password, // Will be hashed by pre-save middleware
    walletAddress: walletAddress.toLowerCase(),
    location,
    lat,
    lon,
    userType: userType || 'home',
    solarPanel: solarPanel || { size: 'medium' },
    status: 'active'
  });

  // Return user without sensitive data
  const userResponse = await Client.findById(user._id).select('-password -nonce');

  res.status(201).json({
    status: "success",
    message: "User created successfully",
    data: { user: userResponse }
  });
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    location,
    lat,
    lon,
    status,
    userType,
    solarPanel,
    energyBalance
  } = req.body;

  const user = await Client.findById(req.params.id);

  if (!user || user.isDeleted) {
    return res.status(404).json({
      status: "error",
      message: "User not found"
    });
  }

  // Check if email already exists (if changing email)
  if (email && email !== user.email) {
    const existingEmail = await Client.findOne({ 
      email: email.toLowerCase(),
      isDeleted: false,
      _id: { $ne: req.params.id }
    });

    if (existingEmail) {
      return res.status(400).json({
        status: "error",
        message: "Email already exists"
      });
    }
  }

  // Update fields
  const updateData = {
    ...(firstName !== undefined && { firstName }),
    ...(lastName !== undefined && { lastName }),
    ...(email !== undefined && { email: email ? email.toLowerCase() : null }),
    ...(location !== undefined && { location }),
    ...(lat !== undefined && { lat }),
    ...(lon !== undefined && { lon }),
    ...(status !== undefined && { status }),
    ...(userType !== undefined && { userType }),
    ...(energyBalance !== undefined && { energyBalance }),
    ...(solarPanel !== undefined && { 
      solarPanel: {
        ...user.solarPanel.toObject(),
        ...solarPanel
      }
    })
  };

  const updatedUser = await Client.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  ).select('-password -nonce');

  res.status(200).json({
    status: "success",
    message: "User updated successfully",
    data: { user: updatedUser }
  });
});

// @desc    Delete user (soft delete)
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  const user = await Client.findById(req.params.id);

  if (!user || user.isDeleted) {
    return res.status(404).json({
      status: "error",
      message: "User not found"
    });
  }

  // Soft delete by setting isDeleted to true
  user.isDeleted = true;
  await user.save();

  res.status(200).json({
    status: "success",
    message: "User deleted successfully"
  });
});

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private/Admin
const getUserStats = asyncHandler(async (req, res) => {
  const totalUsers = await Client.countDocuments({ isDeleted: false });
  const activeUsers = await Client.countDocuments({ 
    status: 'active', 
    isDeleted: false 
  });
  const homeUsers = await Client.countDocuments({ 
    userType: 'home', 
    isDeleted: false 
  });
  const factoryUsers = await Client.countDocuments({ 
    userType: 'factory', 
    isDeleted: false 
  });

  // Recent users (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentUsers = await Client.countDocuments({
    createdAt: { $gte: sevenDaysAgo },
    isDeleted: false
  });

  // Energy statistics
  const energyStats = await Client.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: null,
        totalEnergy: { $sum: "$energyBalance" },
        avgEnergy: { $avg: "$energyBalance" },
        maxEnergy: { $max: "$energyBalance" }
      }
    }
  ]);

  res.status(200).json({
    status: "success",
    data: {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      homeUsers,
      factoryUsers,
      recentUsers,
      energyStats: energyStats[0] || { totalEnergy: 0, avgEnergy: 0, maxEnergy: 0 }
    }
  });
});

// @desc    Update user password (admin function)
// @route   PUT /api/users/:id/password
// @access  Private/Admin
const updateUserPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      status: "error",
      message: "Password is required"
    });
  }

  const user = await Client.findById(req.params.id);

  if (!user || user.isDeleted) {
    return res.status(404).json({
      status: "error",
      message: "User not found"
    });
  }

  // Update password (will be hashed by pre-save middleware)
  user.password = password;
  await user.save();

  res.status(200).json({
    status: "success",
    message: "Password updated successfully"
  });
});

// @desc    Bulk update user status
// @route   PUT /api/users/bulk/status
// @access  Private/Admin
const bulkUpdateUserStatus = asyncHandler(async (req, res) => {
  const { userIds, status } = req.body;

  if (!userIds || !status || !['active', 'deactive'].includes(status)) {
    return res.status(400).json({
      status: "error",
      message: "User IDs and valid status are required"
    });
  }

  const result = await Client.updateMany(
    { _id: { $in: userIds }, isDeleted: false },
    { status }
  );

  res.status(200).json({
    status: "success",
    message: `${result.modifiedCount} users updated successfully`,
    data: { modifiedCount: result.modifiedCount }
  });
});

// @desc    Get user activity log (placeholder - you might want to implement proper activity tracking)
// @route   GET /api/users/:id/activity
// @access  Private/Admin
const getUserActivity = asyncHandler(async (req, res) => {
  const user = await Client.findById(req.params.id)
    .select('-password -nonce')
    .populate('transactions');

  if (!user || user.isDeleted) {
    return res.status(404).json({
      status: "error",
      message: "User not found"
    });
  }

  // This is a simplified activity log - you might want to create a separate Activity model
  const activityLog = [
    {
      action: 'user_created',
      timestamp: user.createdAt,
      description: 'User account created'
    },
    {
      action: 'last_updated',
      timestamp: user.updatedAt,
      description: 'Profile last updated'
    }
    // Add more activities based on your business logic
  ];

  res.status(200).json({
    status: "success",
    data: {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        walletAddress: user.walletAddress
      },
      activity: activityLog
    }
  });
});


module.exports = {
  registerClient,
  loginClient,
  getNonce,
  walletLogin,
  getClientProfile,
  updateEnergyBalance,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserStats,
  updateUserPassword,
  bulkUpdateUserStatus,
  getUserActivity
};