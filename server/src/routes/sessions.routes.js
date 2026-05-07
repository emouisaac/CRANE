const express = require("express");
const jwt = require("jsonwebtoken");

const { config } = require("../config/env");
const { findAdminAccountById, findAuthUserById, findRefreshSession, rotateRefreshSession } = require("../config/database");
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
      scope: req.user.scope || [],
      role: req.user.role || null,
    },
  });
});

router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  const session = findRefreshSession(refreshToken);
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() < Date.now()) {
    return res.status(401).json({
      error: "Refresh session is invalid or expired",
      code: "REFRESH_INVALID",
    });
  }

  const nextRefreshToken = rotateRefreshSession(refreshToken);
  if (!nextRefreshToken) {
    return res.status(401).json({
      error: "Refresh session could not be rotated",
      code: "REFRESH_INVALID",
    });
  }

  const scope = Array.isArray(session.scope) ? session.scope : [];
  let payload;

  if (scope.includes("admin")) {
    const admin = session.subject_id === "master_admin" ? null : findAdminAccountById(session.subject_id);
    payload = {
      sub: session.subject_id,
      deviceId: session.device_id,
      scope,
      role: session.role,
      username: session.username || admin?.username || null,
      adminAccountId: session.admin_account_id || admin?.id || null,
      adminBusinessRole: session.admin_business_role || admin?.role || null,
    };
  } else {
    const user = findAuthUserById(session.subject_id);
    if (!user) {
      return res.status(404).json({
        error: "User session could not be restored",
        code: "SESSION_SUBJECT_MISSING",
      });
    }

    payload = {
      sub: user.id,
      phone: user.phone,
      email: user.email,
      deviceId: session.device_id,
      scope: ["borrower"],
    };
  }

  const accessToken = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry });
  return res.json({
    accessToken,
    refreshToken: nextRefreshToken,
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
