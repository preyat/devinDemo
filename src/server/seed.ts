import type Database from "better-sqlite3";
import { FEATURE_FLAGS } from "./feature-flags/definitions";
import { SEED_CUSTOMERS, type SeedCustomer, type SeedDecision } from "./seed-data";

// Fixed "now" for the dataset: every timestamp is derived from it, so resets are byte-identical.
export const SEED_TIMESTAMP = "2026-01-15T09:00:00.000Z";
const NOW_MS = Date.parse(SEED_TIMESTAMP);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const EXPIRED_ON = "2025-11-30";

export const SEED_IDS = {
  maya: "cus_maya_reed",
  samira: "cus_samira_patel",
  jordan: "cus_jordan_lee",
  alex: "cus_alex_kim",
  viktor: "cus_viktor_sokolov",
  lucas: "cus_lucas_moreau",
  liam: "cus_liam_o_connor",
  ben: "cus_ben_carter",
  david: "cus_david_cohen",
} as const;

const PROCESSED_NOTE = "Refund issued to original payment method.";
export const DAVID_REFUND_ASSIGNEE = "Priya N.";
const REJECTED_NOTE = "Rejected: request outside the refund policy window.";

type CheckType = "identity" | "address" | "sanctions" | "pep";
type CheckRow = [result: string, detail: string];

const at = (daysAgo: number, hourOffset = 0) => new Date(NOW_MS - daysAgo * DAY + hourOffset * HOUR).toISOString();
const pad = (n: number) => String(n).padStart(2, "0");
const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export const seedCustomerId = (c: SeedCustomer) => c.id ?? `cus_${slug(c.name)}`;

/** Small deterministic PRNG so generated transactions are identical on every reset. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DOC_PREFIX: Record<SeedCustomer["document"], string> = {
  Passport: "P",
  "National ID": "ID",
  "Driver licence": "DL",
  "Residence permit": "RP",
};
const ADDRESS_PROOFS = [
  "Utility bill verified (issued within 90 days).",
  "Bank statement verified.",
  "Council tax letter verified.",
  "Tenancy agreement verified.",
];
const APPROVE_NOTES = [
  "All mandatory checks passed; documents verified.",
  "Identity and address verified; screening clear.",
  "Standard due diligence complete; no adverse findings.",
  "Documents verified against application; approved.",
];
const TARGET: Record<SeedDecision, string> = { approve: "approved", reject: "rejected", request_info: "info_requested" };
type DecisionRow = [customerId: string, decision: string, from: string, to: string, note: string, role: string, decidedAt: string];

function checksFor(c: SeedCustomer, i: number): Record<CheckType, CheckRow> {
  const checks: Record<CheckType, CheckRow> = {
    identity: ["passed", `${c.document} verified; liveness check passed.`],
    address: ["passed", ADDRESS_PROOFS[i % ADDRESS_PROOFS.length]],
    sanctions: ["clear", "No matches on consolidated sanctions lists."],
    pep: ["clear", "No PEP or adverse media matches."],
  };
  switch (c.scenario) {
    case "address_missing": checks.address = ["missing", "Proof of address outstanding."]; break;
    case "address_failed": checks.address = ["failed", "Address on submitted document does not match the application."]; break;
    case "identity_missing": checks.identity = ["missing", "No identity document submitted."]; break;
    case "identity_failed": checks.identity = ["failed", "Selfie does not match document photo."]; break;
    case "doc_expired": checks.identity = ["failed", `${c.document} expired on ${EXPIRED_ON}.`]; break;
    case "doc_forged": checks.identity = ["failed", "Document security features failed validation."]; break;
    case "sanctions_review": checks.sanctions = ["review_required", "Potential sanctions match requires review."]; break;
    case "pep_review": checks.pep = ["review_required", "Possible PEP match requires review."]; break;
    case "clean": break;
  }
  for (const [type, detail] of Object.entries(c.detail ?? {}) as [CheckType, string][]) {
    checks[type] = [checks[type][0], detail];
  }
  return checks;
}

function historyFor(c: SeedCustomer, i: number): [SeedDecision, number, string][] {
  if (c.history) return c.history;
  if (c.status === "approved") return [["approve", Math.max(c.appliedDaysAgo - 2, 0.5), APPROVE_NOTES[i % APPROVE_NOTES.length]]];
  if (c.status === "pending") return [];
  throw new Error(`Seed customer ${c.name} (${c.status}) needs explicit history`);
}

const PERSONAL_TXNS: [string, number, number][] = [
  ["Card purchase - groceries", 1800, 22000],
  ["Subscription renewal", 999, 4999],
  ["Online marketplace order", 1500, 60000],
  ["Utility bill payment", 4000, 30000],
  ["Travel booking", 30000, 250000],
  ["Electronics purchase", 20000, 300000],
  ["International transfer", 50000, 900000],
];
const BUSINESS_TXNS: [string, number, number][] = [
  ["Supplier invoice payment", 100000, 1200000],
  ["Payroll disbursement", 200000, 1500000],
  ["SaaS tooling subscription", 5000, 90000],
  ["International transfer", 80000, 950000],
  ["Office equipment purchase", 30000, 400000],
];
const REFUND_REASONS = [
  "Item returned",
  "Duplicate charge",
  "Service not delivered",
  "Customer cancelled within cooling-off period",
  "Merchant overcharge",
];

export function seedDatabase(db: Database.Database): void {
  const insertCustomer = db.prepare(
    `INSERT INTO customers (id, name, email, country, city, date_of_birth, account_type, account_ref, document_type, document_ref,
       document_expiry, kyc_status, risk_level, risk_reason, review_type, review_reason, review_opened_at, applied_at, updated_at)
     VALUES (@id, @name, @email, @country, @city, @dob, @accountType, @accountRef, @document, @documentRef,
       @documentExpiry, @status, @risk, @riskReason, @reviewType, @reviewReason, @reviewOpenedAt, @appliedAt, @updatedAt)`,
  );
  const insertCheck = db.prepare(
    `INSERT INTO verification_checks (customer_id, check_type, result, detail, checked_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertDecision = db.prepare(
    `INSERT INTO kyc_decisions (customer_id, decision, from_status, to_status, note, decided_by_role, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertTxn = db.prepare(
    `INSERT INTO transactions (id, customer_id, amount_cents, currency, description, status, created_at) VALUES (?, ?, ?, 'USD', ?, ?, ?)`,
  );
  const insertRefundRow = db.prepare(
    `INSERT INTO refunds (id, customer_id, transaction_id, amount_cents, currency, status, reason, created_at, processed_at,
       processed_by_role, processing_note, approved_amount_cents)
     VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPayout = db.prepare(
    `INSERT INTO refund_payouts (refund_id, customer_id, amount_cents, currency, created_by_role, created_at) VALUES (?, ?, ?, 'USD', ?, ?)`,
  );
  // Closed refunds record who decided; every processed refund has exactly one payout.
  const insertRefund = (id: string, customerId: string, txnId: string, amount: number, status: string, reason: string, createdAt: string, processedAt: string | null) => {
    const closed = status !== "pending";
    insertRefundRow.run(id, customerId, txnId, amount, status, reason, createdAt, processedAt, closed ? "payments_operator" : null,
      status === "processed" ? PROCESSED_NOTE : status === "rejected" ? REJECTED_NOTE : null, status === "processed" ? amount : null);
    if (status === "processed") insertPayout.run(id, customerId, amount, "payments_operator", processedAt);
  };
  const rng = mulberry32(20260115);
  const pick = <T,>(list: T[]) => list[Math.floor(rng() * list.length)];
  const dollars = (min: number, max: number) => Math.max(100, Math.round((min + rng() * (max - min)) / 100) * 100);

  db.transaction(() => {
    SEED_CUSTOMERS.forEach((c, i) => {
      const id = seedCustomerId(c);
      const caseOpenedAt = at(c.appliedDaysAgo, -(i % 8));
      const appliedAt = c.existing ? at(c.existing.sinceDaysAgo, -(i % 8)) : caseOpenedAt;
      if (c.existing && !["pending", "info_requested"].includes(c.status)) {
        throw new Error(`Seed customer ${c.name}: only open cases can be existing-customer re-reviews`);
      }

      const decisions: DecisionRow[] = [];
      let status = "pending";
      let updatedAt = caseOpenedAt;
      let firstApprovalDaysAgo: number | undefined;
      if (c.existing) {
        // Original onboarding approval, then the system re-opens the case.
        firstApprovalDaysAgo = c.existing.sinceDaysAgo - 1;
        decisions.push([id, "approve", "pending", "approved", "Onboarding checks passed; account opened.", "kyc_reviewer", at(firstApprovalDaysAgo, 1)]);
        decisions.push([id, "open_review", "approved", "pending", c.existing.reason, "system", caseOpenedAt]);
      }
      for (const [decision, daysAgo, note] of historyFor(c, i)) {
        const decidedAt = at(daysAgo, 1);
        decisions.push([id, decision, status, TARGET[decision], note, "kyc_reviewer", decidedAt]);
        if (decision === "approve") firstApprovalDaysAgo ??= daysAgo;
        status = TARGET[decision];
        updatedAt = decidedAt;
      }
      if (status !== c.status) throw new Error(`Seed history for ${c.name} ends in ${status}, expected ${c.status}`);
      if (c.status === "approved" && c.scenario !== "clean") throw new Error(`Approved seed customer ${c.name} must be clean`);

      insertCustomer.run({
        id,
        name: c.name,
        email: `${slug(c.name).replace(/_/g, ".")}@example.test`,
        country: c.country,
        city: c.city,
        dob: `${1958 + ((i * 7) % 42)}-${pad(((i * 5) % 12) + 1)}-${pad(((i * 3) % 28) + 1)}`,
        accountType: c.accountType,
        accountRef: `ACC-${100100 + i * 37}`,
        document: c.document,
        documentRef: `${DOC_PREFIX[c.document]}${String(4_800_000 + i * 7919).slice(-7)}`,
        documentExpiry: c.scenario === "doc_expired" ? EXPIRED_ON : `${2028 + (i % 5)}-${pad((i % 12) + 1)}-${pad((i % 27) + 1)}`,
        status: c.status,
        risk: c.risk,
        riskReason: c.riskReason,
        reviewType: c.existing?.type ?? "onboarding",
        reviewReason: c.existing?.reason ?? `New ${c.accountType} account application.`,
        reviewOpenedAt: caseOpenedAt,
        appliedAt,
        updatedAt,
      });
      for (const [type, [result, detail]] of Object.entries(checksFor(c, i))) {
        insertCheck.run(id, type, result, detail, at(c.appliedDaysAgo, 2 - (i % 8)));
      }
      for (const row of decisions) insertDecision.run(...row);

      // Only customers who have been approved at some point can have account activity.
      if (c.fixedTransactions || firstApprovalDaysAgo === undefined) return;
      const windowDays = Math.min(firstApprovalDaysAgo, 180);
      const count = c.status === "approved" ? 2 + Math.floor(rng() * 4) : 2 + Math.floor(rng() * 3);
      for (let n = 1; n <= count; n++) {
        const [description, min, max] = pick(c.accountType === "business" ? BUSINESS_TXNS : PERSONAL_TXNS);
        const amount = dollars(min, max);
        const roll = rng();
        const txnStatus = roll < 0.85 ? "completed" : roll < 0.95 ? "pending" : "failed";
        const txnDaysAgo = 0.2 + (windowDays - 0.2) * rng();
        const txnId = `txn_${id.slice(4)}_${n}`;
        insertTxn.run(txnId, id, amount, description, txnStatus, at(txnDaysAgo));

        if (txnStatus === "completed" && rng() < 0.22) {
          const refundAmount = rng() < 0.6 ? amount : Math.max(100, Math.round((amount * (0.2 + 0.6 * rng())) / 100) * 100);
          const r = rng();
          const refundStatus = r < 0.4 ? "pending" : r < 0.85 ? "processed" : "rejected";
          const createdDaysAgo = Math.max(txnDaysAgo - (1 + rng() * 4), 0.05);
          const processedAt = refundStatus === "pending" ? null : at(Math.max(createdDaysAgo - 1, 0.01));
          insertRefund(`ref_${id.slice(4)}_${n}`, id, txnId, refundAmount, refundStatus, pick(REFUND_REASONS), at(createdDaysAgo), processedAt);
        }
      }
    });

    // Preserved demo relationships (used by later Refunds / Risk Review sessions).
    insertTxn.run("txn_maya_750", SEED_IDS.maya, 75000, "Annual plan purchase", "completed", at(5));
    insertRefund("ref_maya_750", SEED_IDS.maya, "txn_maya_750", 75000, "pending", "Customer cancelled within trial", at(4), null);
    insertTxn.run("txn_jordan_420", SEED_IDS.jordan, 42000, "Hardware order", "completed", at(30));
    insertRefund("ref_jordan_420", SEED_IDS.jordan, "txn_jordan_420", 42000, "processed", "Item returned", at(25), at(23));
    insertTxn.run("txn_alex_350", SEED_IDS.alex, 35000, "Subscription upgrade", "completed", at(12));
    insertRefund("ref_alex_350", SEED_IDS.alex, "txn_alex_350", 35000, "pending", "Duplicate charge", at(10), null);
    insertTxn.run("txn_alex_4500", SEED_IDS.alex, 450000, "Wire transfer out", "completed", at(2));
    // Duplicate refund request: the transaction was already fully refunded, then the customer re-submitted.
    insertTxn.run("txn_ben_180", SEED_IDS.ben, 18000, "Concert tickets", "completed", at(20));
    insertRefund("ref_ben_180", SEED_IDS.ben, "txn_ben_180", 18000, "processed", "Event cancelled by organiser", at(18), at(17));
    insertRefund("ref_ben_180_dup", SEED_IDS.ben, "txn_ben_180", 18000, "pending", "Event cancelled by organiser (re-submitted by customer)", at(6), null);

    // High-value refund: blocked while block_high_value_refunds is ON (seeded ON).
    insertTxn.run("txn_david_2400", SEED_IDS.david, 240000, "Office equipment order", "completed", at(9));
    insertRefund("ref_david_2400", SEED_IDS.david, "txn_david_2400", 240000, "pending", "Order cancelled before shipment", at(5), null);
    // Claimed by an operator who is chasing the high-value approval (claim is coordination only).
    db.prepare(`UPDATE refunds SET assigned_to = ?, assigned_at = ? WHERE id = ?`).run(DAVID_REFUND_ASSIGNEE, at(1), "ref_david_2400");

    const insertFlag = db.prepare(`INSERT INTO feature_flags (key, enabled, description, updated_at, updated_by_role) VALUES (?, ?, ?, ?, NULL)`);
    for (const f of FEATURE_FLAGS) insertFlag.run(f.key, f.seedEnabled ? 1 : 0, f.description, SEED_TIMESTAMP);
    // risk_holds and audit_events intentionally start empty.
  })();
}
