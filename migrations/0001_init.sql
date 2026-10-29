-- Modeer Cloudflare D1 Database Schema
-- Migration 0001_init.sql

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_currency TEXT DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_storage (
  company TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company, key)
);

CREATE INDEX IF NOT EXISTS idx_company_storage_company ON company_storage(company);
