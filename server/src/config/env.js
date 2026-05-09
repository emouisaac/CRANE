const os = require("os");
const path = require("path");

require("dotenv").config();

const managedDataDirEnvKeys = [
  "DATA_DIR",
  "CRANE_DATA_DIR",
  "PERSISTENT_STORAGE_DIR",
  "RENDER_DISK_PATH",
  "RAILWAY_VOLUME_MOUNT_PATH",
];

function resolveConfiguredPath(inputPath) {
  if (!inputPath) {
    return null;
  }

  return path.resolve(process.cwd(), inputPath);
}

function getManagedDataRoot() {
  const envKey = managedDataDirEnvKeys.find((key) => process.env[key]);
  return envKey ? process.env[envKey] : null;
}

function resolveDataDirectory() {
  const configuredDataDir = getManagedDataRoot();

  if (configuredDataDir) {
    return path.resolve(process.cwd(), configuredDataDir, "crane-data");
  }

  if (process.platform === "win32") {
    const appDataDir = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appDataDir, "CraneCredit", "data");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "CraneCredit", "data");
  }

  const linuxDataDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(linuxDataDir, "crane-credit", "data");
}

const dataDir = resolveDataDirectory();
const dbPath = resolveConfiguredPath(process.env.DB_PATH) || path.join(dataDir, "database.sqlite");
const managedDataRoot = getManagedDataRoot();

const config = {
  serviceName: "Crane Credit",
  serviceSlug: "crane-credit",
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || "replace-in-production",
  jwtExpiry: process.env.JWT_EXPIRY || "15m",
  refreshExpiryDays: Number(process.env.REFRESH_EXPIRY_DAYS || 30),
  dataDir,
  dbPath,
  usingManagedDataDir: Boolean(managedDataRoot || process.env.DB_PATH),
  managedDataDirEnvKeys,

  // Admin credentials
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "CraneMaster2024!",
  masterAdminUsername: process.env.MASTER_ADMIN_USERNAME || "master_admin",
  masterAdminPassword:
    process.env.MASTER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "CraneMaster2024!",
};

module.exports = { config };
