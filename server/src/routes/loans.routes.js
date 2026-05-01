const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

router.use(authenticate, requireBoundDevice);

router.get("/offers", (req, res) => {
  res.json({
    userId: req.user.sub,
    offers: [
      {
        id: "offer_demo_001",
        principalUgx: 650000,
        tenorDays: 30,
        monthlyInterestRate: 0.058,
        status: "generated",
      },
    ],
  });
});

router.post("/offers/:offerId/accept", (req, res) => {
  res.status(202).json({
    offerId: req.params.offerId,
    accepted: true,
    disbursementChannel: "mobile_money",
    status: "queued_for_disbursement",
  });
});

module.exports = router;
