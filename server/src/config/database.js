const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const { config } = require("./env");

const SHARED_STATE_KEY = "shared_app_state";
const ADMIN_SETTINGS_KEY = "admin_settings";

let db;

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function ensureColumn(tableName, columnName, definition) {
  const columns = getDatabase().prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    getDatabase().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function normalizeAuthUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    profile: parseJson(row.profile_json, {}),
    status: row.status || "active",
  };
}

function normalizeAdminAccountRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    status: row.status || "active",
    role: row.role || "loan_officer",
  };
}

function sanitizeAdminAccount(account) {
  if (!account) {
    return null;
  }

  return {
    id: account.id,
    username: account.username,
    fullName: account.full_name || account.fullName || "",
    email: account.email || "",
    role: account.role,
    status: account.status,
    createdAt: account.created_at || account.createdAt || null,
    updatedAt: account.updated_at || account.updatedAt || null,
    lastLoginAt: account.last_login_at || account.lastLoginAt || null,
  };
}

function normalizeConsentRows(rows) {
  return (rows || []).map((row) => ({
    key: row.consent_key,
    state: row.consent_state,
    updatedAt: row.updated_at,
  }));
}

function normalizeLoanApplicationRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    documents: parseJson(row.documents_json, []),
    reviewHistory: parseJson(row.review_history_json, []),
  };
}

function normalizeLoanRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: parseJson(row.metadata_json, {}),
  };
}

function normalizeNotificationRow(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    text: row.text,
    unread: Boolean(row.unread),
    createdAt: row.created_at,
    meta: parseJson(row.meta_json, {}),
  };
}

function normalizeMessageRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    admin_id: row.admin_id,
    sender_type: row.sender_type,
    message_text: row.message_text,
    message_type: row.message_type,
    is_from_admin: row.sender_type === "admin",
    read_at: row.read_at,
    created_at: row.created_at,
  };
}

function normalizeRiskAlertRow(row) {
  return {
    id: row.id,
    severity: row.severity,
    title: row.title,
    text: row.text,
    status: row.status,
    time: row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
    applicationId: row.application_id,
    loanId: row.loan_id,
  };
}

function normalizeAuditLogRow(row) {
  return {
    id: row.id,
    time: row.created_at,
    actor: row.actor_name || row.actor_id || row.actor_type,
    action: row.action,
    details: row.details || "",
    actorType: row.actor_type,
    actorId: row.actor_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    userId: row.user_id,
    metadata: parseJson(row.metadata_json, {}),
  };
}

function defaultAdminSettings() {
  return {
    defaultInterestRate: 5.8,
    maxLoanAmount: 10000000,
    minLoanAmount: 100000,
    autoApprovalThreshold: 760,
    maxConcurrentLoans: 3,
    paymentGracePeriod: 3,
  };
}

function buildAuthUserProfile(user) {
  const storedProfile = user?.profile || {};
  const wallets = Array.isArray(storedProfile.wallets)
    ? storedProfile.wallets.filter(Boolean)
    : [];

  return {
    ...storedProfile,
    fullName: storedProfile.fullName || "Crane Member",
    phone: user?.phone || "",
    email: user?.email || null,
    status: user?.status || "active",
    registeredAt: user?.created_at || null,
    lastLoginAt: user?.last_login_at || null,
    address: storedProfile.address || "",
    district: storedProfile.district || "",
    subcounty: storedProfile.subcounty || "",
    village: storedProfile.village || "",
    category: storedProfile.category || "",
    employmentStatus: storedProfile.employmentStatus || "",
    employerName: storedProfile.employerName || "",
    positionTitle: storedProfile.positionTitle || "",
    employmentTenure: storedProfile.employmentTenure || "",
    businessName: storedProfile.businessName || "",
    businessType: storedProfile.businessType || "",
    businessRegistration: storedProfile.businessRegistration || "",
    dateOfBirth: storedProfile.dateOfBirth || "",
    idNumber: storedProfile.idNumber || "",
    monthlyIncomeUgx: toNumber(storedProfile.monthlyIncomeUgx),
    otherIncomeUgx: toNumber(storedProfile.otherIncomeUgx),
    existingObligations: storedProfile.existingObligations || "",
    wallets,
    primaryWallet: storedProfile.primaryWallet || wallets[0] || "",
    bankAccount: storedProfile.bankAccount || "",
    bankLinked: Boolean(storedProfile.bankLinked),
    notificationPreferences: {
      sms: storedProfile.notificationPreferences?.sms !== false,
      email: storedProfile.notificationPreferences?.email !== false,
      marketing: Boolean(storedProfile.notificationPreferences?.marketing),
    },
    security: {
      biometricEnabled: Boolean(storedProfile.security?.biometricEnabled),
      deviceBindingEnabled: storedProfile.security?.deviceBindingEnabled !== false,
      autoDebitEnabled: Boolean(storedProfile.security?.autoDebitEnabled),
    },
  };
}

function initializeDatabase() {
  if (db) {
    return db;
  }

  ensureDirectoryForFile(config.dbPath);
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_state (
      state_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      email TEXT,
      pin_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      profile_json TEXT NOT NULL DEFAULT '{}',
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'loan_officer',
      status TEXT NOT NULL DEFAULT 'active',
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_sessions (
      id TEXT PRIMARY KEY,
      session_token TEXT NOT NULL UNIQUE,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      device_id TEXT,
      scope_json TEXT NOT NULL DEFAULT '[]',
      role TEXT,
      username TEXT,
      admin_account_id TEXT,
      admin_business_role TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_consents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      consent_key TEXT NOT NULL,
      consent_state TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, consent_key),
      FOREIGN KEY(user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS loan_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      id_number TEXT,
      date_of_birth TEXT,
      district TEXT,
      subcounty TEXT,
      village TEXT,
      category TEXT,
      amount REAL NOT NULL,
      term_months INTEGER NOT NULL,
      purpose TEXT NOT NULL,
      employer_name TEXT,
      position_title TEXT,
      employment_tenure TEXT,
      business_name TEXT,
      business_type TEXT,
      business_registration TEXT,
      monthly_income REAL DEFAULT 0,
      other_income REAL DEFAULT 0,
      existing_obligations TEXT,
      documents_json TEXT NOT NULL DEFAULT '[]',
      score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      assigned_admin_id TEXT,
      review_notes TEXT,
      rejection_reason TEXT,
      decision_notes TEXT,
      originated_loan_id TEXT,
      requested_at TEXT NOT NULL,
      reviewed_at TEXT,
      decision_at TEXT,
      review_history_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      application_id TEXT,
      principal_amount REAL NOT NULL,
      remaining_balance REAL NOT NULL,
      monthly_interest_rate REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      term_months INTEGER NOT NULL,
      paid_installments INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      approved_at TEXT,
      approved_by TEXT,
      disbursement_channel TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      unread INTEGER NOT NULL DEFAULT 1,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      admin_id TEXT,
      sender_type TEXT NOT NULL,
      message_text TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      read_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS risk_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      application_id TEXT,
      loan_id TEXT,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      admin_id TEXT,
      reset_token TEXT NOT NULL,
      token_expires_at TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    );
  `);

  ensureColumn("auth_users", "status", `TEXT NOT NULL DEFAULT 'active'`);
  ensureColumn("auth_users", "profile_json", `TEXT NOT NULL DEFAULT '{}'`);
  ensureColumn("admin_accounts", "role", `TEXT NOT NULL DEFAULT 'loan_officer'`);
  ensureColumn("admin_accounts", "status", `TEXT NOT NULL DEFAULT 'active'`);
  ensureColumn("loan_applications", "decision_notes", "TEXT");
  ensureColumn("loan_applications", "review_history_json", `TEXT NOT NULL DEFAULT '[]'`);
  ensureColumn("loans", "metadata_json", `TEXT NOT NULL DEFAULT '{}'`);
  ensureColumn("notifications", "meta_json", `TEXT NOT NULL DEFAULT '{}'`);

  const existingSettings = getSetting(ADMIN_SETTINGS_KEY);
  if (!existingSettings) {
    saveSetting(ADMIN_SETTINGS_KEY, defaultAdminSettings());
  }

  return db;
}

function getDatabase() {
  return initializeDatabase();
}

function getSetting(key, fallback = null) {
  const row = getDatabase()
    .prepare("SELECT payload FROM app_settings WHERE setting_key = ?")
    .get(key);

  return row ? parseJson(row.payload, fallback) : fallback;
}

function saveSetting(key, payload) {
  const timestamp = nowIso();
  getDatabase()
    .prepare(`
      INSERT INTO app_settings (setting_key, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `)
    .run(key, JSON.stringify(payload || {}), timestamp);

  return getSetting(key, {});
}

function getSharedState() {
  const row = getDatabase()
    .prepare("SELECT payload FROM shared_state WHERE state_key = ?")
    .get(SHARED_STATE_KEY);

  return parseJson(row?.payload, {});
}

function saveSharedState(state) {
  const timestamp = nowIso();
  const payload = JSON.stringify(state || {});

  getDatabase()
    .prepare(`
      INSERT INTO shared_state (state_key, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(state_key) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `)
    .run(SHARED_STATE_KEY, payload, timestamp);

  return getSharedState();
}

function findAuthUserByPhone(phone) {
  if (!phone) {
    return null;
  }

  const row =
    getDatabase()
      .prepare(`
        SELECT id, phone, email, pin_hash, status, profile_json, last_login_at, created_at, updated_at
        FROM auth_users
        WHERE phone = ?
      `)
      .get(String(phone).trim()) || null;

  return normalizeAuthUserRow(row);
}

function findAuthUserById(userId) {
  if (!userId) {
    return null;
  }

  const row =
    getDatabase()
      .prepare(`
        SELECT id, phone, email, pin_hash, status, profile_json, last_login_at, created_at, updated_at
        FROM auth_users
        WHERE id = ?
      `)
      .get(String(userId).trim()) || null;

  return normalizeAuthUserRow(row);
}

function listAuthUsers({ search = "", status = "" } = {}) {
  const rows = getDatabase()
    .prepare(`
      SELECT id, phone, email, pin_hash, status, profile_json, last_login_at, created_at, updated_at
      FROM auth_users
      ORDER BY created_at DESC
    `)
    .all();

  return rows
    .map(normalizeAuthUserRow)
    .filter((user) => {
      if (status && user.status !== status) {
        return false;
      }

      if (!search) {
        return true;
      }

      const profile = buildAuthUserProfile(user);
      const needle = String(search).trim().toLowerCase();
      return [profile.fullName, user.phone, user.email, profile.idNumber]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
}

function upsertAuthUser({ phone, email = null, pinHash }) {
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone) {
    throw new Error("Phone is required.");
  }

  if (!pinHash) {
    throw new Error("PIN hash is required.");
  }

  const existingUser = findAuthUserByPhone(normalizedPhone);
  const timestamp = nowIso();
  const userId = existingUser?.id || crypto.randomUUID();
  const normalizedEmail =
    typeof email === "undefined"
      ? existingUser?.email || null
      : email
        ? String(email).trim()
        : null;
  const profilePayload = JSON.stringify(existingUser?.profile || {});

  getDatabase()
    .prepare(`
      INSERT INTO auth_users (id, phone, email, pin_hash, status, profile_json, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        email = excluded.email,
        pin_hash = excluded.pin_hash,
        status = excluded.status,
        profile_json = excluded.profile_json,
        updated_at = excluded.updated_at
    `)
    .run(
      userId,
      normalizedPhone,
      normalizedEmail,
      pinHash,
      existingUser?.status || "active",
      profilePayload,
      existingUser?.last_login_at || null,
      existingUser?.created_at || timestamp,
      timestamp
    );

  return findAuthUserByPhone(normalizedPhone);
}

function touchAuthUserLogin(phone) {
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone) {
    return null;
  }

  const timestamp = nowIso();

  getDatabase()
    .prepare(`
      UPDATE auth_users
      SET last_login_at = ?, updated_at = ?
      WHERE phone = ?
    `)
    .run(timestamp, timestamp, normalizedPhone);

  return findAuthUserByPhone(normalizedPhone);
}

function updateAuthUserProfile(userId, profileUpdates) {
  const existingUser = findAuthUserById(userId);
  if (!existingUser) {
    return null;
  }

  const mergedProfile = {
    ...(existingUser.profile || {}),
    ...((profileUpdates && typeof profileUpdates === "object") ? profileUpdates : {}),
  };

  getDatabase()
    .prepare(`
      UPDATE auth_users
      SET profile_json = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(JSON.stringify(mergedProfile), nowIso(), existingUser.id);

  return findAuthUserById(existingUser.id);
}

function updateAuthUserPin(userId, pinHash) {
  const user = findAuthUserById(userId);
  if (!user) {
    return null;
  }

  getDatabase()
    .prepare(`
      UPDATE auth_users
      SET pin_hash = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(pinHash, nowIso(), user.id);

  return findAuthUserById(user.id);
}

function listAdminAccounts() {
  const rows = getDatabase()
    .prepare(`
      SELECT id, username, full_name, email, role, status, last_login_at, created_at, updated_at
      FROM admin_accounts
      ORDER BY created_at DESC
    `)
    .all();

  return rows.map((row) => sanitizeAdminAccount(normalizeAdminAccountRow(row)));
}

function findAdminAccountByUsername(username) {
  if (!username) {
    return null;
  }

  const row =
    getDatabase()
      .prepare(`
        SELECT id, username, full_name, email, password_hash, role, status, last_login_at, created_at, updated_at
        FROM admin_accounts
        WHERE lower(username) = lower(?)
      `)
      .get(String(username).trim()) || null;

  return normalizeAdminAccountRow(row);
}

function findAdminAccountById(adminId) {
  if (!adminId) {
    return null;
  }

  const row =
    getDatabase()
      .prepare(`
        SELECT id, username, full_name, email, password_hash, role, status, last_login_at, created_at, updated_at
        FROM admin_accounts
        WHERE id = ?
      `)
      .get(String(adminId).trim()) || null;

  return normalizeAdminAccountRow(row);
}

function createAdminAccount({ username, fullName, email = null, passwordHash, role = "loan_officer", status = "active" }) {
  const normalizedUsername = String(username || "").trim();
  const normalizedName = String(fullName || "").trim();

  if (!normalizedUsername) {
    throw new Error("Username is required.");
  }

  if (!normalizedName) {
    throw new Error("Full name is required.");
  }

  if (!passwordHash) {
    throw new Error("Password hash is required.");
  }

  const timestamp = nowIso();
  const adminId = crypto.randomUUID();

  getDatabase()
    .prepare(`
      INSERT INTO admin_accounts (id, username, full_name, email, password_hash, role, status, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      adminId,
      normalizedUsername,
      normalizedName,
      email ? String(email).trim() : null,
      passwordHash,
      role,
      status,
      null,
      timestamp,
      timestamp
    );

  return sanitizeAdminAccount(findAdminAccountById(adminId));
}

function updateAdminAccount(adminId, updates) {
  const existingAccount = findAdminAccountById(adminId);
  if (!existingAccount) {
    return null;
  }

  const nextValues = {
    username: typeof updates.username === "string" ? updates.username.trim() : existingAccount.username,
    fullName: typeof updates.fullName === "string" ? updates.fullName.trim() : existingAccount.full_name,
    email: Object.prototype.hasOwnProperty.call(updates, "email")
      ? (updates.email ? String(updates.email).trim() : null)
      : existingAccount.email,
    passwordHash: updates.passwordHash || existingAccount.password_hash,
    role: updates.role || existingAccount.role,
    status: updates.status || existingAccount.status,
  };

  getDatabase()
    .prepare(`
      UPDATE admin_accounts
      SET username = ?, full_name = ?, email = ?, password_hash = ?, role = ?, status = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      nextValues.username,
      nextValues.fullName,
      nextValues.email,
      nextValues.passwordHash,
      nextValues.role,
      nextValues.status,
      nowIso(),
      existingAccount.id
    );

  return sanitizeAdminAccount(findAdminAccountById(existingAccount.id));
}

function touchAdminAccountLogin(adminId) {
  const existingAccount = findAdminAccountById(adminId);
  if (!existingAccount) {
    return null;
  }

  const timestamp = nowIso();

  getDatabase()
    .prepare(`
      UPDATE admin_accounts
      SET last_login_at = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(timestamp, timestamp, existingAccount.id);

  return sanitizeAdminAccount(findAdminAccountById(existingAccount.id));
}

function createOtpChallenge(phone, otpCode, expiresAt) {
  const id = crypto.randomUUID();
  getDatabase()
    .prepare(`
      INSERT INTO otp_challenges (id, phone, otp_code, expires_at, consumed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(id, phone, otpCode, expiresAt, null, nowIso());

  return {
    id,
    phone,
    expiresAt,
  };
}

function consumeOtpChallenge(phone, otpCode) {
  const challenge =
    getDatabase()
      .prepare(`
        SELECT id, phone, otp_code, expires_at, consumed_at
        FROM otp_challenges
        WHERE phone = ? AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(phone) || null;

  if (!challenge) {
    return { ok: false, reason: "challenge_missing" };
  }

  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "challenge_expired" };
  }

  if (String(challenge.otp_code) !== String(otpCode)) {
    return { ok: false, reason: "challenge_invalid" };
  }

  getDatabase()
    .prepare("UPDATE otp_challenges SET consumed_at = ? WHERE id = ?")
    .run(nowIso(), challenge.id);

  return { ok: true, challengeId: challenge.id };
}

function createRefreshSession({
  subjectType,
  subjectId,
  deviceId = null,
  scope = [],
  role = null,
  username = null,
  adminAccountId = null,
  adminBusinessRole = null,
  expiresAt,
}) {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const timestamp = nowIso();

  getDatabase()
    .prepare(`
      INSERT INTO refresh_sessions (
        id, session_token, subject_type, subject_id, device_id, scope_json, role, username,
        admin_account_id, admin_business_role, expires_at, revoked_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      crypto.randomUUID(),
      sessionToken,
      subjectType,
      subjectId,
      deviceId,
      JSON.stringify(scope || []),
      role,
      username,
      adminAccountId,
      adminBusinessRole,
      expiresAt,
      null,
      timestamp,
      timestamp
    );

  return sessionToken;
}

function findRefreshSession(token) {
  if (!token) {
    return null;
  }

  const row =
    getDatabase()
      .prepare(`
        SELECT id, session_token, subject_type, subject_id, device_id, scope_json, role, username,
               admin_account_id, admin_business_role, expires_at, revoked_at, created_at, updated_at
        FROM refresh_sessions
        WHERE session_token = ?
      `)
      .get(token) || null;

  if (!row) {
    return null;
  }

  return {
    ...row,
    scope: parseJson(row.scope_json, []),
  };
}

function revokeRefreshSession(token) {
  if (!token) {
    return false;
  }

  getDatabase()
    .prepare("UPDATE refresh_sessions SET revoked_at = ?, updated_at = ? WHERE session_token = ?")
    .run(nowIso(), nowIso(), token);

  return true;
}

function rotateRefreshSession(token) {
  const session = findRefreshSession(token);
  if (!session || session.revoked_at) {
    return null;
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    revokeRefreshSession(token);
    return null;
  }

  revokeRefreshSession(token);
  return createRefreshSession({
    subjectType: session.subject_type,
    subjectId: session.subject_id,
    deviceId: session.device_id,
    scope: session.scope,
    role: session.role,
    username: session.username,
    adminAccountId: session.admin_account_id,
    adminBusinessRole: session.admin_business_role,
    expiresAt: session.expires_at,
  });
}

function getUserConsents(userId) {
  const rows = getDatabase()
    .prepare(`
      SELECT consent_key, consent_state, updated_at
      FROM user_consents
      WHERE user_id = ?
      ORDER BY consent_key ASC
    `)
    .all(userId);

  return normalizeConsentRows(rows);
}

function saveUserConsents(userId, consents = []) {
  const timestamp = nowIso();
  const insertStatement = getDatabase().prepare(`
    INSERT INTO user_consents (id, user_id, consent_key, consent_state, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, consent_key) DO UPDATE SET
      consent_state = excluded.consent_state,
      updated_at = excluded.updated_at
  `);

  (consents || []).forEach((consent) => {
    if (!consent?.key) {
      return;
    }

    insertStatement.run(
      crypto.randomUUID(),
      userId,
      String(consent.key),
      consent.state === "denied" ? "denied" : "granted",
      timestamp
    );
  });

  return getUserConsents(userId);
}

function getAdminSettings() {
  return {
    ...defaultAdminSettings(),
    ...(getSetting(ADMIN_SETTINGS_KEY, {}) || {}),
  };
}

function saveAdminSettings(settings) {
  return saveSetting(ADMIN_SETTINGS_KEY, {
    ...getAdminSettings(),
    ...(settings || {}),
  });
}

function createAuditLog({
  userId = null,
  actorType,
  actorId = null,
  actorName = null,
  action,
  entityType,
  entityId = null,
  details = "",
  metadata = {},
}) {
  const log = {
    id: `AUD-${Date.now().toString(36).toUpperCase()}`,
    userId,
    actorType,
    actorId,
    actorName,
    action,
    entityType,
    entityId,
    details,
    metadata,
    createdAt: nowIso(),
  };

  getDatabase()
    .prepare(`
      INSERT INTO audit_logs (
        id, user_id, actor_type, actor_id, actor_name, action, entity_type, entity_id, details, metadata_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      log.id,
      log.userId,
      log.actorType,
      log.actorId,
      log.actorName,
      log.action,
      log.entityType,
      log.entityId,
      log.details,
      JSON.stringify(log.metadata || {}),
      log.createdAt
    );

  return log;
}

function listAuditLogs(limit = 100) {
  const rows = getDatabase()
    .prepare(`
      SELECT id, user_id, actor_type, actor_id, actor_name, action, entity_type, entity_id, details, metadata_json, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(limit);

  return rows.map(normalizeAuditLogRow);
}

function createNotification({ userId, type, title, text, meta = {}, unread = true }) {
  const notification = {
    id: crypto.randomUUID(),
    userId,
    type,
    title,
    text,
    meta,
    unread: unread ? 1 : 0,
    createdAt: nowIso(),
  };

  getDatabase()
    .prepare(`
      INSERT INTO notifications (id, user_id, type, title, text, unread, meta_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      notification.id,
      notification.userId,
      notification.type,
      notification.title,
      notification.text,
      notification.unread,
      JSON.stringify(notification.meta || {}),
      notification.createdAt
    );

  return notification;
}

function listNotificationsByUser(userId) {
  const rows = getDatabase()
    .prepare(`
      SELECT id, type, title, text, unread, meta_json, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
    `)
    .all(userId);

  return rows.map(normalizeNotificationRow);
}

function markAllNotificationsRead(userId) {
  getDatabase()
    .prepare("UPDATE notifications SET unread = 0 WHERE user_id = ?")
    .run(userId);

  return listNotificationsByUser(userId);
}

function createChatMessage({ userId, adminId = null, senderType, messageText, messageType = "text" }) {
  const message = {
    id: crypto.randomUUID(),
    userId,
    adminId,
    senderType,
    messageText: String(messageText || "").trim(),
    messageType,
    createdAt: nowIso(),
  };

  getDatabase()
    .prepare(`
      INSERT INTO chat_messages (id, user_id, admin_id, sender_type, message_text, message_type, read_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      message.id,
      message.userId,
      message.adminId,
      message.senderType,
      message.messageText,
      message.messageType,
      null,
      message.createdAt
    );

  return message;
}

function listChatMessagesForUser(userId) {
  const rows = getDatabase()
    .prepare(`
      SELECT id, user_id, admin_id, sender_type, message_text, message_type, read_at, created_at
      FROM chat_messages
      WHERE user_id = ?
      ORDER BY created_at ASC
    `)
    .all(userId);

  return rows.map(normalizeMessageRow);
}

function createRiskAlert({
  userId = null,
  applicationId = null,
  loanId = null,
  severity = "medium",
  title,
  text,
  status = "open",
}) {
  const alert = {
    id: `RISK-${Date.now().toString(36).toUpperCase()}`,
    userId,
    applicationId,
    loanId,
    severity,
    title,
    text,
    status,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  getDatabase()
    .prepare(`
      INSERT INTO risk_alerts (id, user_id, application_id, loan_id, severity, title, text, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      alert.id,
      alert.userId,
      alert.applicationId,
      alert.loanId,
      alert.severity,
      alert.title,
      alert.text,
      alert.status,
      alert.createdAt,
      alert.updatedAt
    );

  return alert;
}

function listRiskAlerts({ status = "", severity = "" } = {}) {
  const rows = getDatabase()
    .prepare(`
      SELECT id, user_id, application_id, loan_id, severity, title, text, status, created_at, updated_at
      FROM risk_alerts
      ORDER BY created_at DESC
    `)
    .all();

  return rows
    .map(normalizeRiskAlertRow)
    .filter((alert) => (!status || alert.status === status) && (!severity || alert.severity === severity));
}

function updateRiskAlertStatus(riskId, status) {
  getDatabase()
    .prepare("UPDATE risk_alerts SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, nowIso(), riskId);

  return listRiskAlerts().find((alert) => alert.id === riskId) || null;
}

function scoreLoanApplication(input, settings = defaultAdminSettings()) {
  let score = 560;
  const monthlyIncome = toNumber(input.monthlyIncome);
  const otherIncome = toNumber(input.otherIncome);

  if (input.fullName) score += 20;
  if (input.idNumber) score += 20;
  if (input.dateOfBirth) score += 10;
  if (input.district && input.village) score += 15;
  if (input.category) score += 15;
  if (input.phone) score += 10;
  if (input.email) score += 10;
  if (monthlyIncome >= 3000000) score += 70;
  else if (monthlyIncome >= 1500000) score += 45;
  else if (monthlyIncome >= 700000) score += 25;
  else if (monthlyIncome > 0) score += 10;
  if (otherIncome > 0) score += 10;
  if ((input.documents || []).length >= 4) score += 35;
  else if ((input.documents || []).length >= 2) score += 20;
  if (toNumber(input.amount) > settings.maxLoanAmount) score -= 60;
  if (toNumber(input.amount) > (monthlyIncome + otherIncome) * 4 && monthlyIncome > 0) score -= 50;
  if (String(input.existingObligations || "").trim()) score -= 10;

  return clamp(Math.round(score), 300, 850);
}

function appendReviewHistory(existingHistory, entry) {
  const history = Array.isArray(existingHistory) ? existingHistory.slice() : [];
  history.unshift({
    id: crypto.randomUUID(),
    time: nowIso(),
    ...entry,
  });
  return history;
}

function listLoanApplications({ userId = null, status = "", search = "" } = {}) {
  const rows = getDatabase()
    .prepare(`
      SELECT *
      FROM loan_applications
      ORDER BY requested_at DESC
    `)
    .all();

  return rows
    .map(normalizeLoanApplicationRow)
    .filter((application) => {
      if (userId && application.user_id !== userId) {
        return false;
      }

      if (status && application.status !== status) {
        return false;
      }

      if (!search) {
        return true;
      }

      const needle = String(search).trim().toLowerCase();
      return [
        application.id,
        application.full_name,
        application.phone,
        application.email,
        application.id_number,
        application.purpose,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
}

function findLoanApplicationById(applicationId) {
  const row =
    getDatabase()
      .prepare("SELECT * FROM loan_applications WHERE id = ?")
      .get(applicationId) || null;

  return normalizeLoanApplicationRow(row);
}

function createLoanApplication(input) {
  const settings = getAdminSettings();
  const timestamp = nowIso();
  const applicationId = `APP-${Date.now().toString(36).toUpperCase()}`;
  const documents = Array.isArray(input.documents) ? input.documents.filter(Boolean) : [];
  const score = scoreLoanApplication(input, settings);

  getDatabase()
    .prepare(`
      INSERT INTO loan_applications (
        id, user_id, full_name, phone, email, id_number, date_of_birth, district, subcounty, village, category,
        amount, term_months, purpose, employer_name, position_title, employment_tenure, business_name,
        business_type, business_registration, monthly_income, other_income, existing_obligations, documents_json,
        score, status, assigned_admin_id, review_notes, rejection_reason, decision_notes, originated_loan_id,
        requested_at, reviewed_at, decision_at, review_history_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      applicationId,
      input.userId,
      input.fullName,
      input.phone,
      input.email || null,
      input.idNumber || null,
      input.dateOfBirth || null,
      input.district || null,
      input.subcounty || null,
      input.village || null,
      input.category || null,
      toNumber(input.amount),
      toNumber(input.termMonths, 1),
      input.purpose,
      input.employerName || null,
      input.positionTitle || null,
      input.employmentTenure || null,
      input.businessName || null,
      input.businessType || null,
      input.businessRegistration || null,
      toNumber(input.monthlyIncome),
      toNumber(input.otherIncome),
      input.existingObligations || null,
      JSON.stringify(documents),
      score,
      "pending",
      null,
      null,
      null,
      null,
      null,
      timestamp,
      null,
      null,
      JSON.stringify([]),
      timestamp,
      timestamp
    );

  if (score < 620) {
    createRiskAlert({
      userId: input.userId,
      applicationId,
      severity: "medium",
      title: "Low application score",
      text: `Application ${applicationId} landed at score ${score} and should be reviewed carefully.`,
    });
  }

  createNotification({
    userId: input.userId,
    type: "info",
    title: "Loan request received",
    text: `Your application ${applicationId} has been submitted and is awaiting review.`,
    meta: { applicationId },
  });

  createAuditLog({
    userId: input.userId,
    actorType: "user",
    actorId: input.userId,
    actorName: input.fullName,
    action: `Submitted loan application ${applicationId}`,
    entityType: "loan_application",
    entityId: applicationId,
    details: `Requested UGX ${toNumber(input.amount).toLocaleString()} for ${toNumber(input.termMonths, 1)} month(s).`,
  });

  return findLoanApplicationById(applicationId);
}

function updateLoanApplication(applicationId, updates = {}) {
  const application = findLoanApplicationById(applicationId);
  if (!application) {
    return null;
  }

  const nextHistory = appendReviewHistory(application.reviewHistory, updates.reviewHistoryEntry);
  const nextDocuments = Array.isArray(updates.documents) ? updates.documents : application.documents;
  const nextStatus = updates.status || application.status;
  const timestamp = nowIso();

  getDatabase()
    .prepare(`
      UPDATE loan_applications
      SET status = ?, assigned_admin_id = ?, review_notes = ?, rejection_reason = ?, decision_notes = ?,
          originated_loan_id = ?, reviewed_at = ?, decision_at = ?, review_history_json = ?, documents_json = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      nextStatus,
      Object.prototype.hasOwnProperty.call(updates, "assignedAdminId") ? updates.assignedAdminId : application.assigned_admin_id,
      Object.prototype.hasOwnProperty.call(updates, "reviewNotes") ? updates.reviewNotes : application.review_notes,
      Object.prototype.hasOwnProperty.call(updates, "rejectionReason") ? updates.rejectionReason : application.rejection_reason,
      Object.prototype.hasOwnProperty.call(updates, "decisionNotes") ? updates.decisionNotes : application.decision_notes,
      Object.prototype.hasOwnProperty.call(updates, "originatedLoanId") ? updates.originatedLoanId : application.originated_loan_id,
      updates.reviewedAt || application.reviewed_at,
      updates.decisionAt || application.decision_at,
      JSON.stringify(nextHistory),
      JSON.stringify(nextDocuments),
      timestamp,
      applicationId
    );

  return findLoanApplicationById(applicationId);
}

function listLoansByUser(userId) {
  const rows = getDatabase()
    .prepare(`
      SELECT *
      FROM loans
      WHERE user_id = ?
      ORDER BY created_at DESC
    `)
    .all(userId);

  return rows.map(normalizeLoanRow);
}

function listAllLoans() {
  const rows = getDatabase()
    .prepare(`
      SELECT *
      FROM loans
      ORDER BY created_at DESC
    `)
    .all();

  return rows.map(normalizeLoanRow);
}

function findLoanById(loanId) {
  const row =
    getDatabase()
      .prepare("SELECT * FROM loans WHERE id = ?")
      .get(loanId) || null;

  return normalizeLoanRow(row);
}

function createLoanFromApplication(application, { approvedBy, disbursementChannel = "mobile_money", monthlyInterestRate } = {}) {
  const loanId = `L-${Date.now().toString(36).toUpperCase()}`;
  const timestamp = nowIso();
  const settings = getAdminSettings();
  const rate = toNumber(monthlyInterestRate, toNumber(settings.defaultInterestRate) / 100);
  const dueDate = new Date(Date.now() + clamp(toNumber(application.term_months, 1), 1, 24) * 30 * 24 * 60 * 60 * 1000).toISOString();

  getDatabase()
    .prepare(`
      INSERT INTO loans (
        id, user_id, application_id, principal_amount, remaining_balance, monthly_interest_rate, status,
        term_months, paid_installments, due_date, approved_at, approved_by, disbursement_channel, metadata_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      loanId,
      application.user_id,
      application.id,
      toNumber(application.amount),
      toNumber(application.amount),
      rate,
      "active",
      toNumber(application.term_months, 1),
      0,
      dueDate,
      timestamp,
      approvedBy,
      disbursementChannel,
      JSON.stringify({
        borrowerName: application.full_name,
        purpose: application.purpose,
      }),
      timestamp,
      timestamp
    );

  updateLoanApplication(application.id, {
    status: "approved",
    originatedLoanId: loanId,
    decisionAt: timestamp,
  });

  return findLoanById(loanId);
}

function recordLoanPayment(loanId, amount, method = "mobile_money") {
  const loan = findLoanById(loanId);
  if (!loan) {
    return null;
  }

  const paymentAmount = clamp(toNumber(amount), 0, loan.remaining_balance);
  const nextRemaining = clamp(loan.remaining_balance - paymentAmount, 0, loan.principal_amount);
  const nextPaidInstallments = paymentAmount > 0
    ? clamp(loan.paid_installments + 1, 0, loan.term_months)
    : loan.paid_installments;
  const nextStatus = nextRemaining === 0 ? "completed" : loan.status;

  getDatabase()
    .prepare(`
      UPDATE loans
      SET remaining_balance = ?, paid_installments = ?, status = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(nextRemaining, nextPaidInstallments, nextStatus, nowIso(), loanId);

  const updatedLoan = findLoanById(loanId);
  createNotification({
    userId: updatedLoan.user_id,
    type: "success",
    title: "Payment recorded",
    text: `We received your ${method.replace(/_/g, " ")} payment of UGX ${paymentAmount.toLocaleString()}.`,
    meta: { loanId },
  });

  createAuditLog({
    userId: updatedLoan.user_id,
    actorType: "user",
    actorId: updatedLoan.user_id,
    action: `Recorded loan payment for ${loanId}`,
    entityType: "loan",
    entityId: loanId,
    details: `Payment amount: UGX ${paymentAmount.toLocaleString()}.`,
    metadata: { method },
  });

  return updatedLoan;
}

function listPasswordResetRequestsByUser(userId) {
  return getDatabase()
    .prepare(`
      SELECT id, user_id, admin_id, reset_token, token_expires_at, reason, status, created_at
      FROM password_reset_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
    `)
    .all(userId);
}

function createPasswordResetRequest({ userId, adminId = null, reason = "admin_initiated" }) {
  const request = {
    id: crypto.randomUUID(),
    userId,
    adminId,
    resetToken: crypto.randomBytes(20).toString("hex"),
    tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    reason,
    status: "pending",
    createdAt: nowIso(),
  };

  getDatabase()
    .prepare(`
      INSERT INTO password_reset_requests (id, user_id, admin_id, reset_token, token_expires_at, reason, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      request.id,
      request.userId,
      request.adminId,
      request.resetToken,
      request.tokenExpiresAt,
      request.reason,
      request.status,
      request.createdAt
    );

  return request;
}

function buildLoanCardFromRow(loan) {
  return {
    id: loan.id,
    borrowerName: loan.metadata?.borrowerName || "Borrower",
    amount: toNumber(loan.principal_amount),
    remaining: toNumber(loan.remaining_balance),
    interest: Math.round(toNumber(loan.monthly_interest_rate) * 1000) / 10,
    status: loan.status,
    dueDate: loan.due_date,
    term: toNumber(loan.term_months, 1),
    paidInstallments: toNumber(loan.paid_installments, 0),
  };
}

function computeCreditSummary(userId) {
  const user = findAuthUserById(userId);
  if (!user) {
    return null;
  }

  const profile = buildAuthUserProfile(user);
  const settings = getAdminSettings();
  const applications = listLoanApplications({ userId });
  const loans = listLoansByUser(userId);
  const consents = getUserConsents(userId);
  const openRisks = listRiskAlerts().filter((risk) => risk.userId === userId && risk.status !== "resolved");
  const completedLoans = loans.filter((loan) => loan.status === "completed").length;
  const activeLoans = loans.filter((loan) => loan.status === "active").length;
  const deniedApps = applications.filter((application) => application.status === "rejected").length;

  let score = 580;
  if (profile.fullName) score += 20;
  if (profile.idNumber) score += 20;
  if (profile.address || profile.village) score += 20;
  if (profile.monthlyIncomeUgx >= 3000000) score += 70;
  else if (profile.monthlyIncomeUgx >= 1500000) score += 45;
  else if (profile.monthlyIncomeUgx >= 700000) score += 20;
  if (profile.primaryWallet) score += 15;
  if (profile.bankLinked) score += 15;
  score += Math.min(30, consents.filter((consent) => consent.state === "granted").length * 6);
  score += Math.min(40, completedLoans * 15);
  score -= deniedApps * 12;
  score -= openRisks.some((risk) => risk.severity === "high") ? 50 : 0;
  score -= activeLoans >= settings.maxConcurrentLoans ? 40 : 0;
  score = clamp(Math.round(score), 300, 850);

  let eligibility = "review_in_progress";
  if (score >= settings.autoApprovalThreshold) {
    eligibility = "approved_instantly";
  } else if (score >= 680) {
    eligibility = "eligible_with_soft_review";
  } else if (score >= 610) {
    eligibility = "starter_limit_available";
  }

  const incomeBase = Math.max(profile.monthlyIncomeUgx + profile.otherIncomeUgx, 250000);
  const creditLimitUgx = clamp(
    Math.round((incomeBase * (score >= 760 ? 2.5 : score >= 680 ? 1.8 : 1.2)) / 50000) * 50000,
    settings.minLoanAmount,
    settings.maxLoanAmount
  );

  return {
    score,
    eligibility,
    creditLimitUgx,
    monthlyInterestRate: clamp(toNumber(settings.defaultInterestRate) / 100, 0.01, 0.15),
    drivers: [
      profile.monthlyIncomeUgx > 0 ? "Verified income profile" : "Complete income profile to improve your limit",
      profile.primaryWallet ? "Primary wallet on file" : "Add a preferred disbursement wallet",
      completedLoans > 0 ? "Positive repayment history" : "Build repayment history with on-time payments",
      openRisks.length === 0 ? "No open risk flags" : "Resolve open review flags for faster approvals",
    ],
  };
}

function buildMarketingFromScore(summary) {
  const limit = summary?.creditLimitUgx || 500000;
  const ratePct = Math.round((summary?.monthlyInterestRate || 0.058) * 1000) / 10;
  const approvedToday = 18 + (summary?.score || 600) % 40;
  const approvalRate = `${clamp(Math.round(((summary?.score || 600) - 420) / 4), 72, 96)}%`;
  const repeatBorrowers = `${clamp(Math.round(((summary?.score || 600) - 300) / 7), 30, 74)}%`;

  return {
    offers: [
      {
        title: summary?.score >= 760 ? "Prime Growth" : "Growth Boost",
        amount: limit,
        rate: `${ratePct}% monthly`,
        term: "6 months",
        installment: Math.round(limit / 6),
        payout: "Same day",
        message: "This offer updates as your profile and repayment history improve.",
        blurb: "Use this for inventory, emergency needs, or working capital.",
        progress: clamp(Math.round(((summary?.score || 600) - 300) / 5), 20, 98),
      },
      {
        title: "Fast Flex",
        amount: Math.max(Math.round(limit * 0.65), 250000),
        rate: `${Math.max(ratePct - 0.3, 2.4)}% monthly`,
        term: "3 months",
        installment: Math.round((limit * 0.65) / 3),
        payout: "Within hours",
        message: "Shorter-tenor option for quick bridge financing.",
        blurb: "Best when you need smaller amounts fast.",
        progress: clamp(Math.round(((summary?.score || 600) - 260) / 5), 15, 90),
      },
    ],
    tickerMessages: [
      "Profile completeness and repayment behavior drive your live credit limit.",
      "Master-admin decisions are pushed into your dashboard as soon as they are made.",
      "Support chat now syncs directly between your account and the admin team.",
    ],
    pulse: {
      approvedToday,
      averageTicket: `UGX ${(Math.round(limit / 100000) / 10).toFixed(1)}M`,
      sameDay: "91%",
      rating: "4.8/5",
      approvalRate,
      payoutSpeed: "Same day",
      repeatBorrowers,
    },
  };
}

function buildBorrowerDashboard(userId) {
  const user = findAuthUserById(userId);
  if (!user) {
    return null;
  }

  const profile = buildAuthUserProfile(user);
  const loans = listLoansByUser(userId).map(buildLoanCardFromRow);
  const notifications = listNotificationsByUser(userId);
  const applications = listLoanApplications({ userId });
  const messages = listChatMessagesForUser(userId);
  const summary = computeCreditSummary(userId);
  const remainingBalance = loans.reduce((sum, loan) => sum + toNumber(loan.remaining), 0);
  const totalBorrowed = loans.reduce((sum, loan) => sum + toNumber(loan.amount), 0);
  const nextDueLoan = loans
    .filter((loan) => loan.status !== "completed" && loan.dueDate)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  return {
    user: {
      id: user.id,
      name: profile.fullName,
      initials: profile.fullName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("") || "CU",
      phone: user.phone,
      email: user.email,
      status: user.status,
      registeredAt: user.created_at,
      lastLoginAt: user.last_login_at,
      creditScore: summary.score,
      totalBorrowed,
      remainingBalance,
      nextDueDate: nextDueLoan?.dueDate || null,
      notificationPreferences: profile.notificationPreferences,
      security: profile.security,
    },
    profile,
    scoring: summary,
    loans,
    applications: applications.map((application) => ({
      id: application.id,
      borrower: application.full_name,
      phone: application.phone,
      amount: toNumber(application.amount),
      term: toNumber(application.term_months, 1),
      purpose: application.purpose,
      status: application.status,
      score: toNumber(application.score),
      requestedAt: application.requested_at,
      documents: application.documents,
      rejectReason: application.rejection_reason || null,
      reviewHistory: application.reviewHistory,
    })),
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      text: notification.text,
      time: new Date(notification.createdAt).toLocaleString(),
      unread: notification.unread,
      createdAt: notification.createdAt,
    })),
    referrals: [],
    messages,
    marketing: buildMarketingFromScore(summary),
  };
}

function buildCustomerSummary(user) {
  const profile = buildAuthUserProfile(user);
  const loans = listLoansByUser(user.id);
  const applications = listLoanApplications({ userId: user.id });
  const lastApplication = applications[0] || null;
  const activeLoans = loans.filter((loan) => loan.status === "active").length;
  const totalBorrowed = loans.reduce((sum, loan) => sum + toNumber(loan.principal_amount), 0);
  const hasOverdue = loans.some((loan) => loan.status === "overdue");

  return {
    id: user.id,
    name: profile.fullName,
    phone: user.phone,
    email: user.email,
    status: user.status,
    kycStatus: lastApplication
      ? (lastApplication.status === "needs_documents" ? "needs_documents" : "verified")
      : "not_started",
    activeLoans,
    totalBorrowed,
    repaymentStatus: hasOverdue ? "Overdue" : activeLoans ? "On track" : "No active loan",
    lastLoginAt: user.last_login_at,
    registeredAt: user.created_at,
    profile,
  };
}

function buildAdminPortalState() {
  const applications = listLoanApplications();
  const allLoans = listAllLoans();
  const allUsers = listAuthUsers();
  const settings = getAdminSettings();
  const riskAlerts = listRiskAlerts();
  const auditLogs = listAuditLogs(100);

  return {
    loans: allLoans.map(buildLoanCardFromRow),
    customers: allUsers.map(buildCustomerSummary),
    admin: {
      adminUsers: listAdminAccounts().map((account) => ({
        id: account.id,
        username: account.username,
        name: account.fullName,
        email: account.email,
        role: account.role,
        status: account.status,
        createdAt: account.createdAt ? String(account.createdAt).split("T")[0] : "",
        lastLogin: account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : "Never",
      })),
      loanApplications: applications.map((application) => ({
        id: application.id,
        borrower: application.full_name,
        user: application.full_name,
        phone: application.phone,
        amount: toNumber(application.amount),
        term: toNumber(application.term_months, 1),
        purpose: application.purpose,
        status: application.status,
        score: toNumber(application.score),
        requestedAt: application.requested_at,
        documents: application.documents,
        rejectReason: application.rejection_reason || null,
        reviewHistory: application.reviewHistory,
      })),
      applications: applications.map((application) => ({
        id: application.id,
        borrower: application.full_name,
        user: application.full_name,
        phone: application.phone,
        amount: toNumber(application.amount),
        term: toNumber(application.term_months, 1),
        purpose: application.purpose,
        status: application.status,
        score: toNumber(application.score),
        requestedAt: application.requested_at,
        documents: application.documents,
        rejectReason: application.rejection_reason || null,
        reviewHistory: application.reviewHistory,
      })),
      riskAlerts,
      auditLogs,
      settings,
    },
  };
}

module.exports = {
  getDatabase,
  getSharedState,
  saveSharedState,
  getSetting,
  saveSetting,
  findAuthUserByPhone,
  findAuthUserById,
  listAuthUsers,
  upsertAuthUser,
  touchAuthUserLogin,
  buildAuthUserProfile,
  updateAuthUserProfile,
  updateAuthUserPin,
  listAdminAccounts,
  findAdminAccountByUsername,
  findAdminAccountById,
  createAdminAccount,
  updateAdminAccount,
  touchAdminAccountLogin,
  sanitizeAdminAccount,
  createOtpChallenge,
  consumeOtpChallenge,
  createRefreshSession,
  findRefreshSession,
  revokeRefreshSession,
  rotateRefreshSession,
  getUserConsents,
  saveUserConsents,
  getAdminSettings,
  saveAdminSettings,
  createAuditLog,
  listAuditLogs,
  createNotification,
  listNotificationsByUser,
  markAllNotificationsRead,
  createChatMessage,
  listChatMessagesForUser,
  createRiskAlert,
  listRiskAlerts,
  updateRiskAlertStatus,
  scoreLoanApplication,
  listLoanApplications,
  findLoanApplicationById,
  createLoanApplication,
  updateLoanApplication,
  listLoansByUser,
  listAllLoans,
  findLoanById,
  createLoanFromApplication,
  recordLoanPayment,
  listPasswordResetRequestsByUser,
  createPasswordResetRequest,
  computeCreditSummary,
  buildBorrowerDashboard,
  buildCustomerSummary,
  buildAdminPortalState,
  buildLoanCardFromRow,
  buildMarketingFromScore,
  defaultAdminSettings,
};
