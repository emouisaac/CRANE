const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

router.use(authenticate, requireBoundDevice);

router.get("/", (req, res) => {
  res.json({
    userId: req.user.sub,
    consents: [
      { key: "sms_patterns", state: "granted" },
      { key: "usage_metadata", state: "granted" },
      { key: "contacts", state: "denied" },
      { key: "wallet_transactions", state: "granted" },
    ],
  });
});

router.put("/", (req, res) => {
  res.json({
    updated: true,
    consents: req.body.consents || [],
    audited: true,
  });
});

module.exports = router;
