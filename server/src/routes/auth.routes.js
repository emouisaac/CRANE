const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { timingSafeEqual } = require("crypto");

const { config } = require("../config/env");
const {
  createAdminAccount,
  findAdminAccountById,
  findAdminAccountByUsername,
  findAuthUserByPhone,
  listAdminAccounts,
  sanitizeAdminAccount,
  touchAdminAccountLogin,
  upsertAuthUser,
  touchAuthUserLogin,
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

function authenticateAdminToken(req, res, next) {
  authenticate(req, res, (error) => {
    if (error) {
      return next(error);
    }

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

  return {
    accessToken,
    refreshToken: role === "master_admin" ? "master_admin_refresh_demo_token" : "admin_refresh_demo_token",
    role,
    deviceBound: true,
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

function createBorrowerSession(user, deviceId) {
  const accessToken = jwt.sign(
    { sub: user.id, phone: user.phone, email: user.email, deviceId, scope: ["borrower"] },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  return {
    token: accessToken,
    accessToken,
    refreshToken: "refresh_demo_token",
    onboardingState: "kyc_pending",
    biometricAvailable: true,
    deviceBound: true,
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email || null,
      isRegistered: true,
      lastLoginAt: user.last_login_at || null,
    },
  };
}

router.post("/register/request-otp", (req, res) => {
  const { phone, country } = req.body;
  const existingUser = findAuthUserByPhone(phone);

  res.json({
    challengeId: "otp_challenge_demo_001",
    phone,
    country,
    returningUser: Boolean(existingUser),
    deliveryStatus: "queued",
    expiresInSeconds: 120,
  });
});

router.post("/register/verify-otp", (req, res) => {
  const { phone, otp, deviceId } = req.body;

  if (otp !== "123456") {
    return res.status(401).json({
      error: "Invalid OTP",
      code: "OTP_INVALID",
    });
  }

  const accessToken = jwt.sign(
    { sub: "user_demo_001", phone, deviceId, scope: ["borrower"] },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  return res.json({
    accessToken,
    refreshToken: "refresh_demo_token",
    onboardingState: "kyc_pending",
    deviceBound: true,
  });
});

router.post("/register", (req, res) => {
  const { phone, email, pin, deviceId } = req.body;

  // Validate PIN
  if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({
      error: "PIN must be 6 digits",
      code: "PIN_INVALID",
    });
  }

  // Validate email if provided
  if (email && email.trim() !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Please enter a valid email address",
        code: "EMAIL_INVALID",
      });
    }
  }

  const user = upsertAuthUser({
    phone,
    email: email || null,
    pinHash: hashSecret(pin),
  });

  return res.json(createBorrowerSession(user, deviceId));
});

router.post("/login", (req, res) => {
  const { phone, pin, password, deviceId } = req.body;

  if (!phone || (!pin && !password)) {
    return res.status(400).json({
      error: "Phone and PIN/password are required",
    });
  }

  const user = findAuthUserByPhone(phone);

  if (!user) {
    return res.status(401).json({
      error: "User not registered. Please register first.",
      code: "USER_NOT_REGISTERED",
    });
  }

  // Validate PIN if provided
  if (pin && (pin.length !== 6 || !/^\d{6}$/.test(pin))) {
    return res.status(400).json({
      error: "PIN must be 6 digits",
      code: "PIN_INVALID",
    });
  }

  const suppliedSecret = pin || password;
  if (user.pin_hash !== hashSecret(suppliedSecret)) {
    return res.status(401).json({
      error: "Invalid phone or PIN.",
      code: "AUTH_INVALID",
    });
  }

  const updatedUser = touchAuthUserLogin(phone) || user;

  return res.json(createBorrowerSession(updatedUser, deviceId));
});

router.post("/admin/login", (req, res) => {
  const { username, password, deviceId, loginType, role } = req.body;
  const normalizedUsername = String(username || "").trim();
  const wantsMasterAdmin =
    normalizedUsername.toLowerCase() === "master_admin" ||
    loginType === "master_admin" ||
    role === "master_admin";

  if (!password || !deviceId) {
    return res.status(400).json({
      error: "Password and device ID are required",
      code: "MISSING_ADMIN_FIELDS",
    });
  }

  if (wantsMasterAdmin) {
    if (password !== config.adminPassword) {
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
        username: "master_admin",
      })
    );
  }

  if (!normalizedUsername) {
    return res.status(400).json({
      error: "Username is required for admin login",
      code: "ADMIN_USERNAME_REQUIRED",
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
  const {
    username,
    fullName,
    email,
    password,
    role = "loan_officer",
  } = req.body || {};

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
    const isUniqueConstraint = String(error.message || "").toLowerCase().includes("unique");
    return res.status(isUniqueConstraint ? 409 : 500).json({
      error: isUniqueConstraint
        ? "That admin username or email already exists"
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
    const isUniqueConstraint = String(error.message || "").toLowerCase().includes("unique");
    return res.status(isUniqueConstraint ? 409 : 500).json({
      error: isUniqueConstraint
        ? "That admin username or email already exists"
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
  res.json({
    accessToken: "biometric_access_demo",
    refreshToken: "biometric_refresh_demo",
    deviceBound: true,
    authMethod: "biometric",
  });
});

router.post("/logout", (req, res) => {
  res.status(204).send();
});

module.exports = router;
