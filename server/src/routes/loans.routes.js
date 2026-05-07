const express = require("express");

const {
  assertUniqueProjectResources,
  buildBorrowerDashboard,
  buildLoanCardFromRow,
  buildMarketingFromScore,
  buildAuthUserProfile,
  canonicalizePhone,
  computeCreditSummary,
  createLoanApplication,
  createNotification,
  findAuthUserById,
  findLoanById,
  listLoanApplications,
  listLoansByUser,
  recordLoanPayment,
  updateAuthUserProfile,
} = require("../config/database");
const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

function sendLoanConflict(res, error) {
  if (error?.code !== "DUPLICATE_RESOURCE") {
    return false;
  }

  res.status(409).json({
    error: error.message || "That information is already linked to another account.",
    code: "APPLICATION_DUPLICATE_RESOURCE",
    field: error.field || null,
  });
  return true;
}

router.get("/offers", authenticate, requireBoundDevice, (req, res) => {
  const summary = computeCreditSummary(req.user.sub);
  return res.json({
    userId: req.user.sub,
    offers: buildMarketingFromScore(summary).offers.map((offer, index) => ({
      id: `offer_${index + 1}`,
      principalUgx: offer.amount,
      tenorDays: index === 0 ? 180 : 90,
      monthlyInterestRate: (summary?.monthlyInterestRate || 0.058),
      status: "generated",
      title: offer.title,
    })),
  });
});

router.post("/offers/:offerId/accept", authenticate, requireBoundDevice, (req, res) => {
  const dashboard = buildBorrowerDashboard(req.user.sub);
  const firstPending = dashboard?.applications?.find((application) => application.status === "approved");

  if (!firstPending) {
    return res.status(409).json({
      error: "No approved application is available for acceptance right now.",
      code: "NO_APPROVED_APPLICATION",
    });
  }

  return res.status(202).json({
    offerId: req.params.offerId,
    accepted: true,
    disbursementChannel: "mobile_money",
    status: "linked_to_active_loan",
    applicationId: firstPending.id,
  });
});

router.get("/", authenticate, requireBoundDevice, (req, res) => {
  return res.json({
    loans: listLoansByUser(req.user.sub).map(buildLoanCardFromRow),
    applications: listLoanApplications({ userId: req.user.sub }),
  });
});

router.post("/applications", authenticate, requireBoundDevice, (req, res) => {
  const user = findAuthUserById(req.user.sub);
  if (!user) {
    return res.status(404).json({
      error: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  const payload = req.body || {};
  const fullName = String(payload.fullName || "").trim();
  const phone = canonicalizePhone(payload.phone || user.phone || "") || String(payload.phone || user.phone || "").trim();
  const amount = Number(payload.amount);
  const termMonths = Number(payload.termMonths);
  const purpose = String(payload.purpose || "").trim();

  if (!fullName || !phone || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(termMonths) || termMonths <= 0 || !purpose) {
    return res.status(400).json({
      error: "Full name, phone, amount, term, and purpose are required.",
      code: "APPLICATION_FIELDS_REQUIRED",
    });
  }

  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  const existingProfile = buildAuthUserProfile(user);

  try {
    assertUniqueProjectResources({
      userId: user.id,
      phone,
      email: payload.email || user.email,
      idNumber: payload.idNumber,
      businessRegistration: payload.businessRegistration,
      primaryWallet: payload.primaryWallet || existingProfile.primaryWallet,
      wallets: payload.primaryWallet || existingProfile.primaryWallet
        ? [payload.primaryWallet || existingProfile.primaryWallet]
        : existingProfile.wallets,
      bankAccount: payload.bankAccount || existingProfile.bankAccount,
      documents,
    });
  } catch (error) {
    if (sendLoanConflict(res, error)) {
      return;
    }
    throw error;
  }

  let updatedProfile;
  let application;
  try {
    updatedProfile = updateAuthUserProfile(user.id, {
      fullName,
      address: payload.village || "",
      district: payload.district || "",
      subcounty: payload.subcounty || "",
      village: payload.village || "",
      category: payload.category || "",
      dateOfBirth: payload.dateOfBirth || "",
      idNumber: payload.idNumber || "",
      employmentStatus: payload.category || "",
      employerName: payload.employerName || "",
      positionTitle: payload.positionTitle || "",
      employmentTenure: payload.employmentTenure || "",
      businessName: payload.businessName || "",
      businessType: payload.businessType || "",
      businessRegistration: payload.businessRegistration || "",
      monthlyIncomeUgx: Number(payload.monthlyIncome) || 0,
      otherIncomeUgx: Number(payload.otherIncome) || 0,
      existingObligations: payload.existingObligations || "",
      primaryWallet: payload.primaryWallet || existingProfile.primaryWallet,
      bankAccount: payload.bankAccount || existingProfile.bankAccount,
      bankLinked: Boolean(payload.bankAccount || existingProfile.bankAccount),
    });

    application = createLoanApplication({
      userId: user.id,
      fullName,
      phone,
      email: payload.email || user.email,
      idNumber: payload.idNumber,
      dateOfBirth: payload.dateOfBirth,
      district: payload.district,
      subcounty: payload.subcounty,
      village: payload.village,
      category: payload.category,
      amount,
      termMonths,
      purpose,
      employerName: payload.employerName,
      positionTitle: payload.positionTitle,
      employmentTenure: payload.employmentTenure,
      businessName: payload.businessName,
      businessType: payload.businessType,
      businessRegistration: payload.businessRegistration,
      monthlyIncome: payload.monthlyIncome,
      otherIncome: payload.otherIncome,
      existingObligations: payload.existingObligations,
      documents,
    });
  } catch (error) {
    if (sendLoanConflict(res, error)) {
      return;
    }
    throw error;
  }

  createNotification({
    userId: user.id,
    type: "info",
    title: "Application queued",
    text: `Application ${application.id} will appear in the admin review queue shortly.`,
    meta: { applicationId: application.id },
  });

  return res.status(201).json({
    submitted: true,
    application: {
      id: application.id,
      status: application.status,
      score: application.score,
      requestedAt: application.requested_at,
    },
    profile: buildAuthUserProfile(updatedProfile),
  });
});

router.post("/:loanId/payments", authenticate, requireBoundDevice, (req, res) => {
  const loan = findLoanById(req.params.loanId);
  if (!loan || loan.user_id !== req.user.sub) {
    return res.status(404).json({
      error: "Loan not found",
      code: "LOAN_NOT_FOUND",
    });
  }

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      error: "A valid payment amount is required",
      code: "PAYMENT_AMOUNT_INVALID",
    });
  }

  const updatedLoan = recordLoanPayment(req.params.loanId, amount, req.body?.method || "mobile_money");
  return res.json({
    paid: true,
    loan: buildLoanCardFromRow(updatedLoan),
  });
});

module.exports = router;
