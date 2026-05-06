const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const { config } = require("./env");

const SHARED_STATE_KEY = "shared_app_state";

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
    employmentStatus: storedProfile.employmentStatus || "",
    monthlyIncomeUgx: Number(storedProfile.monthlyIncomeUgx) || 0,
    wallets,
    bankLinked: Boolean(storedProfile.bankLinked),
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
  `);

  ensureColumn("auth_users", "status", `TEXT NOT NULL DEFAULT 'active'`);
  ensureColumn("auth_users", "profile_json", `TEXT NOT NULL DEFAULT '{}'`);
  ensureColumn("admin_accounts", "role", `TEXT NOT NULL DEFAULT 'loan_officer'`);
  ensureColumn("admin_accounts", "status", `TEXT NOT NULL DEFAULT 'active'`);

  return db;
}

function getDatabase() {
  return initializeDatabase();
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

module.exports = {
  getDatabase,
  getSharedState,
  saveSharedState,
  findAuthUserByPhone,
  findAuthUserById,
  upsertAuthUser,
  touchAuthUserLogin,
  buildAuthUserProfile,
  updateAuthUserProfile,
  listAdminAccounts,
  findAdminAccountByUsername,
  findAdminAccountById,
  createAdminAccount,
  updateAdminAccount,
  touchAdminAccountLogin,
  sanitizeAdminAccount,
};
