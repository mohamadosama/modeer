-- Modeer Cloudflare D1 Database Schema
-- Migration 0004_sessions.sql

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
