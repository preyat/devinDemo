// Single source of truth for the SQLite schema. Money is stored as integer cents.
// Bump SCHEMA_VERSION whenever this changes: getDb() rebuilds + reseeds stale local DBs.
// Tables for refunds, feature_flags and risk_holds exist now so later workflows
// (Refunds, Feature Flags, Transaction Risk Review) can build on stable data.
export const SCHEMA_VERSION = 2;

// Drop order respects foreign keys.
export const TABLES = [
  "audit_events",
  "kyc_decisions",
  "verification_checks",
  "risk_holds",
  "refunds",
  "transactions",
  "feature_flags",
  "customers",
] as const;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('personal', 'business')),
  account_ref TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_ref TEXT NOT NULL,
  document_expiry TEXT NOT NULL,
  kyc_status TEXT NOT NULL CHECK (kyc_status IN ('pending', 'info_requested', 'approved', 'rejected')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_reason TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_checks (
  customer_id TEXT NOT NULL REFERENCES customers(id),
  check_type TEXT NOT NULL CHECK (check_type IN ('identity', 'address', 'sanctions', 'pep')),
  result TEXT NOT NULL CHECK (result IN ('passed', 'missing', 'failed', 'clear', 'review_required')),
  detail TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (customer_id, check_type)
);

CREATE TABLE IF NOT EXISTS kyc_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'request_info')),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL,
  decided_by_role TEXT NOT NULL,
  decided_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'pending', 'failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('pending', 'processed', 'rejected')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_holds (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'released')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  released_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied')),
  message TEXT NOT NULL,
  details_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_kyc_decisions_customer ON kyc_decisions (customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_refunds_customer ON refunds (customer_id);
`;
