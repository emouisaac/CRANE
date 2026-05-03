const crypto = require("crypto");
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

function initializeDatabase() {
  if (db) {
    return db;
  }

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
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

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

  return (
    getDatabase()
      .prepare(`
        SELECT id, phone, email, pin_hash, last_login_at, created_at, updated_at
        FROM auth_users
        WHERE phone = ?
      `)
      .get(String(phone).trim()) || null
  );
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

  getDatabase()
    .prepare(`
      INSERT INTO auth_users (id, phone, email, pin_hash, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        email = excluded.email,
        pin_hash = excluded.pin_hash,
        updated_at = excluded.updated_at
    `)
    .run(
      userId,
      normalizedPhone,
      email ? String(email).trim() : null,
      pinHash,
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

module.exports = {
  getDatabase,
  getSharedState,
  saveSharedState,
  findAuthUserByPhone,
  upsertAuthUser,
  touchAuthUserLogin,
};
