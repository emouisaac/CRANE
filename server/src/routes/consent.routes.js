const express = require("express");

const { getUserConsents, saveUserConsents } = require("../config/database");
const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

router.use(authenticate, requireBoundDevice);

router.get("/", (req, res) => {
  res.json({
    userId: req.user.sub,
    consents: getUserConsents(req.user.sub),
  });
});

router.put("/", (req, res) => {
  const consents = Array.isArray(req.body?.consents) ? req.body.consents : [];
  res.json({
    updated: true,
    consents: saveUserConsents(req.user.sub, consents),
    audited: true,
  });
});

module.exports = router;
