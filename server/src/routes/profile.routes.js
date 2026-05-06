const express = require("express");

const {
  buildAuthUserProfile,
  findAuthUserById,
  updateAuthUserProfile,
} = require("../config/database");
const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

router.use(authenticate, requireBoundDevice);

router.get("/", (req, res) => {
  const user = findAuthUserById(req.user.sub);

  if (!user) {
    return res.status(404).json({
      error: "User profile not found",
    });
  }

  res.json({
    userId: user.id,
    profile: buildAuthUserProfile(user),
  });
});

router.put("/", (req, res) => {
  const updatedUser = updateAuthUserProfile(req.user.sub, req.body);

  if (!updatedUser) {
    return res.status(404).json({
      saved: false,
      error: "User profile not found",
    });
  }

  res.json({
    saved: true,
    userId: updatedUser.id,
    profile: buildAuthUserProfile(updatedUser),
  });
});

router.post("/mobile-money", (req, res) => {
  res.status(201).json({
    linked: true,
    provider: req.body.provider,
    verification: "pending_otp",
  });
});

router.post("/bank-accounts", (req, res) => {
  res.status(201).json({
    linked: true,
    verification: "micro_deposit_or_api",
  });
});

module.exports = router;
