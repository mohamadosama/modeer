-- Migration 0008_idempotency_keys.sql
-- Implements Idempotency-Key support for enterprise write resilience
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_idempotency_company ON idempotency_keys(company_id, key);

