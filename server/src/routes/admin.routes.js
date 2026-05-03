const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const { config } = require("../config/env");
const { query } = require("../config/database");

const router = express.Router();

// Helper function to generate UUID
function generateUUID() {
  return crypto.randomUUID();
}

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: "Admin authentication required",
      code: "ADMIN_AUTH_REQUIRED",
    });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (!decoded.scope || !decoded.scope.includes('admin')) {
      return res.status(403).json({
        error: "Admin access required",
        code: "ADMIN_ACCESS_DENIED",
      });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Invalid admin token",
      code: "INVALID_ADMIN_TOKEN",
    });
  }
};

router.post("/login", async (req, res) => {
  try {
    const { password, deviceId } = req.body;

    if (!password || !deviceId) {
      return res.status(400).json({
        error: "Password and device ID are required",
        code: "MISSING_FIELDS",
      });
    }

    if (password !== config.adminPassword) {
      return res.status(401).json({
        error: "Invalid admin credentials",
        code: "INVALID_CREDENTIALS",
      });
    }

    const accessToken = jwt.sign(
      {
        sub: "admin",
        deviceId,
        scope: ["admin"],
        role: "admin"
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiry }
    );

    return res.json({
      accessToken,
      refreshToken: "admin_refresh_demo",
      role: "admin",
      permissions: ["read_users", "write_users", "read_loans", "write_loans"],
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      error: "Failed to login as admin",
      code: "INTERNAL_ERROR",
    });
  }
});

// Get all users
router.get("/users", authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [limit, offset];
    let paramIndex = 3;

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (full_name ILIKE $${paramIndex} OR phone_e164 ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const usersResult = await query(
      `SELECT id, phone_e164, full_name, status, last_login_at, created_at
       FROM users
       WHERE 1=1${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    const totalResult = await query(
      `SELECT COUNT(*) as total FROM users WHERE 1=1${whereClause}`,
      params.slice(2)
    );

    res.json({
      users: usersResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.rows[0].total),
        pages: Math.ceil(totalResult.rows[0].total / limit),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: "Failed to fetch users",
      code: "INTERNAL_ERROR",
    });
  }
});

// Get user details
router.get("/users/:userId", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await query(
      `SELECT id, phone_e164, full_name, date_of_birth, gender, national_id_number,
              address_line, status, last_login_at, created_at, updated_at
       FROM users WHERE id = ?`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    const user = userResult.rows[0];

    // Get related data
    const [kycResult, loansResult, devicesResult] = await Promise.all([
      query('SELECT status, created_at FROM kyc_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]),
      query('SELECT COUNT(*) as loan_count FROM loan_offers WHERE user_id = ?', [userId]),
      query('SELECT COUNT(*) as device_count FROM user_devices WHERE user_id = ?', [userId]),
    ]);

    res.json({
      user,
      kyc: kycResult.rows[0] || null,
      stats: {
        loanCount: parseInt(loansResult.rows[0].loan_count),
        deviceCount: parseInt(devicesResult.rows[0].device_count),
      },
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      error: "Failed to fetch user details",
      code: "INTERNAL_ERROR",
    });
  }
});

// Update user status
router.patch("/users/:userId/status", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, reason } = req.body;

    if (!['pending', 'active', 'suspended', 'fraud_review'].includes(status)) {
      return res.status(400).json({
        error: "Invalid status",
        code: "INVALID_STATUS",
      });
    }

    await query(
      'UPDATE users SET status = ?, updated_at = datetime("now") WHERE id = ?',
      [status, userId]
    );

    // Log the action
    await query(
      `INSERT INTO audit_logs (id, user_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, "admin", ?, "status_change", "user", ?, ?)`,
      [generateUUID(), userId, req.admin.sub, userId, JSON.stringify({ newStatus: status, reason })]
    );

    res.json({
      updated: true,
      message: `User status updated to ${status}`,
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      error: "Failed to update user status",
      code: "INTERNAL_ERROR",
    });
  }
});

// Update user profile
router.put("/users/:userId/profile", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { fullName, dateOfBirth, gender, nationalIdNumber, addressLine } = req.body;

    await query(
      `UPDATE users SET
        full_name = ?,
        date_of_birth = ?,
        gender = ?,
        national_id_number = ?,
        address_line = ?,
        updated_at = datetime("now")
       WHERE id = ?`,
      [fullName, dateOfBirth, gender, nationalIdNumber, addressLine, userId]
    );

    // Log the action
    await query(
      `INSERT INTO audit_logs (id, user_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, "admin", ?, "profile_update", "user", ?, ?)`,
      [generateUUID(), userId, req.admin.sub, userId, JSON.stringify({ fields: Object.keys(req.body) })]
    );

    res.json({
      updated: true,
      message: "User profile updated successfully",
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      error: "Failed to update user profile",
      code: "INTERNAL_ERROR",
    });
  }
});

// Delete user (soft delete by setting status)
router.delete("/users/:userId", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    await query(
      'UPDATE users SET status = \'suspended\', updated_at = NOW() WHERE id = $1',
      [userId]
    );

    // Log the action
    await query(
      `INSERT INTO audit_logs (user_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'admin', $2, 'user_deletion', 'user', $1, $3)`,
      [userId, req.admin.sub, JSON.stringify({ action: 'suspended' })]
    );

    res.json({
      deleted: true,
      message: "User account suspended",
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      error: "Failed to delete user",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;