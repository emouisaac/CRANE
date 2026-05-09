const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const { config } = require("./env");

const SHARED_STATE_KEY = "shared_app_state";
const ADMIN_SETTINGS_KEY = "admin_settings";

let db;

function getLegacyDatabasePaths() {
  return [
    path.resolve(process.cwd(), "data", "database.sqlite"),
    path.resolve(process.cwd(), "database.sqlite"),
    path.resolve(process.cwd(), "server", "database.sqlite"),
  ].filter((legacyPath) => legacyPath !== config.dbPath && fs.existsSync(legacyPath));
}

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

function bootstrapDatabaseFile() {
  if (fs.existsSync(config.dbPath)) {
    return;
  }

  const [sourcePath] = getLegacyDatabasePaths();
  if (!sourcePath) {
    return;
  }

  ensureDirectoryForFile(config.dbPath);
  fs.copyFileSync(sourcePath, config.dbPath);
  console.log(`Bootstrapped SQLite database from ${sourcePath} to ${config.dbPath}`);
}

function ensureColumn(tableName, columnName, definition) {
  const columns = getDatabase().prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    getDatabase().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function ensureUniqueExpressionIndex(indexName, tableName, expression, whereClause = "") {
  const predicate = whereClause ? ` WHERE ${whereClause}` : "";
  getDatabase().exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${indexName}
    ON ${tableName} (${expression})${predicate}
  `);
}

const DEFAULT_PHONE_COUNTRY = "UG";
const phoneCountryConfig = {
  UG: {
    dialCode: "256",
    localPattern: /^7\d{8}$/,
  },
  KE: {
    dialCode: "254",
    localPattern: /^(?:1|7)\d{8}$/,
  },
  TZ: {
    dialCode: "255",
    localPattern: /^[67]\d{8}$/,
  },
  NG: {
    dialCode: "234",
    localPattern: /^[7-9]\d{9}$/,
  },
};
const phoneDialCodes = Object.fromEntries(
  Object.entries(phoneCountryConfig).map(([country, settings]) => [country, settings.dialCode])
);

function parsePhoneDigits(phone) {
  return String(phone || "")
    .replace(/\D/g, "")
    .replace(/^00/, "");
}

function normalizeSubscriberDigits(digits, country) {
  const config = phoneCountryConfig[country];
  if (!config || !digits) {
    return "";
  }

  let subscriber = String(digits).replace(/\D/g, "");
  if (subscriber.startsWith(config.dialCode)) {
    subscriber = subscriber.slice(config.dialCode.length);
  }

  subscriber = subscriber.replace(/^0+/, "");
  if (!subscriber) {
    return "";
  }

  return config.localPattern.test(subscriber) ? subscriber : "";
}

function buildPhoneLookupCandidates(phone, country = null) {
  const digits = parsePhoneDigits(phone);
  if (!digits) {
    return [];
  }

  const candidates = [];
  const pushCandidate = (value) => {
    if (value && !candidates.includes(value)) {
      candidates.push(value);
    }
  };

  const preferredCountry = phoneCountryConfig[country] ? country : null;
  const explicitCountry = Object.keys(phoneCountryConfig).find((key) => digits.startsWith(phoneCountryConfig[key].dialCode));
  const tryCountry = (code) => {
    const subscriber = normalizeSubscriberDigits(digits, code);
    if (subscriber) {
      pushCandidate(`+${phoneCountryConfig[code].dialCode}${subscriber}`);
    }
  };

  if (preferredCountry) {
    tryCountry(preferredCountry);
  }

  if (explicitCountry) {
    tryCountry(explicitCountry);
  }

  if (!preferredCountry && !explicitCountry) {
    tryCountry(DEFAULT_PHONE_COUNTRY);
  }

  if (!candidates.length) {
    if (preferredCountry) {
      const fallbackSubscriber = digits.replace(/^0+/, "");
      if (fallbackSubscriber) {
        pushCandidate(`+${phoneCountryConfig[preferredCountry].dialCode}${fallbackSubscriber}`);
      }
    } else if (explicitCountry) {
      pushCandidate(`+${digits}`);
    } else {
      pushCandidate(`+${digits.replace(/^0+/, "") || digits}`);
    }
  }

  return candidates;
}

function canonicalizePhone(phone, country = null) {
  return buildPhoneLookupCandidates(phone, country)[0] || "";
}

function getLastNineDigits(phone) {
  const digits = parsePhoneDigits(phone);
  return digits.length >= 9 ? digits.slice(-9) : "";
}

function parseIsoDate(value) {
  if (!value) {
    return Number.NaN;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

function pickEarlierIso(first, second) {
  const firstTime = parseIsoDate(first);
  const secondTime = parseIsoDate(second);

  if (!Number.isFinite(firstTime)) return second || null;
  if (!Number.isFinite(secondTime)) return first || null;
  return firstTime <= secondTime ? first : second;
}

function pickLaterIso(first, second) {
  const firstTime = parseIsoDate(first);
  const secondTime = parseIsoDate(second);

  if (!Number.isFinite(firstTime)) return second || null;
  if (!Number.isFinite(secondTime)) return first || null;
  return firstTime >= secondTime ? first : second;
}

function uniqueValues(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeEmailValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function normalizeComparableValue(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return normalized || null;
}

function normalizePhoneLikeValue(value, country = null) {
  if (!value) {
    return null;
  }

  const normalized = canonicalizePhone(value, country);
  return normalized || null;
}

function normalizeDocumentTokens(documents = []) {
  const tokens = [];
  const pushToken = (value) => {
    const normalized = normalizeComparableValue(value);
    if (normalized) {
      tokens.push(normalized);
    }
  };

  for (const document of Array.isArray(documents) ? documents : []) {
    if (!document) {
      continue;
    }

    if (typeof document === "string" || typeof document === "number") {
      pushToken(document);
      continue;
    }

    if (typeof document === "object") {
      const tokenCountBeforeDocument = tokens.length;
      [
        document.id,
        document.fileId,
        document.name,
        document.fileName,
        document.filename,
        document.path,
        document.url,
        document.number,
        document.documentNumber,
        document.reference,
      ].forEach(pushToken);

      if (tokens.length === tokenCountBeforeDocument) {
        pushToken(JSON.stringify(document));
      }
    }
  }

  return tokens;
}

function createDuplicateResourceError(field, message) {
  const error = new Error(message);
  error.code = "DUPLICATE_RESOURCE";
  error.field = field;
  error.statusCode = 409;
  return error;
}

function assertUniqueArrayItems(items, field, message) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (new Set(values).size !== values.length) {
    throw createDuplicateResourceError(field, message);
  }
}

function assertUniqueProjectResources({
  userId = null,
  adminId = null,
  phone = null,
  phoneCountry = null,
  email = null,
  idNumber = null,
  businessRegistration = null,
  primaryWallet = null,
  wallets = [],
  bankAccount = null,
  documents = [],
} = {}) {
  const normalizedPhone = normalizePhoneLikeValue(phone, phoneCountry);
  const normalizedEmail = normalizeEmailValue(email);
  const normalizedIdNumber = normalizeComparableValue(idNumber);
  const normalizedBusinessRegistration = normalizeComparableValue(businessRegistration);
  const normalizedWallet = normalizePhoneLikeValue(primaryWallet, phoneCountry);
  const normalizedWallets = (Array.isArray(wallets) ? wallets : [])
    .map((wallet) => normalizePhoneLikeValue(wallet, phoneCountry))
    .filter(Boolean);
  const normalizedBankAccount = normalizeComparableValue(bankAccount);
  const normalizedDocuments = normalizeDocumentTokens(documents);
  const uniqueDocumentTokens = uniqueValues(normalizedDocuments);

  assertUniqueArrayItems(
    normalizedWallets,
    "wallets",
    "Duplicate wallet phone numbers were supplied in this request."
  );

  assertUniqueArrayItems(
    normalizedDocuments,
    "documents",
    "Duplicate documents were supplied in this request."
  );

  const authUsers = getDatabase()
    .prepare(`
      SELECT id, phone, email, profile_json
      FROM auth_users
    `)
    .all()
    .map(normalizeAuthUserRow);

  for (const user of authUsers) {
    if (userId && user.id === userId) {
      continue;
    }

    const profile = buildAuthUserProfile(user);
    const usedPhones = uniqueValues([
      normalizePhoneLikeValue(user.phone),
      normalizePhoneLikeValue(profile.primaryWallet),
      ...((Array.isArray(profile.wallets) ? profile.wallets : []).map((wallet) => normalizePhoneLikeValue(wallet))),
    ]);

    if (normalizedPhone && usedPhones.includes(normalizedPhone)) {
      throw createDuplicateResourceError("phone", "That phone number is already in use.");
    }

    if (normalizedWallet && usedPhones.includes(normalizedWallet)) {
      throw createDuplicateResourceError("primaryWallet", "That phone number is already in use.");
    }

    if (normalizedWallets.some((wallet) => usedPhones.includes(wallet))) {
      throw createDuplicateResourceError("wallets", "One or more wallet phone numbers are already in use.");
    }

    if (normalizedEmail && normalizeEmailValue(user.email) === normalizedEmail) {
      throw createDuplicateResourceError("email", "That email address is already in use.");
    }

    if (normalizedIdNumber && normalizeComparableValue(profile.idNumber) === normalizedIdNumber) {
      throw createDuplicateResourceError("idNumber", "That ID document number is already linked to another account.");
    }

    if (
      normalizedBusinessRegistration &&
      normalizeComparableValue(profile.businessRegistration) === normalizedBusinessRegistration
    ) {
      throw createDuplicateResourceError(
        "businessRegistration",
        "That business registration is already linked to another account."
      );
    }

    if (normalizedBankAccount && normalizeComparableValue(profile.bankAccount) === normalizedBankAccount) {
      throw createDuplicateResourceError("bankAccount", "That bank account is already linked to another account.");
    }

    const existingKycDocuments = uniqueValues(normalizeDocumentTokens(profile.kycDocuments || []));
    if (uniqueDocumentTokens.some((document) => existingKycDocuments.includes(document))) {
      throw createDuplicateResourceError("documents", "One or more documents are already linked to another account.");
    }
  }

  const adminAccounts = getDatabase()
    .prepare(`
      SELECT id, email
      FROM admin_accounts
    `)
    .all();

  for (const admin of adminAccounts) {
    if (adminId && admin.id === adminId) {
      continue;
    }

    if (normalizedEmail && normalizeEmailValue(admin.email) === normalizedEmail) {
      throw createDuplicateResourceError("email", "That email address is already in use.");
    }
  }

  const applications = getDatabase()
    .prepare(`
      SELECT id, user_id, phone, email, id_number, business_registration, documents_json
      FROM loan_applications
    `)
    .all()
    .map(normalizeLoanApplicationRow);

  for (const application of applications) {
    if (userId && application.user_id === userId) {
      continue;
    }

    if (normalizedPhone && normalizePhoneLikeValue(application.phone) === normalizedPhone) {
      throw createDuplicateResourceError("phone", "That phone number is already in use.");
    }

    if (normalizedWallet && normalizePhoneLikeValue(application.phone) === normalizedWallet) {
      throw createDuplicateResourceError("primaryWallet", "That phone number is already in use.");
    }

    if (normalizedWallets.some((wallet) => normalizePhoneLikeValue(application.phone) === wallet)) {
      throw createDuplicateResourceError("wallets", "One or more wallet phone numbers are already in use.");
    }

    if (normalizedEmail && normalizeEmailValue(application.email) === normalizedEmail) {
      throw createDuplicateResourceError("email", "That email address is already in use.");
    }

    if (normalizedIdNumber && normalizeComparableValue(application.id_number) === normalizedIdNumber) {
      throw createDuplicateResourceError("idNumber", "That ID document number is already linked to another account.");
    }

    if (
      normalizedBusinessRegistration &&
      normalizeComparableValue(application.business_registration) === normalizedBusinessRegistration
    ) {
      throw createDuplicateResourceError(
        "businessRegistration",
        "That business registration is already linked to another account."
      );
    }

    const existingApplicationDocuments = uniqueValues(normalizeDocumentTokens(application.documents || []));
    if (uniqueDocumentTokens.some((document) => existingApplicationDocuments.includes(document))) {
      throw createDuplicateResourceError("documents", "One or more documents are already linked to another account.");
    }
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

function mergeUserProfiles(primaryProfile, secondaryProfile) {
  const baseProfile = primaryProfile && typeof primaryProfile === "object" ? primaryProfile : {};
  const incomingProfile = secondaryProfile && typeof secondaryProfile === "object" ? secondaryProfile : {};

  return {
    ...incomingProfile,
    ...baseProfile,
    wallets: uniqueValues([
      ...(Array.isArray(incomingProfile.wallets) ? incomingProfile.wallets : []),
      ...(Array.isArray(baseProfile.wallets) ? baseProfile.wallets : []),
    ]),
    notificationPreferences: {
      ...(incomingProfile.notificationPreferences || {}),
      ...(baseProfile.notificationPreferences || {}),
    },
    security: {
      ...(incomingProfile.security || {}),
      ...(baseProfile.security || {}),
    },
  };
}

function saveAuthUserRecord(user) {
  getDatabase()
    .prepare(`
      INSERT INTO auth_users (id, phone, email, pin_hash, status, profile_json, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        phone = excluded.phone,
        email = excluded.email,
        pin_hash = excluded.pin_hash,
        status = excluded.status,
        profile_json = excluded.profile_json,
        last_login_at = excluded.last_login_at,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `)
    .run(
      user.id,
      user.phone,
      user.email || null,
      user.pinHash,
      user.status || "active",
      JSON.stringify(user.profile || {}),
      user.lastLoginAt || null,
      user.createdAt || nowIso(),
      user.updatedAt || nowIso()
    );

  return findAuthUserById(user.id);
}

function mergeUserConsents(sourceUserId, targetUserId) {
  const sourceRows = getDatabase()
    .prepare(`
      SELECT id, consent_key, consent_state, updated_at
      FROM user_consents
      WHERE user_id = ?
    `)
    .all(sourceUserId);

  for (const row of sourceRows) {
    const existing = getDatabase()
      .prepare(`
        SELECT id, updated_at
        FROM user_consents
        WHERE user_id = ? AND consent_key = ?
      `)
      .get(targetUserId, row.consent_key);

    if (!existing) {
      getDatabase()
        .prepare("UPDATE user_consents SET user_id = ? WHERE id = ?")
        .run(targetUserId, row.id);
      continue;
    }

    if ((parseIsoDate(row.updated_at) || 0) > (parseIsoDate(existing.updated_at) || 0)) {
      getDatabase()
        .prepare(`
          UPDATE user_consents
          SET consent_state = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(row.consent_state, row.updated_at, existing.id);
    }

    getDatabase()
      .prepare("DELETE FROM user_consents WHERE id = ?")
      .run(row.id);
  }
}

function reassignUserReferences(sourceUserId, targetUserId) {
  mergeUserConsents(sourceUserId, targetUserId);

  [
    ["loan_applications", "user_id"],
    ["loans", "user_id"],
    ["notifications", "user_id"],
    ["chat_messages", "user_id"],
    ["password_reset_requests", "user_id"],
    ["audit_logs", "user_id"],
    ["risk_alerts", "user_id"],
  ].forEach(([tableName, columnName]) => {
    getDatabase()
      .prepare(`UPDATE ${tableName} SET ${columnName} = ? WHERE ${columnName} = ?`)
      .run(targetUserId, sourceUserId);
  });

  getDatabase()
    .prepare(`
      UPDATE refresh_sessions
      SET subject_id = ?
      WHERE subject_type = 'borrower' AND subject_id = ?
    `)
    .run(targetUserId, sourceUserId);

  getDatabase()
    .prepare(`
      UPDATE audit_logs
      SET actor_id = ?
      WHERE actor_type = 'user' AND actor_id = ?
    `)
    .run(targetUserId, sourceUserId);
}

function syncOwnedPhoneFields(userId, phone) {
  getDatabase()
    .prepare("UPDATE loan_applications SET phone = ? WHERE user_id = ?")
    .run(phone, userId);
}

function choosePrimaryAuthUser(users) {
  return [...users].sort((left, right) => {
    const lastLoginDiff = (parseIsoDate(right.last_login_at) || 0) - (parseIsoDate(left.last_login_at) || 0);
    if (lastLoginDiff !== 0) {
      return lastLoginDiff;
    }

    const updatedDiff = (parseIsoDate(right.updated_at) || 0) - (parseIsoDate(left.updated_at) || 0);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    return (parseIsoDate(left.created_at) || 0) - (parseIsoDate(right.created_at) || 0);
  })[0];
}

function choosePreferredRecord(rows, { idField = "id", lastActivityField = "last_login_at", updatedField = "updated_at", createdField = "created_at" } = {}) {
  return [...rows].sort((left, right) => {
    const activityDiff = (parseIsoDate(right[lastActivityField]) || 0) - (parseIsoDate(left[lastActivityField]) || 0);
    if (activityDiff !== 0) {
      return activityDiff;
    }

    const updatedDiff = (parseIsoDate(right[updatedField]) || 0) - (parseIsoDate(left[updatedField]) || 0);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    const createdDiff = (parseIsoDate(left[createdField]) || 0) - (parseIsoDate(right[createdField]) || 0);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return String(left[idField] || "").localeCompare(String(right[idField] || ""));
  })[0];
}

function mergeAuthUsers(primaryUser, secondaryUser, canonicalPhone) {
  reassignUserReferences(secondaryUser.id, primaryUser.id);

  const mergedUser = saveAuthUserRecord({
    id: primaryUser.id,
    phone: canonicalPhone,
    email: primaryUser.email || secondaryUser.email || null,
    pinHash: primaryUser.pin_hash || secondaryUser.pin_hash,
    status: primaryUser.status === "active" ? primaryUser.status : secondaryUser.status || primaryUser.status,
    profile: mergeUserProfiles(primaryUser.profile, secondaryUser.profile),
    lastLoginAt: pickLaterIso(primaryUser.last_login_at, secondaryUser.last_login_at),
    createdAt: pickEarlierIso(primaryUser.created_at, secondaryUser.created_at) || primaryUser.created_at,
    updatedAt: pickLaterIso(primaryUser.updated_at, secondaryUser.updated_at) || nowIso(),
  });

  getDatabase()
    .prepare("DELETE FROM auth_users WHERE id = ?")
    .run(secondaryUser.id);

  syncOwnedPhoneFields(mergedUser.id, canonicalPhone);
  return mergedUser;
}

function normalizeActiveAuthUsers() {
  const users = getDatabase()
    .prepare(`
      SELECT id, phone, email, pin_hash, status, profile_json, last_login_at, created_at, updated_at
      FROM auth_users
      ORDER BY created_at ASC
    `)
    .all()
    .map(normalizeAuthUserRow);

  const groupedUsers = new Map();
  for (const user of users) {
    const canonicalPhone = canonicalizePhone(user.phone);
    if (!canonicalPhone) {
      continue;
    }

    if (!groupedUsers.has(canonicalPhone)) {
      groupedUsers.set(canonicalPhone, []);
    }

    groupedUsers.get(canonicalPhone).push(user);
  }

  for (const [canonicalPhone, matchingUsers] of groupedUsers.entries()) {
    if (!matchingUsers.length) {
      continue;
    }

    let primaryUser = choosePrimaryAuthUser(matchingUsers);
    for (const duplicateUser of matchingUsers) {
      if (duplicateUser.id === primaryUser.id) {
        continue;
      }

      primaryUser = mergeAuthUsers(primaryUser, duplicateUser, canonicalPhone);
    }

    if (primaryUser.phone !== canonicalPhone) {
      primaryUser = saveAuthUserRecord({
        id: primaryUser.id,
        phone: canonicalPhone,
        email: primaryUser.email || null,
        pinHash: primaryUser.pin_hash,
        status: primaryUser.status,
        profile: primaryUser.profile,
        lastLoginAt: primaryUser.last_login_at,
        createdAt: primaryUser.created_at,
        updatedAt: nowIso(),
      });
    }

    syncOwnedPhoneFields(primaryUser.id, canonicalPhone);
  }
}

function normalizeUniqueEmailAssignments() {
  const authUsers = getDatabase()
    .prepare(`
      SELECT id, phone, email, pin_hash, status, profile_json, last_login_at, created_at, updated_at
      FROM auth_users
      ORDER BY created_at ASC
    `)
    .all()
    .map(normalizeAuthUserRow);

  const authUsersByEmail = new Map();
  for (const user of authUsers) {
    const normalizedEmail = normalizeEmailValue(user.email);
    if (!normalizedEmail) {
      continue;
    }

    if (!authUsersByEmail.has(normalizedEmail)) {
      authUsersByEmail.set(normalizedEmail, []);
    }

    authUsersByEmail.get(normalizedEmail).push(user);
  }

  for (const [, matchingUsers] of authUsersByEmail.entries()) {
    if (matchingUsers.length <= 1) {
      continue;
    }

    const primaryUser = choosePrimaryAuthUser(matchingUsers);
    for (const duplicateUser of matchingUsers) {
      if (duplicateUser.id === primaryUser.id) {
        continue;
      }

      saveAuthUserRecord({
        id: duplicateUser.id,
        phone: duplicateUser.phone,
        email: null,
        pinHash: duplicateUser.pin_hash,
        status: duplicateUser.status,
        profile: duplicateUser.profile,
        lastLoginAt: duplicateUser.last_login_at,
        createdAt: duplicateUser.created_at,
        updatedAt: nowIso(),
      });
    }
  }

  const adminAccounts = getDatabase()
    .prepare(`
      SELECT id, username, full_name, email, password_hash, role, status, last_login_at, created_at, updated_at
      FROM admin_accounts
      ORDER BY created_at ASC
    `)
    .all()
    .map(normalizeAdminAccountRow);

  const adminAccountsByEmail = new Map();
  for (const account of adminAccounts) {
    const normalizedEmail = normalizeEmailValue(account.email);
    if (!normalizedEmail) {
      continue;
    }

    if (!adminAccountsByEmail.has(normalizedEmail)) {
      adminAccountsByEmail.set(normalizedEmail, []);
    }

    adminAccountsByEmail.get(normalizedEmail).push(account);
  }

  for (const [, matchingAccounts] of adminAccountsByEmail.entries()) {
    if (matchingAccounts.length <= 1) {
      continue;
    }

    const primaryAccount = choosePreferredRecord(matchingAccounts, {
      lastActivityField: "last_login_at",
      updatedField: "updated_at",
      createdField: "created_at",
    });

    for (const duplicateAccount of matchingAccounts) {
      if (duplicateAccount.id === primaryAccount.id) {
        continue;
      }

      updateAdminAccount(duplicateAccount.id, {
        email: null,
      });
    }
  }
}

function importLegacyAuthUsers() {
  const legacyDatabasePaths = getLegacyDatabasePaths();

  for (const legacyPath of legacyDatabasePaths) {
    let legacyDb;

    try {
      legacyDb = new DatabaseSync(legacyPath, { readonly: true });
      const hasAuthTable = legacyDb
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_users'")
        .get();

      if (!hasAuthTable) {
        continue;
      }

      const legacyColumns = new Set(
        legacyDb.prepare("PRAGMA table_info(auth_users)").all().map((column) => column.name)
      );
      const selectColumns = [
        "id",
        "phone",
        "email",
        "pin_hash",
        legacyColumns.has("status") ? "status" : "'active' AS status",
        legacyColumns.has("profile_json") ? "profile_json" : "'{}' AS profile_json",
        legacyColumns.has("last_login_at") ? "last_login_at" : "NULL AS last_login_at",
        legacyColumns.has("created_at") ? "created_at" : "NULL AS created_at",
        legacyColumns.has("updated_at")
          ? "updated_at"
          : (legacyColumns.has("created_at") ? "created_at AS updated_at" : "NULL AS updated_at"),
      ];
      const legacyUsers = legacyDb
        .prepare(`
          SELECT ${selectColumns.join(", ")}
          FROM auth_users
          ORDER BY created_at ASC
        `)
        .all();

      for (const row of legacyUsers) {
        const sourceUser = normalizeAuthUserRow(row);
        const canonicalPhone = canonicalizePhone(sourceUser.phone);
        if (!canonicalPhone) {
          continue;
        }

        const existingUser = findAuthUserByPhone(sourceUser.phone);
        if (!existingUser) {
          saveAuthUserRecord({
            id: sourceUser.id || crypto.randomUUID(),
            phone: canonicalPhone,
            email: sourceUser.email || null,
            pinHash: sourceUser.pin_hash,
            status: sourceUser.status || "active",
            profile: sourceUser.profile || {},
            lastLoginAt: sourceUser.last_login_at,
            createdAt: sourceUser.created_at || nowIso(),
            updatedAt: sourceUser.updated_at || sourceUser.created_at || nowIso(),
          });
          continue;
        }

        saveAuthUserRecord({
          id: existingUser.id,
          phone: canonicalPhone,
          email: existingUser.email || sourceUser.email || null,
          pinHash: existingUser.pin_hash || sourceUser.pin_hash,
          status: existingUser.status === "active" ? existingUser.status : sourceUser.status || existingUser.status,
          profile: mergeUserProfiles(existingUser.profile, sourceUser.profile),
          lastLoginAt: pickLaterIso(existingUser.last_login_at, sourceUser.last_login_at),
          createdAt: pickEarlierIso(existingUser.created_at, sourceUser.created_at) || existingUser.created_at,
          updatedAt: pickLaterIso(existingUser.updated_at, sourceUser.updated_at) || nowIso(),
        });
      }
    } catch (error) {
      console.warn(`Skipping legacy auth import from ${legacyPath}: ${error.message}`);
    } finally {
      legacyDb?.close?.();
    }
  }
}

function importLegacyAdminAccounts() {
  const legacyDatabasePaths = getLegacyDatabasePaths();

  for (const legacyPath of legacyDatabasePaths) {
    let legacyDb;

    try {
      legacyDb = new DatabaseSync(legacyPath, { readonly: true });
      const hasAdminTable = legacyDb
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'admin_accounts'")
        .get();

      if (!hasAdminTable) {
        continue;
      }

      const legacyColumns = new Set(
        legacyDb.prepare("PRAGMA table_info(admin_accounts)").all().map((column) => column.name)
      );
      const selectColumns = [
        "id",
        "username",
        legacyColumns.has("full_name") ? "full_name" : "'' AS full_name",
        "email",
        legacyColumns.has("password_hash") ? "password_hash" : "NULL AS password_hash",
        legacyColumns.has("role") ? "role" : "'loan_officer' AS role",
        legacyColumns.has("status") ? "status" : "'active' AS status",
        legacyColumns.has("last_login_at") ? "last_login_at" : "NULL AS last_login_at",
        legacyColumns.has("created_at") ? "created_at" : "NULL AS created_at",
        legacyColumns.has("updated_at")
          ? "updated_at"
          : (legacyColumns.has("created_at") ? "created_at AS updated_at" : "NULL AS updated_at"),
      ];
      const legacyAdmins = legacyDb
        .prepare(`
          SELECT ${selectColumns.join(", ")}
          FROM admin_accounts
          ORDER BY created_at ASC
        `)
        .all()
        .map(normalizeAdminAccountRow);

      for (const sourceAdmin of legacyAdmins) {
        const normalizedUsername = String(sourceAdmin?.username || "").trim();
        if (!normalizedUsername || !sourceAdmin?.password_hash) {
          continue;
        }

        const existingAdmin = findAdminAccountByUsername(normalizedUsername);
        if (!existingAdmin) {
          getDatabase()
            .prepare(`
              INSERT INTO admin_accounts (id, username, full_name, email, password_hash, role, status, last_login_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              sourceAdmin.id || crypto.randomUUID(),
              normalizedUsername,
              sourceAdmin.full_name || "",
              sourceAdmin.email || null,
              sourceAdmin.password_hash,
              sourceAdmin.role || "loan_officer",
              sourceAdmin.status || "active",
              sourceAdmin.last_login_at || null,
              sourceAdmin.created_at || nowIso(),
              sourceAdmin.updated_at || sourceAdmin.created_at || nowIso()
            );
          continue;
        }

        const mergedValues = {
          fullName: existingAdmin.full_name || sourceAdmin.full_name || "",
          email: existingAdmin.email || sourceAdmin.email || null,
          passwordHash: existingAdmin.password_hash || sourceAdmin.password_hash,
          role: existingAdmin.role || sourceAdmin.role || "loan_officer",
          status: existingAdmin.status === "active" ? existingAdmin.status : sourceAdmin.status || existingAdmin.status,
          lastLoginAt: pickLaterIso(existingAdmin.last_login_at, sourceAdmin.last_login_at),
          createdAt: pickEarlierIso(existingAdmin.created_at, sourceAdmin.created_at) || existingAdmin.created_at,
          updatedAt: pickLaterIso(existingAdmin.updated_at, sourceAdmin.updated_at) || nowIso(),
        };

        getDatabase()
          .prepare(`
            UPDATE admin_accounts
            SET full_name = ?, email = ?, password_hash = ?, role = ?, status = ?, last_login_at = ?, created_at = ?, updated_at = ?
            WHERE id = ?
          `)
          .run(
            mergedValues.fullName,
            mergedValues.email,
            mergedValues.passwordHash,
            mergedValues.role,
            mergedValues.status,
            mergedValues.lastLoginAt,
            mergedValues.createdAt,
            mergedValues.updatedAt,
            existingAdmin.id
          );
      }
    } catch (error) {
      console.warn(`Skipping legacy admin import from ${legacyPath}: ${error.message}`);
    } finally {
      legacyDb?.close?.();
    }
  }
}

function initializeDatabase() {
  if (db) {
    return db;
  }

  bootstrapDatabaseFile();
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

  // Keep older deployments compatible as the audit log schema evolves.
  ensureColumn("audit_logs", "actor_name", "TEXT");
  ensureColumn("audit_logs", "details", "TEXT");
  ensureColumn("audit_logs", "metadata_json", `TEXT NOT NULL DEFAULT '{}'`);

  importLegacyAuthUsers();
  importLegacyAdminAccounts();
  normalizeActiveAuthUsers();
  normalizeUniqueEmailAssignments();
  ensureUniqueExpressionIndex(
    "auth_users_email_unique_idx",
    "auth_users",
    "lower(trim(email))",
    "email IS NOT NULL AND trim(email) <> ''"
  );
  ensureUniqueExpressionIndex(
    "admin_accounts_email_unique_idx",
    "admin_accounts",
    "lower(trim(email))",
    "email IS NOT NULL AND trim(email) <> ''"
  );

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

function findAuthUserByPhone(phone, country = null) {
  if (!phone) {
    return null;
  }

  for (const candidate of buildPhoneLookupCandidates(phone, country)) {
    const row =
      getDatabase()
        .prepare(`
          SELECT id, phone, email, pin_hash, status, profile_json, last_login_at, created_at, updated_at
          FROM auth_users
          WHERE phone = ?
        `)
        .get(candidate) || null;

    if (row) {
      return normalizeAuthUserRow(row);
    }
  }

  const last9 = getLastNineDigits(phone);
  if (last9) {
    const rows = getDatabase()
      .prepare(`
        SELECT id, phone, email, pin_hash, status, profile_json, last_login_at, created_at, updated_at
        FROM auth_users
        WHERE substr(replace(phone, '+', ''), -9) = ?
        ORDER BY COALESCE(last_login_at, updated_at, created_at) DESC, created_at ASC
      `)
      .all(last9);

    if (rows.length > 0) {
      return normalizeAuthUserRow(rows[0]);
    }
  }

  return null;
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

function upsertAuthUser({ phone, email = null, pinHash, country = null, allowExisting = true, profileUpdates = null }) {
  const normalizedPhone = canonicalizePhone(phone, country);
  if (!normalizedPhone) {
    throw new Error("Phone is required.");
  }

  if (!pinHash) {
    throw new Error("PIN hash is required.");
  }

  const existingUser = findAuthUserByPhone(phone, country);
  if (existingUser && !allowExisting) {
    const error = new Error("That phone number is already registered.");
    error.code = "AUTH_USER_EXISTS";
    throw error;
  }

  assertUniqueProjectResources({
    userId: existingUser?.id || null,
    phone: normalizedPhone,
    phoneCountry: country,
    email,
  });

  const timestamp = nowIso();
  const userId = existingUser?.id || crypto.randomUUID();
  const normalizedEmail =
    typeof email === "undefined"
      ? existingUser?.email || null
      : email
        ? String(email).trim()
        : null;
  const mergedProfile = {
    ...(existingUser?.profile || {}),
    ...((profileUpdates && typeof profileUpdates === "object") ? profileUpdates : {}),
  };
  const profilePayload = JSON.stringify(mergedProfile);

  if (!allowExisting) {
    getDatabase()
      .prepare(`
        INSERT INTO auth_users (id, phone, email, pin_hash, status, profile_json, last_login_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  } else {
    saveAuthUserRecord({
      id: userId,
      phone: normalizedPhone,
      email: normalizedEmail,
      pinHash,
      status: existingUser?.status || "active",
      profile: mergedProfile,
      lastLoginAt: existingUser?.last_login_at || null,
      createdAt: existingUser?.created_at || timestamp,
      updatedAt: timestamp,
    });
  }

  return findAuthUserById(userId);
}

function touchAuthUserLogin(phone, country = null) {
  const existingUser = findAuthUserByPhone(phone, country);
  if (!existingUser) {
    return null;
  }

  const timestamp = nowIso();

  getDatabase()
    .prepare(`
      UPDATE auth_users
      SET last_login_at = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(timestamp, timestamp, existingUser.id);

  return findAuthUserById(existingUser.id);
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

  assertUniqueProjectResources({
    userId: existingUser.id,
    idNumber: mergedProfile.idNumber,
    businessRegistration: mergedProfile.businessRegistration,
    primaryWallet: mergedProfile.primaryWallet,
    wallets: mergedProfile.wallets,
    bankAccount: mergedProfile.bankAccount,
    documents: mergedProfile.kycDocuments,
  });

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

function generateShortAdminId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
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

  assertUniqueProjectResources({
    email,
  });

  const timestamp = nowIso();
  const adminId = generateShortAdminId();

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

  assertUniqueProjectResources({
    adminId: existingAccount.id,
    email: nextValues.email,
  });

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
  const normalizedPhone = canonicalizePhone(input.phone);
  const documents = Array.isArray(input.documents) ? input.documents.filter(Boolean) : [];

  assertUniqueProjectResources({
    userId: input.userId,
    phone: normalizedPhone,
    email: input.email,
    idNumber: input.idNumber,
    businessRegistration: input.businessRegistration,
    documents,
  });

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
      normalizedPhone || input.phone,
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
  canonicalizePhone,
  assertUniqueProjectResources,
};
