const express = require("express");

const adminRoutes = require("./admin.routes");
const authRoutes = require("./auth.routes");
const consentRoutes = require("./consent.routes");
const kycRoutes = require("./kyc.routes");
const loansRoutes = require("./loans.routes");
const profileRoutes = require("./profile.routes");
const scoringRoutes = require("./scoring.routes");
const sessionsRoutes = require("./sessions.routes");
const sharedStateRoutes = require("./shared-state.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/consents", consentRoutes);
router.use("/kyc", kycRoutes);
router.use("/loans", loansRoutes);
router.use("/profile", profileRoutes);
router.use("/scoring", scoringRoutes);
router.use("/sessions", sessionsRoutes);
router.use("/shared-state", sharedStateRoutes);

module.exports = router;
