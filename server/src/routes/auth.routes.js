const express = require("express");
const jwt = require("jsonwebtoken");

const { config } = require("../config/env");

const router = express.Router();

router.post("/register/request-otp", (req, res) => {
  const { phone, country } = req.body;

  res.json({
    challengeId: "otp_challenge_demo_001",
    phone,
    country,
    returningUser: phone === "+256700123456",
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

router.post("/login", (req, res) => {
  const { phone, pin, password, deviceId } = req.body;

  if (!phone || (!pin && !password)) {
    return res.status(400).json({
      error: "Phone and PIN/password are required",
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
    biometricAvailable: true,
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
