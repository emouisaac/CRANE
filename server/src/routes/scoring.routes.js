const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

router.use(authenticate, requireBoundDevice);

router.post("/evaluate", (req, res) => {
  res.status(202).json({
    jobId: "score_job_demo_001",
    status: "queued",
    sources: ["wallet_transactions", "repayment_history", "device_behavior"],
  });
});

router.get("/summary", (req, res) => {
  res.json({
    userId: req.user.sub,
    score: 718,
    eligibility: "eligible_with_soft_review",
    creditLimitUgx: 650000,
    monthlyInterestRate: 0.058,
    drivers: [
      "Wallet cash flow stability",
      "Clean KYC pass rate",
      "Trusted device continuity",
    ],
  });
});

module.exports = router;
