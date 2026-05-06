-- Admin Roles and Chat System Migration
-- This migration adds role-based admin system and chat functionality

-- ============================================
-- UPDATE ADMIN USERS TABLE
-- ============================================

-- Add role column if it doesn't exist and ensure proper values
-- Roles: 'master_admin' (only approve loans), 'admin' (review applicants)
ALTER TABLE admin_users DROP COLUMN IF EXISTS role CASCADE;
ALTER TABLE admin_users ADD COLUMN role VARCHAR(30) DEFAULT 'admin' NOT NULL;

-- ============================================
-- ADMIN CHAT MESSAGES
-- ============================================

CREATE TABLE IF NOT EXISTS admin_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE SET NULL,
    message_text TEXT NOT NULL,
    message_type VARCHAR(30) DEFAULT 'text', -- 'text', 'password_reset_link', 'status_update'
    is_from_admin BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_messages_user_id ON admin_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_admin_id ON admin_messages(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created_at ON admin_messages(created_at DESC);

-- ============================================
-- LOAN REVIEW & APPROVAL WORKFLOW
-- ============================================

CREATE TABLE IF NOT EXISTS loan_review_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    initial_status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'under_review', 'rejected'
    admin_reviewer_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    admin_notes TEXT,
    review_start_at TIMESTAMPTZ,
    review_end_at TIMESTAMPTZ,
    
    -- Rejection workflow
    rejection_reason TEXT,
    master_admin_approval_requested BOOLEAN DEFAULT FALSE,
    requested_at TIMESTAMPTZ,
    master_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    master_admin_decision VARCHAR(30), -- 'pending', 'approved', 'rejected'
    master_admin_notes TEXT,
    decided_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_review_requests_loan_id ON loan_review_requests(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_review_requests_user_id ON loan_review_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_loan_review_requests_admin_reviewer ON loan_review_requests(admin_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_loan_review_requests_master_admin ON loan_review_requests(master_admin_id);

-- ============================================
-- USER PASSWORD RESET TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE SET NULL,
    reset_token TEXT NOT NULL UNIQUE,
    token_expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    reset_completed_at TIMESTAMPTZ,
    reason TEXT, -- 'user_request', 'admin_initiated'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_reset_token ON password_reset_requests(reset_token);
