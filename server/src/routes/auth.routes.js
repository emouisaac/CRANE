const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const { config } = require("../config/env");
const {
  findAuthUserByPhone,
  upsertAuthUser,
  touchAuthUserLogin,
} = require("../config/database");

const router = express.Router();

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function createBorrowerSession(user, deviceId) {
  const accessToken = jwt.sign(
    { sub: user.id, phone: user.phone, email: user.email, deviceId, scope: ["borrower"] },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  return {
    token: accessToken,
    accessToken,
    refreshToken: "refresh_demo_token",
    onboardingState: "kyc_pending",
    biometricAvailable: true,
    deviceBound: true,
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email || null,
      isRegistered: true,
      lastLoginAt: user.last_login_at || null,
    },
  };
}

router.post("/register/request-otp", (req, res) => {
  const { phone, country } = req.body;
  const existingUser = findAuthUserByPhone(phone);

  res.json({
    challengeId: "otp_challenge_demo_001",
    phone,
    country,
    returningUser: Boolean(existingUser),
    deliveryStatus: "queued",
    expiresInSeconds: 120,
  });
});

router.post("/register/verify-otp", (req, res) => {
  const { phone, otp, deviceId } = req.body;

  if (otp !== "123456") {
    return res.status(401).json({
      error: "Invalid OTP",
      code: "OTP_INVALID",
    });
  }

  const accessToken = jwt.sign(
    { sub: "user_demo_001", phone, deviceId, scope: ["borrower"] },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  return res.json({
    accessToken,
    refreshToken: "refresh_demo_token",
    onboardingState: "kyc_pending",
    deviceBound: true,
  });
});

router.post("/register", (req, res) => {
  const { phone, email, pin, deviceId } = req.body;

  // Validate PIN
  if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({
      error: "PIN must be 6 digits",
      code: "PIN_INVALID",
    });
  }

  // Validate email if provided
  if (email && email.trim() !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Please enter a valid email address",
        code: "EMAIL_INVALID",
      });
    }
  }

  const user = upsertAuthUser({
    phone,
    email: email || null,
    pinHash: hashSecret(pin),
  });

  return res.json(createBorrowerSession(user, deviceId));
});

router.post("/login", (req, res) => {
  const { phone, pin, password, deviceId } = req.body;

  if (!phone || (!pin && !password)) {
    return res.status(400).json({
      error: "Phone and PIN/password are required",
    });
  }

  const user = findAuthUserByPhone(phone);

  if (!user) {
    return res.status(401).json({
      error: "User not registered. Please register first.",
      code: "USER_NOT_REGISTERED",
    });
  }

  // Validate PIN if provided
  if (pin && (pin.length !== 6 || !/^\d{6}$/.test(pin))) {
    return res.status(400).json({
      error: "PIN must be 6 digits",
      code: "PIN_INVALID",
    });
  }

  const suppliedSecret = pin || password;
  if (user.pin_hash !== hashSecret(suppliedSecret)) {
    return res.status(401).json({
      error: "Invalid phone or PIN.",
      code: "AUTH_INVALID",
    });
  }

  const updatedUser = touchAuthUserLogin(phone) || user;

  return res.json(createBorrowerSession(updatedUser, deviceId));
});

router.post("/admin/login", (req, res) => {
  const { password, deviceId } = req.body;

  // Unique admin password - should be changed in production
  const ADMIN_PASSWORD = config.adminPassword;

  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: "Invalid admin credentials",
      code: "ADMIN_AUTH_FAILED",
    });
  }

  const accessToken = jwt.sign(
    {
      sub: "admin_demo_001",
      role: "admin",
      deviceId,
      scope: ["admin", "borrower"]
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  return res.json({
    accessToken,
    refreshToken: "admin_refresh_demo_token",
    role: "admin",
    deviceBound: true,
  });
});

router.post("/biometric/assertion", (req, res) => {
  res.json({
    accessToken: "biometric_access_demo",
    refreshToken: "biometric_refresh_demo",
    deviceBound: true,
    authMethod: "biometric",
  });
});

router.post("/logout", (req, res) => {
  res.status(204).send();
});

module.exports = router;
