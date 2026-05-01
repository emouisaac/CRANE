-- SwiftLend Complete Database Schema
-- Quick Loan Application - Full Database Design
-- PostgreSQL Compatible

-- ============================================
-- EXTENSIONS & TYPES
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom types for the application
CREATE TYPE loan_status AS ENUM ('pending', 'approved', 'disbursed', 'repaid', 'defaulted', 'written_off');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');
CREATE TYPE kyc_status AS ENUM ('pending', 'documents_uploaded', 'ocr_complete', 'manual_review', 'verified', 'rejected');
CREATE TYPE user_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE fraud_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

-- Core users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_country CHAR(2) NOT NULL DEFAULT 'UG',
    phone_e164 VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(160),
    date_of_birth DATE,
    gender VARCHAR(40),
    pin_hash TEXT,
    password_hash TEXT,
    biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    device_binding_required BOOLEAN NOT NULL DEFAULT TRUE,
    kyc_status kyc_status NOT NULL DEFAULT 'pending',
    kyc_level INTEGER NOT NULL DEFAULT 0,
    credit_score INTEGER NOT NULL DEFAULT 0,
    loyalty_tier user_tier NOT NULL DEFAULT 'bronze',
    referral_code VARCHAR(20) UNIQUE NOT NULL,
    referred_by UUID REFERENCES users(id),
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User profiles
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    address_line TEXT,
    district VARCHAR(100),
    employment_status VARCHAR(50),
    employer_name VARCHAR(200),
    monthly_income DECIMAL(15,2),
    income_source VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User devices
CREATE TABLE user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint_hash TEXT NOT NULL,
    platform VARCHAR(30) NOT NULL,
    app_version VARCHAR(30),
    trusted BOOLEAN NOT NULL DEFAULT FALSE,
    risk_flags JSONB NOT NULL DEFAULT '[]'::JSONB,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OTP challenges
CREATE TABLE otp_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    phone_e164 VARCHAR(20) NOT NULL,
    purpose VARCHAR(40) NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    delivered_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User sessions
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    device_info JSONB,
    ip_address VARCHAR(45),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KYC documents
CREATE TABLE kyc_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(50),
    document_number VARCHAR(50),
    front_image TEXT,
    back_image TEXT,
    selfie_image TEXT,
    liveness_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ocr_data JSONB,
    verification_status kyc_status NOT NULL DEFAULT 'pending',
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    expiry_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- LOANS & CREDIT
-- ============================================

-- Loans table
CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    loan_number VARCHAR(20) UNIQUE NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    interest_type VARCHAR(20) DEFAULT 'flat',
    term_months INTEGER NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    amount_disbursed DECIMAL(15,2) DEFAULT 0,
    remaining_balance DECIMAL(15,2) DEFAULT 0,
    status loan_status NOT NULL DEFAULT 'pending',
    purpose VARCHAR(100),
    disbursement_method VARCHAR(50),
    disbursement_reference VARCHAR(100),
    ai_score INTEGER,
    ai_recommendation VARCHAR(20),
    risk_level risk_level,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    disbursed_at TIMESTAMPTZ,
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Loan installments
CREATE TABLE loan_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL,
    interest_amount DECIMAL(15,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    paid_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_reference VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Loan calculations
CREATE TABLE loan_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
    calculation_type VARCHAR(50),
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID
);

-- Credit score history
CREATE TABLE credit_score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    score_change INTEGER,
    factors JSONB,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Loan applications
CREATE TABLE loan_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    requested_amount DECIMAL(15,2) NOT NULL,
    requested_term INTEGER NOT NULL,
    purpose VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending',
    ai_score INTEGER,
    ai_recommendation VARCHAR(20),
    review_notes TEXT,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PAYMENTS & REPAYMENTS
-- ============================================

-- Payments table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
    installment_id UUID REFERENCES loan_installments(id),
    amount DECIMAL(15,2) NOT NULL,
    payment_type VARCHAR(30) DEFAULT 'installment',
    payment_method VARCHAR(50),
    mobile_money_number VARCHAR(20),
    transaction_reference VARCHAR(100) UNIQUE,
    status payment_status DEFAULT 'pending',
    channel_response JSONB,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment transactions
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(id),
    gateway VARCHAR(50),
    gateway_transaction_id VARCHAR(100),
    request_data JSONB,
    response_data JSONB,
    status VARCHAR(30) DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-debit setup
CREATE TABLE auto_debit_setup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
    payment_day INTEGER NOT NULL,
    amount DECIMAL(15,2),
    payment_method VARCHAR(50),
    mobile_money_number VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    discount_percentage DECIMAL(5,2) DEFAULT 5,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- REFERRALS & AFFILIATES
-- ============================================

-- Referrals
CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referee_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referral_code_used VARCHAR(20),
    status VARCHAR(30) DEFAULT 'pending',
    reward_amount DECIMAL(15,2) DEFAULT 0,
    reward_paid BOOLEAN DEFAULT FALSE,
    reward_paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Affiliate earnings
CREATE TABLE affiliate_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referral_id UUID REFERENCES referrals(id),
    level INTEGER NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    withdrawal_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Affiliate withdrawals
CREATE TABLE affiliate_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    withdrawal_method VARCHAR(50),
    mobile_money_number VARCHAR(20),
    bank_account JSONB,
    status VARCHAR(30) DEFAULT 'pending',
    processed_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- RISK & FRAUD
-- ============================================

-- Device tracking
CREATE TABLE device_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_fingerprint_hash TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id),
    device_info JSONB,
    ip_addresses JSONB,
    is_blocked BOOLEAN DEFAULT FALSE,
    block_reason TEXT,
    blocked_by UUID,
    blocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IP tracking
CREATE TABLE ip_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address VARCHAR(45) NOT NULL,
    user_id UUID REFERENCES users(id),
    user_agents JSONB,
    request_count INTEGER DEFAULT 0,
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fraud alerts
CREATE TABLE fraud_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(50) NOT NULL,
    severity fraud_severity DEFAULT 'medium',
    description TEXT,
    evidence JSONB,
    affected_users UUID[],
    status VARCHAR(30) DEFAULT 'open',
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Blacklist
CREATE TABLE blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(100) NOT NULL,
    details TEXT,
    is_permanent BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    added_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Risk scores
CREATE TABLE risk_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    risk_level risk_level,
    factors JSONB,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS
-- ============================================

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    channel VARCHAR(20) DEFAULT 'in_app',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    payment_reminders BOOLEAN DEFAULT TRUE,
    loan_updates BOOLEAN DEFAULT TRUE,
    score_updates BOOLEAN DEFAULT TRUE,
    marketing BOOLEAN DEFAULT FALSE,
    sms_enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ADMIN & AUDIT
-- ============================================

-- Admin users
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) DEFAULT 'analyst',
    permissions JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_type VARCHAR(20),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scoring configuration
CREATE TABLE scoring_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    param_name VARCHAR(50) NOT NULL,
    param_value DECIMAL(10,2) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Commission configuration
CREATE TABLE commission_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level INTEGER NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_users_phone ON users(phone_e164);
CREATE INDEX idx_users_kyc ON users(kyc_status);
CREATE INDEX idx_users_score ON users(credit_score);
CREATE INDEX idx_users_referral ON users(referral_code);

CREATE INDEX idx_loans_user ON loans(user_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loans_due ON loans(due_date);
CREATE INDEX idx_loans_number ON loans(loan_number);

CREATE INDEX idx_payments_loan ON payments(loan_id);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_ref ON payments(transaction_reference);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

CREATE INDEX idx_fraud_status ON fraud_alerts(status);
CREATE INDEX idx_fraud_severity ON fraud_alerts(severity);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update credit score on loan status change
CREATE OR REPLACE FUNCTION fn_update_credit_score()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'disbursed' AND OLD.status != 'disbursed' THEN
        UPDATE users 
        SET credit_score = LEAST(credit_score + 10, 850),
            updated_at = NOW()
        WHERE id = NEW.user_id;
    ELSIF NEW.status = 'defaulted' AND OLD.status != 'defaulted' THEN
        UPDATE users 
        SET credit_score = GREATEST(credit_score - 50, 300),
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_loan_status_change
    AFTER UPDATE ON loans
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_credit_score();

-- Update loan balance after payment
CREATE OR REPLACE FUNCTION fn_update_loan_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE loans 
        SET remaining_balance = remaining_balance - NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.loan_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_complete
    AFTER UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_loan_balance();

-- ============================================
-- VIEWS
-- ============================================

-- Active loans view
CREATE OR REPLACE VIEW v_active_loans AS
SELECT 
    l.id,
    l.loan_number,
    u.phone_e164,
    u.referral_code,
    l.principal_amount,
    l.interest_rate,
    l.term_months,
    l.remaining_balance,
    l.status,
    l.due_date,
    l.ai_score,
    l.ai_recommendation,
    l.created_at
FROM loans l
JOIN users u ON l.user_id = u.id
WHERE l.status IN ('approved', 'disbursed');

-- Overdue loans view
CREATE OR REPLACE VIEW v_overdue_loans AS
SELECT 
    l.id,
    l.loan_number,
    u.phone_e164,
    l.remaining_balance,
    l.due_date,
    EXTRACT(DAYS FROM CURRENT_DATE - l.due_date) as days_overdue
FROM loans l
JOIN users u ON l.user_id = u.id
WHERE l.status = 'disbursed' 
AND l.due_date < CURRENT_DATE;

-- User summary view
CREATE OR REPLACE VIEW v_user_summary AS
SELECT 
    u.id,
    u.phone_e164,
    u.email,
    u.kyc_status,
    u.credit_score,
    u.loyalty_tier,
    COUNT(l.id) as total_loans,
    COALESCE(SUM(l.principal_amount), 0) as total_borrowed,
    COALESCE(SUM(l.remaining_balance), 0) as total_outstanding
FROM users u
LEFT JOIN loans l ON u.id = l.user_id
GROUP BY u.id, u.phone_e164, u.email, u.kyc_status, u.credit_score, u.loyalty_tier;

-- Revenue summary view
CREATE OR REPLACE VIEW v_revenue_summary AS
SELECT 
    DATE_TRUNC('month', p.created_at) as month,
    SUM(CASE WHEN pc.calculation_type = 'interest' THEN pc.amount ELSE 0 END) as interest_revenue,
    SUM(CASE WHEN pc.calculation_type = 'fee' THEN pc.amount ELSE 0 END) as fee_revenue,
    SUM(CASE WHEN pc.calculation_type = 'penalty' THEN pc.amount ELSE 0 END) as penalty_revenue
FROM payments p
JOIN loan_calculations pc ON p.loan_id = pc.loan_id
WHERE p.status = 'completed'
GROUP BY DATE_TRUNC('month', p.created_at);

-- ============================================
-- SEED DATA
-- ============================================

-- Insert default scoring configuration
INSERT INTO scoring_config (param_name, param_value, description) VALUES
    ('payment_history_weight', 35, 'Weight for payment history factor'),
    ('credit_utilization_weight', 25, 'Weight for credit utilization factor'),
    ('account_age_weight', 15, 'Weight for account age factor'),
    ('credit_mix_weight', 10, 'Weight for credit mix factor'),
    ('new_credit_weight', 15, 'Weight for new credit factor'),
    ('min_approve_score', 550, 'Minimum score for auto-approval'),
    ('max_auto_approve_score', 750, 'Maximum score for auto-approval'),
    ('review_threshold', 650, 'Score threshold for manual review');

-- Insert default commission configuration
INSERT INTO commission_config (level, amount, description) VALUES
    (1, 50000, 'Direct referral bonus'),
    (2, 25000, 'Second tier referral bonus'),
    (3, 15000, 'Third tier referral bonus'),
    (4, 10000, 'Fourth tier referral bonus'),
    (5, 5000, 'Fifth tier referral bonus');

-- Insert default admin user (password: admin123)
INSERT INTO admin_users (username, email, password_hash, role, permissions) VALUES
    ('admin', 'admin@swiftlend.ug', crypt('admin123', gen_salt('bf')), 'admin', 
     '{"users": ["read", "write", "delete"], "loans": ["read", "write", "approve"], "reports": ["read"]}'),
    ('manager', 'manager@swiftlend.ug', crypt('manager123', gen_salt('bf')), 'manager',
     '{"users": ["read", "write"], "loans": ["read", "write", "approve"], "reports": ["read"]}'),
    ('analyst', 'analyst@swiftlend.ug', crypt('analyst123', gen_salt('bf')), 'analyst',
     '{"users": ["read"], "loans": ["read"], "reports": ["read"]}');