const path = require("path");

require("dotenv").config();

function resolveConfiguredPath(inputPath) {
  if (!inputPath) {
    return null;
  }

  return path.resolve(process.cwd(), inputPath);
}

function resolveDataDirectory() {
  const configuredDataDir =
    process.env.DATA_DIR ||
    process.env.CRANE_DATA_DIR ||
    process.env.PERSISTENT_STORAGE_DIR ||
    process.env.RENDER_DISK_PATH ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH;

  if (configuredDataDir) {
    return path.resolve(process.cwd(), configuredDataDir, "crane-data");
  }

  return path.resolve(process.cwd(), "data");
}

const dataDir = resolveDataDirectory();
const dbPath = resolveConfiguredPath(process.env.DB_PATH) || path.join(dataDir, "database.sqlite");

const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || "replace-in-production",
  jwtExpiry: process.env.JWT_EXPIRY || "15m",
  refreshExpiryDays: Number(process.env.REFRESH_EXPIRY_DAYS || 30),
  dataDir,
  dbPath,
  usingManagedDataDir: Boolean(
    process.env.DATA_DIR ||
      process.env.CRANE_DATA_DIR ||
      process.env.PERSISTENT_STORAGE_DIR ||
      process.env.RENDER_DISK_PATH ||
      process.env.RAILWAY_VOLUME_MOUNT_PATH ||
      process.env.DB_PATH
  ),

  // Admin credentials
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "CraneMaster2024!",
  masterAdminUsername: process.env.MASTER_ADMIN_USERNAME || "master_admin",
  masterAdminPassword:
    process.env.MASTER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "CraneMaster2024!",
};

module.exports = { config };
