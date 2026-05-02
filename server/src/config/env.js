require("dotenv").config();

const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || "replace-in-production",
  jwtExpiry: process.env.JWT_EXPIRY || "15m",
  refreshExpiryDays: Number(process.env.REFRESH_EXPIRY_DAYS || 30),

  // Admin credentials
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "CraneMaster2024!",
};

module.exports = { config };
