const express = require("express");

const { findAuthUserById, listLoanApplications, updateAuthUserProfile } = require("../config/database");
const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

router.use(authenticate, requireBoundDevice);

router.post("/documents", (req, res) => {
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  const user = findAuthUserById(req.user.sub);
  const existingDocs = Array.isArray(user?.profile?.kycDocuments) ? user.profile.kycDocuments : [];
  const nextDocs = Array.from(new Set([...existingDocs, ...files.filter(Boolean)]));
  updateAuthUserProfile(req.user.sub, { kycDocuments: nextDocs });

  res.status(202).json({
    uploadAccepted: true,
    status: nextDocs.length ? "documents_received" : "awaiting_documents",
    files: nextDocs,
  });
});

router.post("/selfie", (req, res) => {
  updateAuthUserProfile(req.user.sub, { selfieVerifiedAt: new Date().toISOString() });
  res.status(202).json({
    selfieAccepted: true,
    livenessStatus: "passed",
  });
});

router.post("/ocr-extract", (req, res) => {
  const user = findAuthUserById(req.user.sub);
  const profile = user?.profile || {};

  res.json({
    status: "ocr_complete",
    fields: {
      fullName: profile.fullName || "",
      dateOfBirth: profile.dateOfBirth || "",
      idNumber: profile.idNumber || "",
    },
  });
});

router.get("/status", (req, res) => {
  const user = findAuthUserById(req.user.sub);
  const profile = user?.profile || {};
  const applications = listLoanApplications({ userId: req.user.sub });
  const latestApplication = applications[0];

  res.json({
    userId: req.user.sub,
    status: latestApplication?.status === "needs_documents" ? "needs_documents" : "verified",
    checks: {
      documents: Array.isArray(profile.kycDocuments) && profile.kycDocuments.length ? "passed" : "pending",
      liveness: profile.selfieVerifiedAt ? "passed" : "pending",
      faceMatch: profile.selfieVerifiedAt ? "passed" : "pending",
      aml: latestApplication?.status === "rejected" ? "review" : "passed",
    },
  });
});

module.exports = router;
