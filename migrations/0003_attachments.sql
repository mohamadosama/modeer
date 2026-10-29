-- Migration 0003_attachments.sql
-- Attachments metadata and chunked Base64 storage in Cloudflare D1

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  owner TEXT NOT NULL,
  cat TEXT,
  name TEXT NOT NULL,
  type TEXT,
  size INTEGER DEFAULT 0,
  at TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attachment_chunks (
  attachment_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (attachment_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_attachments_company_owner ON attachments(company, owner);
CREATE INDEX IF NOT EXISTS idx_attachments_company ON attachments(company);
CREATE INDEX IF NOT EXISTS idx_attachment_chunks_id ON attachment_chunks(attachment_id);
