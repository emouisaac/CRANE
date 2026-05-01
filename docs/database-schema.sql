CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended', 'fraud_review');
CREATE TYPE kyc_status AS ENUM ('draft', 'documents_uploaded', 'ocr_complete', 'manual_review', 'verified', 'rejected');
CREATE TYPE session_status AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE consent_state AS ENUM ('granted', 'denied', 'revoked');
CREATE TYPE wallet_provider AS ENUM ('mtn', 'airtel');
CREATE TYPE offer_status AS ENUM ('generated', 'accepted', 'expired', 'rejected');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_country CHAR(2) NOT NULL,
  phone_e164 VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(160),
  date_of_birth DATE,
  gender VARCHAR(40),
  national_id_number VARCHAR(64),
  address_line TEXT,
  status user_status NOT NULL DEFAULT 'pending',
  pin_hash TEXT,
  password_hash TEXT,
  biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  device_binding_required BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  access_jti UUID NOT NULL DEFAULT gen_random_uuid(),
  status session_status NOT NULL DEFAULT 'active',
  ip_address INET,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kyc_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status kyc_status NOT NULL DEFAULT 'draft',
  liveness_score NUMERIC(5, 2),
  face_match_score NUMERIC(5, 2),
  document_quality_score NUMERIC(5, 2),
  ocr_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  manual_review_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_application_id UUID NOT NULL REFERENCES kyc_applications(id) ON DELETE CASCADE,
  document_type VARCHAR(30) NOT NULL,
  document_side VARCHAR(20),
  storage_key TEXT NOT NULL,
  sha256_hash TEXT NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE biometric_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_application_id UUID NOT NULL REFERENCES kyc_applications(id) ON DELETE CASCADE,
  selfie_storage_key TEXT NOT NULL,
  liveness_trace JSONB NOT NULL DEFAULT '[]'::JSONB,
  face_template_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE employment_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  employment_status VARCHAR(60),
  employer_name VARCHAR(160),
  monthly_income_ugx NUMERIC(14, 2),
  income_frequency VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mobile_money_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider wallet_provider NOT NULL,
  account_name VARCHAR(160),
  account_reference VARCHAR(80) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_name VARCHAR(120) NOT NULL,
  branch_name VARCHAR(120),
  masked_account_number VARCHAR(32) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_key VARCHAR(60) NOT NULL,
  state consent_state NOT NULL,
  legal_basis TEXT NOT NULL,
  source_channel VARCHAR(30) NOT NULL,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, consent_key)
);

CREATE TABLE score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score_value INTEGER NOT NULL CHECK (score_value BETWEEN 300 AND 850),
  eligibility VARCHAR(80) NOT NULL,
  credit_limit_ugx NUMERIC(14, 2) NOT NULL,
  monthly_interest_rate NUMERIC(6, 3) NOT NULL,
  feature_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  model_version VARCHAR(40) NOT NULL,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loan_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score_snapshot_id UUID NOT NULL REFERENCES score_snapshots(id) ON DELETE CASCADE,
  principal_ugx NUMERIC(14, 2) NOT NULL,
  tenor_days INTEGER NOT NULL,
  monthly_interest_rate NUMERIC(6, 3) NOT NULL,
  offer_status offer_status NOT NULL DEFAULT 'generated',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  actor_type VARCHAR(30) NOT NULL,
  actor_id VARCHAR(80),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80),
  request_id UUID,
  ip_address INET,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone_e164);
CREATE INDEX idx_sessions_user_status ON sessions(user_id, status);
CREATE INDEX idx_otp_phone_purpose ON otp_challenges(phone_e164, purpose);
CREATE INDEX idx_kyc_status ON kyc_applications(status);
CREATE INDEX idx_consent_user_key ON consent_records(user_id, consent_key);
CREATE INDEX idx_scores_user_scored_at ON score_snapshots(user_id, scored_at DESC);
CREATE INDEX idx_audit_user_created_at ON audit_logs(user_id, created_at DESC);
