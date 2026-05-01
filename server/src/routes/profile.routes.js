const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

router.use(authenticate, requireBoundDevice);

router.get("/", (req, res) => {
  res.json({
    userId: req.user.sub,
    profile: {
      fullName: "Amina Nankya",
      address: "Kampala, Nakawa Division",
      employmentStatus: "Self-employed",
      monthlyIncomeUgx: 850000,
      wallets: ["MTN Mobile Money"],
      bankLinked: false,
    },
  });
});

router.put("/", (req, res) => {
  res.json({
    saved: true,
    profile: req.body,
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
