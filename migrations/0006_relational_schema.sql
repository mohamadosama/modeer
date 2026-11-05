-- Migration 0006_relational_schema.sql
-- Normalized Relational Schema for Modeer Multi-Tenant Accounting Engine

-- 1. Accounts (Chart of Accounts)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  classification TEXT NOT NULL, -- Asset, Liability, Equity, Revenue, Expense
  sub TEXT,
  parent_code TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(company_id, code);

-- 2. Vouchers (Journal Entry Headers)
CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  voucher_no TEXT NOT NULL,
  voucher_date TEXT NOT NULL,
  period TEXT,
  description TEXT,
  created_by TEXT,
  status TEXT DEFAULT 'posted',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, voucher_no)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_company ON vouchers(company_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(company_id, voucher_date);

-- 3. Voucher Lines (Granular Double-Entry Rows)
CREATE TABLE IF NOT EXISTS voucher_lines (
  id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  account_code TEXT NOT NULL,
  gl_name TEXT,
  sub_ledger TEXT,
  party TEXT,
  branch TEXT,
  currency TEXT DEFAULT 'USD',
  exchange_rate REAL DEFAULT 1.0,
  original_debit REAL DEFAULT 0.0,
  original_credit REAL DEFAULT 0.0,
  base_debit REAL DEFAULT 0.0,
  base_credit REAL DEFAULT 0.0,
  notes TEXT,
  statement_type TEXT, -- BS (Balance Sheet) or IS (Income Statement)
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_acc ON voucher_lines(company_id, account_code);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_company ON voucher_lines(company_id);

-- 4. Fixed Assets
CREATE TABLE IF NOT EXISTS fixed_assets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  purchase_date TEXT,
  service_date TEXT,
  cost REAL DEFAULT 0.0,
  currency TEXT DEFAULT 'USD',
  useful_life_months INTEGER DEFAULT 36,
  depreciation_method TEXT DEFAULT 'SL',
  salvage_value REAL DEFAULT 0.0,
  accumulated_depr REAL DEFAULT 0.0,
  branch TEXT,
  supplier TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_company ON fixed_assets(company_id);

-- 5. Contacts (Parties: Customers & Vendors)
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);

-- 6. Currencies
CREATE TABLE IF NOT EXISTS currencies (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rate REAL NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_currencies_company ON currencies(company_id);

