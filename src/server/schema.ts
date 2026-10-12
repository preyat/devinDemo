// Single source of truth for the SQLite schema. Money is stored as integer cents.
// Tables for refunds, feature_flags and risk_holds exist now so later workflows
// (Refunds, Feature Flags, Transaction Risk Review) can build on stable data.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_last4 TEXT NOT NULL,
  kyc_status TEXT NOT NULL CHECK (kyc_status IN ('pending', 'approved', 'rejected')),
  kyc_decided_at TEXT,
  kyc_decided_by_role TEXT,
  kyc_decision_note TEXT,
  created_at TEXT NOT NULL
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
`;
