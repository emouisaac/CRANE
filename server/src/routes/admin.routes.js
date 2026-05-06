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

// Master admin only middleware
const requireMasterAdmin = (req, res, next) => {
  if (req.admin.role !== 'master_admin') {
    return res.status(403).json({
      error: "Master admin access required",
      code: "MASTER_ADMIN_ONLY",
    });
  }
  next();
};

// Regular admin middleware (excludes master admin from certain routes)
const requireRegularAdmin = (req, res, next) => {
  if (req.admin.role !== 'admin') {
    return res.status(403).json({
      error: "Regular admin access required",
      code: "REGULAR_ADMIN_ONLY",
    });
  }
  next();
};

router.post("/login", async (req, res) => {
  try {
    const { password, deviceId, role } = req.body;

    if (!password || !deviceId) {
      return res.status(400).json({
        error: "Password and device ID are required",
        code: "MISSING_FIELDS",
      });
    }

    // Check if password matches (for now, use env password for both roles)
    if (password !== config.adminPassword) {
      return res.status(401).json({
        error: "Invalid admin credentials",
        code: "INVALID_CREDENTIALS",
      });
    }

    // Determine role - default to 'admin' if not specified
    // In production, this should verify against admin_users table
    const adminRole = role === 'master_admin' ? 'master_admin' : 'admin';

    const accessToken = jwt.sign(
      {
        sub: "admin",
        deviceId,
        scope: ["admin"],
        role: adminRole
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiry }
    );

    return res.json({
      accessToken,
      refreshToken: "admin_refresh_demo",
      role: adminRole,
      permissions: adminRole === 'master_admin' 
        ? ["read_users", "write_users", "read_loans", "approve_loans", "read_admins", "write_admins"]
        : ["read_users", "read_loans", "review_applications", "reject_loans", "chat_users"],
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

// ============================================
// ADMIN CHAT & MESSAGING
// ============================================

// Send message to customer
router.post("/messages/send", authenticateAdmin, async (req, res) => {
  try {
    const { userId, messageText, messageType } = req.body;

    if (!userId || !messageText) {
      return res.status(400).json({
        error: "User ID and message text required",
        code: "MISSING_FIELDS",
      });
    }

    const messageId = generateUUID();
    
    await query(
      `INSERT INTO admin_messages (id, user_id, admin_id, message_text, message_type, is_from_admin)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [messageId, userId, req.admin.sub, messageText, messageType || 'text']
    );

    res.status(201).json({
      id: messageId,
      sent: true,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      error: "Failed to send message",
      code: "INTERNAL_ERROR",
    });
  }
});

// Get chat messages with customer
router.get("/messages/:userId", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const messagesResult = await query(
      `SELECT id, user_id, admin_id, message_text, message_type, is_from_admin, read_at, created_at
       FROM admin_messages
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    res.json({
      messages: messagesResult.rows || [],
      total: messagesResult.rows.length,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      error: "Failed to fetch messages",
      code: "INTERNAL_ERROR",
    });
  }
});

// Mark message as read
router.patch("/messages/:messageId/read", authenticateAdmin, async (req, res) => {
  try {
    const { messageId } = req.params;

    await query(
      `UPDATE admin_messages SET read_at = datetime("now") WHERE id = ?`,
      [messageId]
    );

    res.json({
      updated: true,
      message: "Message marked as read",
    });
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({
      error: "Failed to update message",
      code: "INTERNAL_ERROR",
    });
  }
});

// ============================================
// LOAN REVIEW & APPROVAL WORKFLOW
// ============================================

// Admin: Review new applicant loan (regular admin only)
router.post("/loans/:loanId/review", authenticateAdmin, requireRegularAdmin, async (req, res) => {
  try {
    const { loanId } = req.params;
    const { notes } = req.body;

    // Check if loan exists
    const loanResult = await query(
      `SELECT id, user_id, status FROM loans WHERE id = ?`,
      [loanId]
    );

    if (loanResult.rows.length === 0) {
      return res.status(404).json({
        error: "Loan not found",
        code: "LOAN_NOT_FOUND",
      });
    }

    const reviewId = generateUUID();
    const now = new Date().toISOString();

    // Create or update review request
    await query(
      `INSERT INTO loan_review_requests 
       (id, loan_id, user_id, initial_status, admin_reviewer_id, admin_notes, review_start_at, created_at, updated_at)
       VALUES (?, ?, ?, 'under_review', ?, ?, ?, ?, ?)`,
      [reviewId, loanId, loanResult.rows[0].user_id, req.admin.sub, notes || '', now, now, now]
    );

    res.status(201).json({
      reviewId,
      reviewed: true,
      message: "Loan marked for review",
      createdAt: now,
    });
  } catch (error) {
    console.error('Review loan error:', error);
    res.status(500).json({
      error: "Failed to review loan",
      code: "INTERNAL_ERROR",
    });
  }
});

// Admin: Reject loan and request master admin approval (regular admin only)
router.post("/loans/:loanId/reject", authenticateAdmin, requireRegularAdmin, async (req, res) => {
  try {
    const { loanId } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        error: "Rejection reason required",
        code: "MISSING_REJECTION_REASON",
      });
    }

    // Check if loan exists
    const loanResult = await query(
      `SELECT id, user_id FROM loans WHERE id = ?`,
      [loanId]
    );

    if (loanResult.rows.length === 0) {
      return res.status(404).json({
        error: "Loan not found",
        code: "LOAN_NOT_FOUND",
      });
    }

    const now = new Date().toISOString();
    const reviewId = generateUUID();

    // Create rejection review request for master admin approval
    await query(
      `INSERT INTO loan_review_requests 
       (id, loan_id, user_id, initial_status, admin_reviewer_id, rejection_reason, 
        master_admin_approval_requested, requested_at, created_at, updated_at)
       VALUES (?, ?, ?, 'rejected', ?, ?, 1, ?, ?, ?)`,
      [reviewId, loanId, loanResult.rows[0].user_id, req.admin.sub, rejectionReason, now, now, now]
    );

    // Send message to customer about rejection pending master admin review
    const messageId = generateUUID();
    await query(
      `INSERT INTO admin_messages 
       (id, user_id, admin_id, message_text, message_type, is_from_admin, created_at)
       VALUES (?, ?, ?, ?, 'status_update', 1, ?)`,
      [messageId, loanResult.rows[0].user_id, req.admin.sub, 
       `Your loan application has been reviewed. The decision is pending master admin approval due to: ${rejectionReason}`, now]
    );

    res.status(201).json({
      reviewId,
      rejected: true,
      message: "Loan rejection submitted for master admin approval",
      createdAt: now,
    });
  } catch (error) {
    console.error('Reject loan error:', error);
    res.status(500).json({
      error: "Failed to reject loan",
      code: "INTERNAL_ERROR",
    });
  }
});

// Master Admin: Approve loan (master admin only)
router.post("/loans/:loanId/approve", authenticateAdmin, requireMasterAdmin, async (req, res) => {
  try {
    const { loanId } = req.params;
    const { approvalNotes } = req.body;

    // Check if loan exists
    const loanResult = await query(
      `SELECT id, user_id FROM loans WHERE id = ?`,
      [loanId]
    );

    if (loanResult.rows.length === 0) {
      return res.status(404).json({
        error: "Loan not found",
        code: "LOAN_NOT_FOUND",
      });
    }

    const now = new Date().toISOString();

    // Update loan status to approved
    await query(
      `UPDATE loans SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
      [req.admin.sub, now, loanId]
    );

    // Create approval record
    await query(
      `INSERT INTO loan_review_requests 
       (id, loan_id, user_id, initial_status, master_admin_id, master_admin_decision, master_admin_notes, decided_at, created_at, updated_at)
       VALUES (?, ?, ?, 'approved', ?, 'approved', ?, ?, ?, ?)`,
      [generateUUID(), loanId, loanResult.rows[0].user_id, req.admin.sub, approvalNotes || '', now, now, now]
    );

    // Send message to customer about approval
    const messageId = generateUUID();
    await query(
      `INSERT INTO admin_messages 
       (id, user_id, admin_id, message_text, message_type, is_from_admin, created_at)
       VALUES (?, ?, ?, ?, 'status_update', 1, ?)`,
      [messageId, loanResult.rows[0].user_id, req.admin.sub, 
       'Great news! Your loan application has been approved by our master admin team.', now]
    );

    res.json({
      loanId,
      approved: true,
      message: "Loan approved successfully",
      approvedAt: now,
    });
  } catch (error) {
    console.error('Approve loan error:', error);
    res.status(500).json({
      error: "Failed to approve loan",
      code: "INTERNAL_ERROR",
    });
  }
});

// Master Admin: Reject loan after review (master admin only)
router.post("/loans/:loanId/reject-final", authenticateAdmin, requireMasterAdmin, async (req, res) => {
  try {
    const { loanId } = req.params;
    const { rejectionNotes } = req.body;

    // Check if loan exists
    const loanResult = await query(
      `SELECT id, user_id FROM loans WHERE id = ?`,
      [loanId]
    );

    if (loanResult.rows.length === 0) {
      return res.status(404).json({
        error: "Loan not found",
        code: "LOAN_NOT_FOUND",
      });
    }

    const now = new Date().toISOString();

    // Update loan status to rejected
    await query(
      `UPDATE loans SET status = 'rejected', updated_at = ? WHERE id = ?`,
      [now, loanId]
    );

    // Record final rejection
    await query(
      `INSERT INTO loan_review_requests 
       (id, loan_id, user_id, initial_status, master_admin_id, master_admin_decision, master_admin_notes, decided_at, created_at, updated_at)
       VALUES (?, ?, ?, 'rejected', ?, 'rejected', ?, ?, ?, ?)`,
      [generateUUID(), loanId, loanResult.rows[0].user_id, req.admin.sub, rejectionNotes || '', now, now, now]
    );

    // Send message to customer about final rejection
    const messageId = generateUUID();
    await query(
      `INSERT INTO admin_messages 
       (id, user_id, admin_id, message_text, message_type, is_from_admin, created_at)
       VALUES (?, ?, ?, ?, 'status_update', 1, ?)`,
      [messageId, loanResult.rows[0].user_id, req.admin.sub, 
       `Your loan application has been reviewed and unfortunately rejected. Reason: ${rejectionNotes || 'See admin for details'}`, now]
    );

    res.json({
      loanId,
      rejected: true,
      message: "Loan rejected successfully",
      rejectedAt: now,
    });
  } catch (error) {
    console.error('Final reject loan error:', error);
    res.status(500).json({
      error: "Failed to reject loan",
      code: "INTERNAL_ERROR",
    });
  }
});

// ============================================
// PASSWORD RESET
// ============================================

// Admin: Initiate password reset for user
router.post("/users/:userId/reset-password", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // Check if user exists
    const userResult = await query(
      `SELECT id, phone_e164 FROM users WHERE id = ?`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    const now = new Date().toISOString();

    // Create password reset request
    await query(
      `INSERT INTO password_reset_requests 
       (id, user_id, admin_id, reset_token, token_expires_at, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [generateUUID(), userId, req.admin.sub, resetToken, tokenExpiresAt, reason || 'admin_initiated', now]
    );

    // Send message to customer with reset instructions
    const messageId = generateUUID();
    await query(
      `INSERT INTO admin_messages 
       (id, user_id, admin_id, message_text, message_type, is_from_admin, created_at)
       VALUES (?, ?, ?, ?, 'password_reset_link', 1, ?)`,
      [messageId, userId, req.admin.sub, 
       `Your password reset has been initiated by our admin team. Use this token to reset your password: ${resetToken}`, now]
    );

    res.status(201).json({
      resetInitiated: true,
      resetToken, // Return token for testing/demo purposes
      expiresAt: tokenExpiresAt,
      message: "Password reset initiated for user",
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      error: "Failed to initiate password reset",
      code: "INTERNAL_ERROR",
    });
  }
});

// Get pending approval requests (for master admin dashboard)
router.get("/approval-requests", authenticateAdmin, requireMasterAdmin, async (req, res) => {
  try {
    const { status = 'pending', limit = 50 } = req.query;

    let statusFilter = '';
    if (status !== 'all') {
      statusFilter = ` AND master_admin_decision = '${status}'`;
    }

    const requestsResult = await query(
      `SELECT lrr.id, lrr.loan_id, lrr.user_id, lrr.rejection_reason, lrr.requested_at,
              l.principal_amount, l.status as loan_status, u.full_name, u.phone_e164
       FROM loan_review_requests lrr
       JOIN loans l ON lrr.loan_id = l.id
       JOIN users u ON lrr.user_id = u.id
       WHERE lrr.master_admin_approval_requested = 1${statusFilter}
       ORDER BY lrr.requested_at DESC
       LIMIT ?`,
      [limit]
    );

    res.json({
      approvalRequests: requestsResult.rows || [],
      total: requestsResult.rows.length,
    });
  } catch (error) {
    console.error('Get approval requests error:', error);
    res.status(500).json({
      error: "Failed to fetch approval requests",
      code: "INTERNAL_ERROR",
    });
  }
});

// Get loan review history
router.get("/loans/:loanId/review-history", authenticateAdmin, async (req, res) => {
  try {
    const { loanId } = req.params;

    const reviewsResult = await query(
      `SELECT id, initial_status, admin_notes, review_start_at, review_end_at,
              rejection_reason, master_admin_approval_requested, requested_at,
              master_admin_decision, master_admin_notes, decided_at, created_at
       FROM loan_review_requests
       WHERE loan_id = ?
       ORDER BY created_at DESC`,
      [loanId]
    );

    res.json({
      reviews: reviewsResult.rows || [],
      total: reviewsResult.rows.length,
    });
  } catch (error) {
    console.error('Get review history error:', error);
    res.status(500).json({
      error: "Failed to fetch review history",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;