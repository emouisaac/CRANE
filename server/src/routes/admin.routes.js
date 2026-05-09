const express = require("express");

const {
  buildAdminPortalState,
  buildCustomerSummary,
  createAuditLog,
  createChatMessage,
  createLoanFromApplication,
  createNotification,
  createPasswordResetRequest,
  findAuthUserById,
  findLoanApplicationById,
  getAdminSettings,
  listAuditLogs,
  listChatMessagesForUser,
  listLoanApplications,
  listRiskAlerts,
  listAuthUsers,
  saveAdminSettings,
  updateLoanApplication,
  updateRiskAlertStatus,
} = require("../config/database");
const {
  requireAdmin,
  requireMasterAdmin,
  requireRegularAdmin,
} = require("../middleware/authorize");

const router = express.Router();

function getActorName(req) {
  if (req.user?.role === "master_admin") {
    return "Master Admin";
  }

  return req.user?.username || "Admin User";
}

function serializeApplication(application) {
  return {
    id: application.id,
    borrower: application.full_name,
    user: application.full_name,
    phone: application.phone,
    amount: Number(application.amount) || 0,
    term: Number(application.term_months) || 1,
    purpose: application.purpose,
    status: application.status,
    score: Number(application.score) || 0,
    requestedAt: application.requested_at,
    documents: application.documents || [],
    rejectReason: application.rejection_reason || null,
    reviewHistory: application.reviewHistory || [],
  };
}

function serializeCustomer(user) {
  return buildCustomerSummary(user);
}

router.use(requireAdmin);

router.get("/portal-state", (req, res) => {
  const state = buildAdminPortalState();
  return res.json({
    role: req.user.role,
    state,
  });
});

router.get("/users", (req, res) => {
  const users = listAuthUsers({
    search: req.query.search || "",
    status: req.query.status || "",
  }).map(serializeCustomer);

  return res.json({
    users,
    total: users.length,
  });
});

router.get("/users/:userId", (req, res) => {
  const user = findAuthUserById(req.params.userId);
  if (!user) {
    return res.status(404).json({
      error: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  const applications = listLoanApplications({ userId: user.id }).map(serializeApplication);
  return res.json({
    user: serializeCustomer(user),
    applications,
    messages: listChatMessagesForUser(user.id),
  });
});

router.post("/users/:userId/reset-password", (req, res) => {
  const user = findAuthUserById(req.params.userId);
  if (!user) {
    return res.status(404).json({
      error: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  const request = createPasswordResetRequest({
    userId: user.id,
    adminId: req.user.sub,
    reason: req.body?.reason || "admin_initiated",
  });

  createChatMessage({
    userId: user.id,
    adminId: req.user.sub,
    senderType: "admin",
    messageText: `A password reset has been initiated for your account. Reset token: ${request.resetToken}`,
    messageType: "password_reset",
  });
  createNotification({
    userId: user.id,
    type: "warning",
    title: "Password reset initiated",
    text: "An admin has initiated a password reset for your account.",
    meta: { resetRequestId: request.id },
  });
  createAuditLog({
    userId: user.id,
    actorType: "admin",
    actorId: req.user.sub,
    actorName: getActorName(req),
    action: "Initiated password reset",
    entityType: "user",
    entityId: user.id,
    details: req.body?.reason || "Admin initiated password reset.",
  });

  return res.status(201).json({
    resetInitiated: true,
    resetToken: request.resetToken,
    expiresAt: request.tokenExpiresAt,
    message: "Password reset initiated for user",
  });
});

router.post("/messages/send", (req, res) => {
  const { userId, messageText, messageType = "text" } = req.body || {};
  const user = findAuthUserById(userId);
  if (!user) {
    return res.status(404).json({
      error: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  const message = createChatMessage({
    userId,
    adminId: req.user.sub,
    senderType: "admin",
    messageText,
    messageType,
  });

  createNotification({
    userId,
    type: "info",
    title: "New support message",
    text: "The Crane team sent you a new message.",
    meta: { messageId: message.id },
  });

  return res.status(201).json({
    id: message.id,
    sent: true,
    createdAt: message.createdAt,
  });
});

router.get("/messages/:userId", (req, res) => {
  const user = findAuthUserById(req.params.userId);
  if (!user) {
    return res.status(404).json({
      error: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  const messages = listChatMessagesForUser(user.id);
  return res.json({
    messages,
    total: messages.length,
  });
});

router.post("/loans/:loanId/review", requireRegularAdmin, (req, res) => {
  const application = findLoanApplicationById(req.params.loanId);
  if (!application) {
    return res.status(404).json({
      error: "Loan application not found",
      code: "LOAN_NOT_FOUND",
    });
  }

  const notes = req.body?.notes || "";
  const updated = updateLoanApplication(application.id, {
    status: "under_review",
    assignedAdminId: req.user.sub,
    reviewNotes: notes,
    reviewedAt: new Date().toISOString(),
    reviewHistoryEntry: {
      actor: getActorName(req),
      action: "Application moved into review",
      details: notes || "Regular admin started review.",
    },
  });

  createNotification({
    userId: application.user_id,
    type: "info",
    title: "Application under review",
    text: `Application ${application.id} is now under review by the Crane team.`,
    meta: { applicationId: application.id },
  });
  createAuditLog({
    userId: application.user_id,
    actorType: "admin",
    actorId: req.user.sub,
    actorName: getActorName(req),
    action: `Marked application ${application.id} under review`,
    entityType: "loan_application",
    entityId: application.id,
    details: notes || "Application moved into review.",
  });

  return res.status(201).json({
    reviewId: application.id,
    reviewed: true,
    message: "Loan marked for review",
    application: serializeApplication(updated),
  });
});

router.post("/loans/:loanId/reject", requireRegularAdmin, (req, res) => {
  const application = findLoanApplicationById(req.params.loanId);
  if (!application) {
    return res.status(404).json({
      error: "Loan application not found",
      code: "LOAN_NOT_FOUND",
    });
  }

  const rejectionReason = String(req.body?.rejectionReason || "").trim();
  if (!rejectionReason) {
    return res.status(400).json({
      error: "Rejection reason required",
      code: "MISSING_REJECTION_REASON",
    });
  }

  const updated = updateLoanApplication(application.id, {
    status: "pending_master_review",
    assignedAdminId: req.user.sub,
    rejectionReason,
    reviewedAt: new Date().toISOString(),
    reviewHistoryEntry: {
      actor: getActorName(req),
      action: "Submitted rejection for master review",
      details: rejectionReason,
    },
  });

  createChatMessage({
    userId: application.user_id,
    adminId: req.user.sub,
    senderType: "admin",
    messageText: `Your application ${application.id} has been escalated to master-admin review. Reason: ${rejectionReason}`,
    messageType: "status_update",
  });
  createNotification({
    userId: application.user_id,
    type: "warning",
    title: "Application escalated",
    text: `Application ${application.id} is awaiting final review from the master-admin team.`,
    meta: { applicationId: application.id },
  });
  createAuditLog({
    userId: application.user_id,
    actorType: "admin",
    actorId: req.user.sub,
    actorName: getActorName(req),
    action: `Escalated application ${application.id} to master admin`,
    entityType: "loan_application",
    entityId: application.id,
    details: rejectionReason,
  });

  return res.status(201).json({
    reviewId: application.id,
    rejected: true,
    message: "Loan rejection submitted for master admin approval",
    application: serializeApplication(updated),
  });
});

router.post("/loans/:loanId/request-more-docs", (req, res) => {
  const application = findLoanApplicationById(req.params.loanId);
  if (!application) {
    return res.status(404).json({
      error: "Loan application not found",
      code: "LOAN_NOT_FOUND",
    });
  }

  const note = String(req.body?.note || "Please upload clearer or additional supporting documents.").trim();
  const updated = updateLoanApplication(application.id, {
    status: "needs_documents",
    assignedAdminId: req.user.sub,
    reviewedAt: new Date().toISOString(),
    reviewHistoryEntry: {
      actor: getActorName(req),
      action: "Requested additional documents",
      details: note,
    },
  });

  createChatMessage({
    userId: application.user_id,
    adminId: req.user.sub,
    senderType: "admin",
    messageText: note,
    messageType: "document_request",
  });
  createNotification({
    userId: application.user_id,
    type: "warning",
    title: "More documents needed",
    text: note,
    meta: { applicationId: application.id },
  });

  return res.json({
    requested: true,
    application: serializeApplication(updated),
  });
});

router.post("/loans/:loanId/approve", requireMasterAdmin, (req, res) => {
  const application = findLoanApplicationById(req.params.loanId);
  if (!application) {
    return res.status(404).json({
      error: "Loan application not found",
      code: "LOAN_NOT_FOUND",
    });
  }

  if (!["pending_master_review", "under_review", "pending"].includes(application.status)) {
    return res.status(409).json({
      error: "This application is not ready for approval",
      code: "LOAN_STATUS_INVALID",
    });
  }

  const approvalNotes = req.body?.approvalNotes || "";
  const loan = createLoanFromApplication(application, {
    approvedBy: req.user.sub,
    disbursementChannel: "mobile_money",
  });
  const updated = updateLoanApplication(application.id, {
    status: "approved",
    decisionNotes: approvalNotes,
    decisionAt: new Date().toISOString(),
    originatedLoanId: loan.id,
    reviewHistoryEntry: {
      actor: getActorName(req),
      action: "Approved application",
      details: approvalNotes || "Loan approved and created.",
    },
  });

  createChatMessage({
    userId: application.user_id,
    adminId: req.user.sub,
    senderType: "admin",
    messageText: `Great news. Your application ${application.id} has been approved and disbursement is being prepared.`,
    messageType: "status_update",
  });
  createNotification({
    userId: application.user_id,
    type: "success",
    title: "Loan approved",
    text: `Application ${application.id} has been approved.`,
    meta: { applicationId: application.id, loanId: loan.id },
  });
  createAuditLog({
    userId: application.user_id,
    actorType: "admin",
    actorId: req.user.sub,
    actorName: getActorName(req),
    action: `Approved application ${application.id}`,
    entityType: "loan_application",
    entityId: application.id,
    details: approvalNotes || "Master admin approved the application.",
    metadata: { loanId: loan.id },
  });

  return res.json({
    loanId: application.id,
    approved: true,
    message: "Loan approved successfully",
    createdLoanId: loan.id,
    application: serializeApplication(updated),
  });
});

router.post("/loans/:loanId/reject-final", requireMasterAdmin, (req, res) => {
  const application = findLoanApplicationById(req.params.loanId);
  if (!application) {
    return res.status(404).json({
      error: "Loan application not found",
      code: "LOAN_NOT_FOUND",
    });
  }

  const rejectionNotes = String(req.body?.rejectionNotes || "").trim();
  if (!rejectionNotes) {
    return res.status(400).json({
      error: "Rejection reason required",
      code: "MISSING_REJECTION_REASON",
    });
  }

  const updated = updateLoanApplication(application.id, {
    status: "rejected",
    rejectionReason: rejectionNotes,
    decisionNotes: rejectionNotes,
    decisionAt: new Date().toISOString(),
    reviewHistoryEntry: {
      actor: getActorName(req),
      action: "Rejected application",
      details: rejectionNotes,
    },
  });

  createChatMessage({
    userId: application.user_id,
    adminId: req.user.sub,
    senderType: "admin",
    messageText: `Your application ${application.id} was not approved. Reason: ${rejectionNotes}`,
    messageType: "status_update",
  });
  createNotification({
    userId: application.user_id,
    type: "warning",
    title: "Loan not approved",
    text: `Application ${application.id} was declined. Reason: ${rejectionNotes}`,
    meta: { applicationId: application.id },
  });
  createAuditLog({
    userId: application.user_id,
    actorType: "admin",
    actorId: req.user.sub,
    actorName: getActorName(req),
    action: `Rejected application ${application.id}`,
    entityType: "loan_application",
    entityId: application.id,
    details: rejectionNotes,
  });

  return res.json({
    loanId: application.id,
    rejected: true,
    message: "Loan rejected successfully",
    application: serializeApplication(updated),
  });
});

router.get("/approval-requests", requireMasterAdmin, (req, res) => {
  const approvalRequests = listLoanApplications()
    .filter((application) => application.status === "pending_master_review")
    .map(serializeApplication);

  res.json({
    approvalRequests,
    total: approvalRequests.length,
  });
});

router.get("/loans/:loanId/review-history", (req, res) => {
  const application = findLoanApplicationById(req.params.loanId);
  if (!application) {
    return res.status(404).json({
      error: "Loan application not found",
      code: "LOAN_NOT_FOUND",
    });
  }

  res.json({
    reviews: application.reviewHistory || [],
    total: Array.isArray(application.reviewHistory) ? application.reviewHistory.length : 0,
  });
});

router.get("/risk-alerts", (req, res) => {
  const alerts = listRiskAlerts({
    status: req.query.status || "",
    severity: req.query.severity || "",
  });

  res.json({
    alerts,
    total: alerts.length,
  });
});

router.patch("/risk-alerts/:riskId", (req, res) => {
  const status = String(req.body?.status || "").trim();
  if (!status) {
    return res.status(400).json({
      error: "Risk status is required",
      code: "RISK_STATUS_REQUIRED",
    });
  }

  const alert = updateRiskAlertStatus(req.params.riskId, status);
  if (!alert) {
    return res.status(404).json({
      error: "Risk alert not found",
      code: "RISK_NOT_FOUND",
    });
  }

  return res.json({
    updated: true,
    alert,
  });
});

router.get("/settings", requireMasterAdmin, (req, res) => {
  res.json({
    settings: getAdminSettings(),
  });
});

router.put("/settings", requireMasterAdmin, (req, res) => {
  const settings = saveAdminSettings(req.body || {});
  createAuditLog({
    actorType: "admin",
    actorId: req.user.sub,
    actorName: getActorName(req),
    action: "Updated admin settings",
    entityType: "settings",
    entityId: "admin_settings",
    details: "Master admin updated platform settings.",
    metadata: settings,
  });

  res.json({
    updated: true,
    settings,
  });
});

router.get("/audit-logs", requireMasterAdmin, (req, res) => {
  const logs = listAuditLogs(Number(req.query.limit) || 100);
  res.json({
    logs,
    total: logs.length,
  });
});

module.exports = router;
