const express = require("express");

const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

router.use(authenticate, requireBoundDevice);

router.post("/documents", (req, res) => {
  res.status(202).json({
    uploadAccepted: true,
    status: "documents_uploaded",
    storage: "encrypted_object_store",
  });
});

router.post("/selfie", (req, res) => {
  res.status(202).json({
    selfieAccepted: true,
    livenessStatus: "processing",
  });
});

router.post("/ocr-extract", (req, res) => {
  res.json({
    status: "ocr_complete",
    fields: {
      fullName: "Amina Nankya",
      dateOfBirth: "1995-08-14",
      idNumber: "CF104882145612",
    },
  });
});

router.get("/status", (req, res) => {
  res.json({
    userId: req.user.sub,
    status: "manual_review",
    checks: {
      documents: "passed",
      liveness: "passed",
      faceMatch: "review",
      aml: "pending",
    },
  });
});

module.exports = router;
