const crypto = require("crypto");
const express = require("express");

const {
  buildAuthUserProfile,
  buildBorrowerDashboard,
  createAuditLog,
  createChatMessage,
  createNotification,
  findAuthUserById,
  listChatMessagesForUser,
  listNotificationsByUser,
  markAllNotificationsRead,
  updateAuthUserPin,
  updateAuthUserProfile,
} = require("../config/database");
const { authenticate } = require("../middleware/authenticate");
const { requireBoundDevice } = require("../middleware/deviceBinding");

const router = express.Router();

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

router.use(authenticate, requireBoundDevice);

router.get("/", (req, res) => {
  const user = findAuthUserById(req.user.sub);

  if (!user) {
    return res.status(404).json({
      error: "User profile not found",
    });
  }

  return res.json({
    userId: user.id,
    profile: buildAuthUserProfile(user),
  });
});

router.put("/", (req, res) => {
  const updatedUser = updateAuthUserProfile(req.user.sub, req.body);

  if (!updatedUser) {
    return res.status(404).json({
      saved: false,
      error: "User profile not found",
    });
  }

  createAuditLog({
    userId: updatedUser.id,
    actorType: "user",
    actorId: updatedUser.id,
    actorName: buildAuthUserProfile(updatedUser).fullName,
    action: "Updated borrower profile",
    entityType: "profile",
    entityId: updatedUser.id,
    details: "Borrower profile details were updated from the dashboard.",
  });

  return res.json({
    saved: true,
    userId: updatedUser.id,
    profile: buildAuthUserProfile(updatedUser),
  });
});

router.get("/dashboard", (req, res) => {
  const dashboard = buildBorrowerDashboard(req.user.sub);

  if (!dashboard) {
    return res.status(404).json({
      error: "Dashboard data not found",
    });
  }

  return res.json(dashboard);
});

router.post("/change-pin", (req, res) => {
  const { currentPin, newPin } = req.body || {};
  const user = findAuthUserById(req.user.sub);

  if (!user) {
    return res.status(404).json({
      error: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  if (!currentPin || !newPin) {
    return res.status(400).json({
      error: "Current PIN and new PIN are required",
      code: "PIN_FIELDS_REQUIRED",
    });
  }

  if (!/^\d{6}$/.test(String(newPin))) {
    return res.status(400).json({
      error: "New PIN must be 6 digits",
      code: "PIN_INVALID",
    });
  }

  if (user.pin_hash !== hashSecret(currentPin)) {
    return res.status(401).json({
      error: "Current PIN is incorrect",
      code: "PIN_AUTH_FAILED",
    });
  }

  const updatedUser = updateAuthUserPin(user.id, hashSecret(newPin));
  createNotification({
    userId: user.id,
    type: "info",
    title: "PIN updated",
    text: "Your account PIN was changed successfully.",
  });
  createAuditLog({
    userId: user.id,
    actorType: "user",
    actorId: user.id,
    actorName: buildAuthUserProfile(updatedUser).fullName,
    action: "Changed account PIN",
    entityType: "security",
    entityId: user.id,
    details: "Borrower changed account PIN.",
  });

  return res.json({
    updated: true,
  });
});

router.get("/messages", (req, res) => {
  return res.json({
    messages: listChatMessagesForUser(req.user.sub),
  });
});

router.post("/messages", (req, res) => {
  const { messageText, messageType = "text" } = req.body || {};
  if (!messageText || !String(messageText).trim()) {
    return res.status(400).json({
      error: "Message text is required",
      code: "MESSAGE_REQUIRED",
    });
  }

  const message = createChatMessage({
    userId: req.user.sub,
    senderType: "user",
    messageText,
    messageType,
  });

  createAuditLog({
    userId: req.user.sub,
    actorType: "user",
    actorId: req.user.sub,
    action: "Sent support message",
    entityType: "chat_message",
    entityId: message.id,
    details: "Borrower sent a support chat message.",
  });

  return res.status(201).json({
    sent: true,
    message,
  });
});

router.get("/notifications", (req, res) => {
  return res.json({
    notifications: listNotificationsByUser(req.user.sub),
  });
});

router.post("/notifications/read-all", (req, res) => {
  return res.json({
    updated: true,
    notifications: markAllNotificationsRead(req.user.sub),
  });
});

router.post("/mobile-money", (req, res) => {
  const { provider, phone } = req.body || {};
  const updatedUser = updateAuthUserProfile(req.user.sub, {
    primaryWallet: phone || "",
    wallets: phone ? [phone] : [],
    walletProvider: provider || "",
  });

  return res.status(201).json({
    linked: true,
    provider,
    phone,
    profile: buildAuthUserProfile(updatedUser),
  });
});

router.post("/bank-accounts", (req, res) => {
  const { bankAccount } = req.body || {};
  const updatedUser = updateAuthUserProfile(req.user.sub, {
    bankAccount: bankAccount || "",
    bankLinked: Boolean(bankAccount),
  });

  return res.status(201).json({
    linked: Boolean(bankAccount),
    profile: buildAuthUserProfile(updatedUser),
  });
});

module.exports = router;
