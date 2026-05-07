const express = require("express");

const { computeCreditSummary } = require("../config/database");
const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

router.use(authenticate, requireBoundDevice);

router.post("/evaluate", (req, res) => {
  const summary = computeCreditSummary(req.user.sub);
  res.status(202).json({
    jobId: `score_${Date.now().toString(36)}`,
    status: "completed",
    sources: ["profile", "consents", "applications", "repayment_history"],
    summary,
  });
});

router.get("/summary", (req, res) => {
  const summary = computeCreditSummary(req.user.sub);
  res.json({
    userId: req.user.sub,
    score: summary.score,
    eligibility: summary.eligibility,
    creditLimitUgx: summary.creditLimitUgx,
    monthlyInterestRate: summary.monthlyInterestRate,
    drivers: summary.drivers,
  });
});

module.exports = router;
