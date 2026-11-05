-- Migration 0007_document_lifecycle_and_constraints.sql
-- Enforces Document Lifecycle (Draft -> Posted -> Cancelled -> Amended) and Audit Guardrails

-- 1. Add Lifecycle & Audit columns to vouchers table
ALTER TABLE vouchers ADD COLUMN posted_at TIMESTAMP;
ALTER TABLE vouchers ADD COLUMN posted_by TEXT;
ALTER TABLE vouchers ADD COLUMN cancelled_at TIMESTAMP;
ALTER TABLE vouchers ADD COLUMN cancelled_by TEXT;
ALTER TABLE vouchers ADD COLUMN cancelled_reason TEXT;
ALTER TABLE vouchers ADD COLUMN amended_from TEXT;
ALTER TABLE vouchers ADD COLUMN version INTEGER DEFAULT 1;

-- 2. Mark all existing historical vouchers as posted
UPDATE vouchers 
SET status = 'posted', 
    posted_at = created_at, 
    posted_by = COALESCE(created_by, 'system')
WHERE status IS NULL OR status = '' OR status = 'posted';

-- 3. Create high-performance compound indices
CREATE INDEX IF NOT EXISTS idx_vouchers_company_status ON vouchers(company_id, status);
CREATE INDEX IF NOT EXISTS idx_vouchers_amended ON vouchers(company_id, amended_from);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_comp_acc ON voucher_lines(company_id, account_code);

