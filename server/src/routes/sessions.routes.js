const express = require("express");
const jwt = require("jsonwebtoken");

const { config } = require("../config/env");
const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

router.get("/current", authenticate, requireBoundDevice, (req, res) => {
  res.json({
    session: {
      userId: req.user.sub,
      deviceId: req.device.id,
      status: "active",
      deviceTrusted: true,
    },
  });
});

router.post("/refresh", (req, res) => {
  const { refreshToken, phone, deviceId } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  const accessToken = jwt.sign(
    { sub: "user_demo_001", phone, deviceId, scope: ["borrower"] },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  return res.json({
    accessToken,
    refreshToken: "refresh_demo_token_rotated",
  });
});

router.get("/devices", authenticate, requireBoundDevice, (req, res) => {
  res.json({
    devices: [
      {
        id: req.device.id,
        trusted: true,
        lastSeenAt: new Date().toISOString(),
        riskFlags: [],
      },
    ],
  });
});

module.exports = router;
