const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { timingSafeEqual } = require("crypto");

const { config } = require("../config/env");
const {
  buildAuthUserProfile,
  canonicalizePhone,
  consumeOtpChallenge,
  createAdminAccount,
  createOtpChallenge,
  createRefreshSession,
  findAdminAccountById,
  findAdminAccountByUsername,
  findAuthUserByPhone,
  listAdminAccounts,
  sanitizeAdminAccount,
  touchAdminAccountLogin,
  touchAuthUserLogin,
  upsertAuthUser,
  updateAdminAccount,
} = require("../config/database");
const { authenticate } = require("../middleware/authenticate");

const router = express.Router();

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hashAdminPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derivedKey = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

function verifyAdminPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string") {
    return false;
  }

  const [scheme, salt, expectedKey] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !expectedKey) {
    return false;
  }

  const actualKey = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(actualKey, "hex"), Buffer.from(expectedKey, "hex"));
}

function getRefreshExpiryIso() {
  return new Date(Date.now() + config.refreshExpiryDays * 24 * 60 * 60 * 1000).toISOString();
}

function createBorrowerSession(user, deviceId) {
  const accessToken = jwt.sign(
    { sub: user.id, phone: user.phone, email: user.email, deviceId, scope: ["borrower"] },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  const refreshToken = createRefreshSession({
    subjectType: "borrower",
    subjectId: user.id,
    deviceId,
    scope: ["borrower"],
    expiresAt: getRefreshExpiryIso(),
  });

  return {
    token: accessToken,
    accessToken,
    refreshToken,
    onboardingState: "profile_ready",
    biometricAvailable: false,
    deviceBound: Boolean(deviceId),
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email || null,
      isRegistered: true,
      lastLoginAt: user.last_login_at || null,
      profile: buildAuthUserProfile(user),
    },
  };
}

function issueAdminSession({ subject, deviceId, role, username = null, adminAccount = null }) {
  const accessToken = jwt.sign(
    {
      sub: subject,
      deviceId,
      scope: ["admin"],
      role,
      username,
      adminAccountId: adminAccount?.id || null,
      adminBusinessRole: adminAccount?.role || null,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  const refreshToken = createRefreshSession({
    subjectType: "admin",
    subjectId: subject,
    deviceId,
    scope: ["admin"],
    role,
    username,
    adminAccountId: adminAccount?.id || null,
    adminBusinessRole: adminAccount?.role || null,
    expiresAt: getRefreshExpiryIso(),
  });

  return {
    accessToken,
    refreshToken,
    role,
    deviceBound: Boolean(deviceId),
    admin: adminAccount
      ? sanitizeAdminAccount(adminAccount)
      : {
          id: "master_admin",
          username: "master_admin",
          fullName: "Master Admin",
          email: "",
          role: "master_admin",
          status: "active",
          createdAt: null,
          updatedAt: null,
          lastLoginAt: null,
        },
  };
}

function authenticateAdminToken(req, res, next) {
  authenticate(req, res, () => {
    if (!req.user?.scope || !req.user.scope.includes("admin")) {
      return res.status(403).json({
        error: "Admin access required",
        code: "ADMIN_ACCESS_REQUIRED",
      });
    }

    return next();
  });
}

function requireMasterAdmin(req, res, next) {
  if (req.user?.role !== "master_admin") {
    return res.status(403).json({
      error: "Master admin access required",
      code: "MASTER_ADMIN_ONLY",
    });
  }

  return next();
}

function isDuplicateResourceError(error) {
  return error?.code === "AUTH_USER_EXISTS" || error?.code === "DUPLICATE_RESOURCE";
}

router.post("/register/request-otp", (req, res) => {
  const { phone, country } = req.body || {};

  if (!phone) {
    return res.status(400).json({
      error: "Phone number is required",
      code: "PHONE_REQUIRED",
    });
  }

  const normalizedPhone = canonicalizePhone(phone, country);
  const otpCode = String(Math.floor(100000 + Math.random() * 900000));
  const challenge = createOtpChallenge(normalizedPhone, otpCode, new Date(Date.now() + 2 * 60 * 1000).toISOString());
  const existingUser = findAuthUserByPhone(normalizedPhone, country);

  return res.json({
    challengeId: challenge.id,
    phone: normalizedPhone,
    country,
    returningUser: Boolean(existingUser),
    deliveryStatus: "accepted",
    expiresInSeconds: 120,
  });
});

router.post("/register/verify-otp", (req, res) => {
  const { phone, otp, deviceId, country } = req.body || {};

  if (!phone || !otp) {
    return res.status(400).json({
      error: "Phone number and OTP are required",
      code: "OTP_FIELDS_REQUIRED",
    });
  }

  const normalizedPhone = canonicalizePhone(phone, country);
  const result = consumeOtpChallenge(normalizedPhone, String(otp).trim());
  if (!result.ok) {
    return res.status(401).json({
      error: "Invalid or expired OTP",
      code: "OTP_INVALID",
      reason: result.reason,
    });
  }

  const existingUser = findAuthUserByPhone(normalizedPhone, country);
  if (!existingUser) {
    return res.json({
      verified: true,
      registered: false,
      nextStep: "complete_registration",
    });
  }

  const updatedUser = touchAuthUserLogin(normalizedPhone, country) || existingUser;
  return res.json(createBorrowerSession(updatedUser, deviceId));
});

router.post("/register", (req, res) => {
  const { phone, email, pin, deviceId, country, fullName } = req.body || {};
  const normalizedPhone = canonicalizePhone(phone, country);
  const normalizedFullName = String(fullName || "").trim();

  if (!normalizedPhone) {
    return res.status(400).json({
      error: "Phone number is required",
      code: "PHONE_REQUIRED",
    });
  }

  if (!normalizedFullName) {
    return res.status(400).json({
      error: "Full name is required",
      code: "FULL_NAME_REQUIRED",
    });
  }

  if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({
      error: "PIN must be 6 digits",
      code: "PIN_INVALID",
    });
  }

  if (email && email.trim() !== "") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Please enter a valid email address",
        code: "EMAIL_INVALID",
      });
    }
  }

  try {
    const user = upsertAuthUser({
      phone: normalizedPhone,
      email: email || null,
      pinHash: hashSecret(pin),
      country,
      allowExisting: false,
      profileUpdates: {
        fullName: normalizedFullName,
      },
    });

    return res.json(createBorrowerSession(user, deviceId));
  } catch (error) {
    const isDuplicateUser =
      isDuplicateResourceError(error) ||
      String(error.message || "").toLowerCase().includes("unique");

    return res.status(isDuplicateUser ? 409 : 500).json({
      error: isDuplicateUser
        ? error.message || "This phone number is already registered. Please log in instead."
        : "Registration failed. Please try again.",
      code: isDuplicateUser ? "AUTH_USER_EXISTS" : "AUTH_REGISTER_FAILED",
    });
  }
});

router.post("/login", (req, res) => {
  const { phone, pin, password, deviceId, country } = req.body || {};

  if (!phone || (!pin && !password)) {
    return res.status(400).json({
      error: "Phone and PIN/password are required",
      code: "AUTH_FIELDS_REQUIRED",
    });
  }

  const user = findAuthUserByPhone(phone, country);
  if (!user) {
    return res.status(401).json({
      error: "User not registered. Please register first.",
      code: "USER_NOT_REGISTERED",
    });
  }

  const suppliedSecret = pin || password;
  if (!/^\d{6}$/.test(String(suppliedSecret))) {
    return res.status(400).json({
      error: "PIN must be 6 digits",
      code: "PIN_INVALID",
    });
  }

  if (user.pin_hash !== hashSecret(suppliedSecret)) {
    return res.status(401).json({
      error: "Invalid phone or PIN.",
      code: "AUTH_INVALID",
    });
  }

  const updatedUser = touchAuthUserLogin(phone, country) || user;
  return res.json(createBorrowerSession(updatedUser, deviceId));
});

router.post("/admin/login", (req, res) => {
  const { username, password, deviceId, loginType, role } = req.body || {};
  const normalizedUsername = String(username || "").trim();
  const requestedLoginType =
    loginType === "master_admin" || role === "master_admin" ? "master_admin" : "admin";

  if (!password || !deviceId) {
    return res.status(400).json({
      error: "Password and device ID are required",
      code: "MISSING_ADMIN_FIELDS",
    });
  }

  if (requestedLoginType === "master_admin") {
    if (!normalizedUsername) {
      return res.status(400).json({
        error: "Master admin username is required",
        code: "ADMIN_USERNAME_REQUIRED",
      });
    }

    if (normalizedUsername.toLowerCase() !== config.masterAdminUsername.toLowerCase()) {
      return res.status(401).json({
        error: "Invalid master admin credentials",
        code: "MASTER_ADMIN_AUTH_FAILED",
      });
    }

    if (password !== config.masterAdminPassword) {
      return res.status(401).json({
        error: "Invalid master admin credentials",
        code: "MASTER_ADMIN_AUTH_FAILED",
      });
    }

    return res.json(
      issueAdminSession({
        subject: "master_admin",
        deviceId,
        role: "master_admin",
        username: config.masterAdminUsername,
      })
    );
  }

  if (!normalizedUsername) {
    return res.status(400).json({
      error: "Username is required for admin login",
      code: "ADMIN_USERNAME_REQUIRED",
    });
  }

  if (normalizedUsername.toLowerCase() === config.masterAdminUsername.toLowerCase()) {
    return res.status(403).json({
      error: "Master admin credentials must use the master admin login page.",
      code: "MASTER_ADMIN_LOGIN_REQUIRED",
    });
  }

  const adminAccount = findAdminAccountByUsername(normalizedUsername);
  if (!adminAccount || adminAccount.status !== "active" || !verifyAdminPassword(password, adminAccount.password_hash)) {
    return res.status(401).json({
      error: "Invalid admin username or password",
      code: "ADMIN_AUTH_FAILED",
    });
  }

  const updatedAdminAccount = touchAdminAccountLogin(adminAccount.id) || sanitizeAdminAccount(adminAccount);
  return res.json(
    issueAdminSession({
      subject: adminAccount.id,
      deviceId,
      role: "admin",
      username: adminAccount.username,
      adminAccount: updatedAdminAccount,
    })
  );
});

router.get("/admin/accounts", authenticateAdminToken, requireMasterAdmin, (req, res) => {
  return res.json({
    accounts: listAdminAccounts(),
  });
});

router.post("/admin/accounts", authenticateAdminToken, requireMasterAdmin, (req, res) => {
  const { username, fullName, email, password, role = "loan_officer" } = req.body || {};

  if (!username || !String(username).trim()) {
    return res.status(400).json({
      error: "Username is required",
      code: "ADMIN_USERNAME_REQUIRED",
    });
  }

  if (!fullName || !String(fullName).trim()) {
    return res.status(400).json({
      error: "Full name is required",
      code: "ADMIN_NAME_REQUIRED",
    });
  }

  if (!password || String(password).length < 6) {
    return res.status(400).json({
      error: "Admin password must be at least 6 characters",
      code: "ADMIN_PASSWORD_TOO_SHORT",
    });
  }

  try {
    const account = createAdminAccount({
      username,
      fullName,
      email,
      passwordHash: hashAdminPassword(password),
      role,
      status: "active",
    });

    return res.status(201).json({
      created: true,
      account,
    });
  } catch (error) {
    const isUniqueConstraint =
      isDuplicateResourceError(error) ||
      String(error.message || "").toLowerCase().includes("unique");
    return res.status(isUniqueConstraint ? 409 : 500).json({
      error: isUniqueConstraint
        ? error.message || "That admin username or email already exists"
        : "Failed to create admin account",
      code: isUniqueConstraint ? "ADMIN_ACCOUNT_EXISTS" : "ADMIN_ACCOUNT_CREATE_FAILED",
    });
  }
});

router.patch("/admin/accounts/:adminId", authenticateAdminToken, requireMasterAdmin, (req, res) => {
  const { adminId } = req.params;
  const updates = { ...req.body };

  if (updates.password) {
    if (String(updates.password).length < 6) {
      return res.status(400).json({
        error: "Admin password must be at least 6 characters",
        code: "ADMIN_PASSWORD_TOO_SHORT",
      });
    }

    updates.passwordHash = hashAdminPassword(updates.password);
    delete updates.password;
  }

  try {
    const account = updateAdminAccount(adminId, updates);
    if (!account) {
      return res.status(404).json({
        error: "Admin account not found",
        code: "ADMIN_ACCOUNT_NOT_FOUND",
      });
    }

    return res.json({
      updated: true,
      account,
    });
  } catch (error) {
    const isUniqueConstraint =
      isDuplicateResourceError(error) ||
      String(error.message || "").toLowerCase().includes("unique");
    return res.status(isUniqueConstraint ? 409 : 500).json({
      error: isUniqueConstraint
        ? error.message || "That admin username or email already exists"
        : "Failed to update admin account",
      code: isUniqueConstraint ? "ADMIN_ACCOUNT_EXISTS" : "ADMIN_ACCOUNT_UPDATE_FAILED",
    });
  }
});

router.delete("/admin/accounts/:adminId", authenticateAdminToken, requireMasterAdmin, (req, res) => {
  const { adminId } = req.params;
  const existingAccount = findAdminAccountById(adminId);

  if (!existingAccount) {
    return res.status(404).json({
      error: "Admin account not found",
      code: "ADMIN_ACCOUNT_NOT_FOUND",
    });
  }

  const account = updateAdminAccount(adminId, { status: "suspended" });
  return res.json({
    deleted: true,
    account,
  });
});

router.post("/biometric/assertion", (req, res) => {
  return res.status(501).json({
    error: "Biometric login is not configured for this deployment.",
    code: "BIOMETRIC_NOT_CONFIGURED",
  });
});

router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) {
    return res.status(400).json({
      error: "Refresh token is required",
      code: "REFRESH_TOKEN_REQUIRED",
    });
  }

  try {
    const session = findRefreshSession(refreshToken);
    if (!session || session.revoked) {
      return res.status(401).json({
        error: "Invalid or revoked refresh token",
        code: "REFRESH_TOKEN_INVALID",
      });
    }

    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      return res.status(401).json({
        error: "Refresh token has expired",
        code: "REFRESH_TOKEN_EXPIRED",
      });
    }

    let subjectId = session.subject_id;
    let adminAccount = null;
    let role = session.role || "borrower";
    let username = session.username || null;

    if (session.subject_type === "admin") {
      adminAccount = findAdminAccountById(subjectId);
      if (!adminAccount || adminAccount.status !== "active") {
        return res.status(403).json({
          error: "Admin account is not active",
          code: "ADMIN_ACCOUNT_INACTIVE",
        });
      }
      role = adminAccount.role;
      username = adminAccount.username;
    }

    const newRefreshToken = rotateRefreshSession(refreshToken, getRefreshExpiryIso());
    if (session.subject_type === "admin") {
      const newAccessToken = jwt.sign(
        {
          sub: subjectId,
          scope: session.scope,
          role,
          username,
          adminAccountId: adminAccount?.id || null,
          adminBusinessRole: adminAccount?.role || null,
        },
        config.jwtSecret,
        { expiresIn: config.jwtExpiry }
      );

      return res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        role,
      });
    }

    const newAccessToken = jwt.sign(
      {
        sub: subjectId,
        scope: session.scope,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiry }
    );

    return res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return res.status(401).json({
      error: "Token refresh failed",
      code: "REFRESH_FAILED",
    });
  }
});

router.post("/logout", (req, res) => {
  return res.status(204).send();
});

module.exports = router;
