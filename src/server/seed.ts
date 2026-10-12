import type Database from "better-sqlite3";

// Fixed timestamp keeps seed data deterministic across resets and tests.
export const SEED_TIMESTAMP = "2026-01-15T09:00:00.000Z";

export const SEED_IDS = {
  maya: "cus_maya_reed",
  jordan: "cus_jordan_lee",
  alex: "cus_alex_kim",
} as const;

export const KYC_RESTRICTION_FLAG = "kyc_restriction";

export function seedDatabase(db: Database.Database): void {
  const t = SEED_TIMESTAMP;
  const insertCustomer = db.prepare(
    `INSERT INTO customers (id, name, email, country, date_of_birth, document_type, document_last4, kyc_status, kyc_decided_at, kyc_decided_by_role, kyc_decision_note, created_at)
     VALUES (@id, @name, @email, @country, @dob, @docType, @docLast4, @kycStatus, @decidedAt, @decidedBy, @note, @createdAt)`,
  );
  const insertTxn = db.prepare(
    `INSERT INTO transactions (id, customer_id, amount_cents, currency, description, status, created_at)
     VALUES (?, ?, ?, 'USD', ?, 'completed', ?)`,
  );
  const insertRefund = db.prepare(
    `INSERT INTO refunds (id, customer_id, transaction_id, amount_cents, currency, status, reason, created_at, processed_at)
     VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    insertCustomer.run({
      id: SEED_IDS.maya, name: "Maya Reed", email: "maya.reed@example.test", country: "US",
      dob: "1991-04-12", docType: "Passport", docLast4: "4821", kycStatus: "pending",
      decidedAt: null, decidedBy: null, note: null, createdAt: t,
    });
    insertCustomer.run({
      id: SEED_IDS.jordan, name: "Jordan Lee", email: "jordan.lee@example.test", country: "CA",
      dob: "1987-09-30", docType: "Driver licence", docLast4: "1934", kycStatus: "approved",
      decidedAt: t, decidedBy: "kyc_reviewer", note: "Seeded as approved", createdAt: t,
    });
    insertCustomer.run({
      id: SEED_IDS.alex, name: "Alex Kim", email: "alex.kim@example.test", country: "GB",
      dob: "1995-02-07", docType: "National ID", docLast4: "7710", kycStatus: "approved",
      decidedAt: t, decidedBy: "kyc_reviewer", note: "Seeded as approved", createdAt: t,
    });

    insertTxn.run("txn_maya_750", SEED_IDS.maya, 75000, "Annual plan purchase", t);
    insertTxn.run("txn_jordan_420", SEED_IDS.jordan, 42000, "Hardware order", t);
    insertTxn.run("txn_alex_350", SEED_IDS.alex, 35000, "Subscription upgrade", t);
    insertTxn.run("txn_alex_4500", SEED_IDS.alex, 450000, "Wire transfer out", t);

    insertRefund.run("ref_maya_750", SEED_IDS.maya, "txn_maya_750", 75000, "pending", "Customer cancelled within trial", t, null);
    insertRefund.run("ref_jordan_420", SEED_IDS.jordan, "txn_jordan_420", 42000, "processed", "Item returned", t, t);
    insertRefund.run("ref_alex_350", SEED_IDS.alex, "txn_alex_350", 35000, "pending", "Duplicate charge", t, null);

    db.prepare(
      `INSERT INTO feature_flags (key, enabled, description, updated_at) VALUES (?, 0, ?, ?)`,
    ).run(KYC_RESTRICTION_FLAG, "When ON, customers without approved KYC are restricted.", t);
    // risk_holds intentionally starts empty.
  })();
}
