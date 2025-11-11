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


module.exports = {
  registerClient,
  loginClient,
  getNonce,
  walletLogin,
  getClientProfile,
  updateEnergyBalance,
};
