import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDb, type Db } from "@/server/db";
import { getApprovalBlockers } from "@/server/kyc/service";
import { getCustomer, getFeatureFlag, listKycDecisions, listRefundsForCustomer, listTransactionsForCustomer, listVerificationChecks } from "@/server/lookups";
import { TABLES } from "@/server/schema";
import { BLOCK_REFUNDS_UNVERIFIED_KYC } from "@/server/feature-flags/definitions";
import { SEED_IDS } from "@/server/seed";
import { createTestDb } from "./helpers";

const dump = (db: Db) => Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all()]));
type Row = { id: string };

describe("seed data", () => {
  let db: Db;
  beforeEach(() => (db = createTestDb()));
  afterEach(() => db.close());

  it("resets to exactly the same state every time", () => {
    const first = dump(db);
    db.prepare("UPDATE customers SET kyc_status = 'approved'").run();
    db.prepare("INSERT INTO audit_events (occurred_at, action, entity_type, outcome, message) VALUES ('x', 'a', 'b', 'success', 'm')").run();
    resetDb(db);
    expect(dump(db)).toEqual(first);
    const other = createTestDb();
    expect(dump(other)).toEqual(first);
    other.close();
  });

  it("seeds 50 KYC customers plus 4 Fraud Operations customers with the requested status mix", () => {
    const counts = Object.fromEntries(
      (db.prepare("SELECT kyc_status AS s, COUNT(*) AS c FROM customers GROUP BY kyc_status").all() as { s: string; c: number }[]).map((r) => [r.s, r.c]),
    );
    expect(counts).toEqual({ approved: 24, pending: 15, info_requested: 10, rejected: 5 });
  });

  it("keeps data consistent: approved customers passed all checks; history matches the current status", () => {
    for (const { id } of db.prepare("SELECT id FROM customers").all() as Row[]) {
      const c = getCustomer(db, id)!;
      const checks = listVerificationChecks(db, id);
      expect(checks).toHaveLength(4);
      const history = listKycDecisions(db, id);
      if (c.kycStatus === "approved") expect(getApprovalBlockers(checks)).toEqual([]);
      if (c.kycStatus === "info_requested") expect(getApprovalBlockers(checks).length).toBeGreaterThan(0);
      if (c.kycStatus === "pending" && c.reviewType === "onboarding") expect(history).toHaveLength(0);
      else expect(history[0].toStatus).toBe(c.kycStatus);
    }
  });

  it("only gives account activity to customers who were approved, and only after approval", () => {
    for (const { id } of db.prepare("SELECT id FROM customers").all() as Row[]) {
      const c = getCustomer(db, id)!;
      const history = listKycDecisions(db, id);
      const firstApproval = history.filter((d) => d.decision === "approve").at(-1);
      const txns = listTransactionsForCustomer(db, id);
      const refunds = listRefundsForCustomer(db, id);
      if (!firstApproval) {
        expect(c.reviewType).toBe("onboarding");
        expect([txns.length, refunds.length]).toEqual([0, 0]);
        continue;
      }
      for (const t of txns) expect(t.createdAt > firstApproval.decidedAt).toBe(true);
      for (const r of refunds) expect(r.createdAt > firstApproval.decidedAt).toBe(true);
    }
  });

  it("explains every open re-review: existing customers were approved, then the system opened a review", () => {
    const reReviews = (db.prepare("SELECT id FROM customers WHERE review_type != 'onboarding'").all() as Row[]).map(({ id }) => getCustomer(db, id)!);
    expect(reReviews.length).toBeGreaterThanOrEqual(5);
    for (const c of reReviews) {
      expect(["pending", "info_requested"]).toContain(c.kycStatus);
      expect(c.reviewReason.length).toBeGreaterThan(10);
      expect(c.appliedAt < c.reviewOpenedAt).toBe(true);
      const history = listKycDecisions(db, c.id).reverse();
      expect(history.slice(0, 2).map((d) => [d.decision, d.decidedByRole])).toEqual([
        ["approve", "kyc_reviewer"],
        ["open_review", "system"],
      ]);
      expect(history[1].note).toBe(c.reviewReason);
    }
  });

  it("preserves the named demo scenarios", () => {
    expect(getCustomer(db, SEED_IDS.maya)).toMatchObject({ kycStatus: "pending", riskLevel: "medium", reviewType: "triggered" });
    expect(getApprovalBlockers(listVerificationChecks(db, SEED_IDS.maya))).toEqual([]);
    expect(getCustomer(db, SEED_IDS.samira)).toMatchObject({ kycStatus: "pending", riskLevel: "medium", reviewType: "periodic_refresh" });
    expect(getApprovalBlockers(listVerificationChecks(db, SEED_IDS.samira))).toEqual(["proof of address is missing"]);
    expect(getCustomer(db, SEED_IDS.jordan)).toMatchObject({ kycStatus: "approved", riskLevel: "low" });
    expect(getCustomer(db, SEED_IDS.alex)).toMatchObject({ kycStatus: "approved", riskLevel: "low" });
    expect(getCustomer(db, SEED_IDS.viktor)).toMatchObject({ riskLevel: "high", kycStatus: "pending", reviewType: "onboarding" });
  });

  it("keeps the existing refund and transaction relationships intact", () => {
    const simple = (rows: { id: string; amountCents: number; status: string; transactionId?: string }[]) =>
      rows.map((r) => [r.id, r.amountCents, r.status, r.transactionId]);
    expect(simple(listRefundsForCustomer(db, SEED_IDS.maya))).toEqual([["ref_maya_750", 75000, "pending", "txn_maya_750"]]);
    expect(simple(listTransactionsForCustomer(db, SEED_IDS.maya))).toEqual([["txn_maya_750", 75000, "completed", undefined]]);
    expect(simple(listRefundsForCustomer(db, SEED_IDS.jordan))).toEqual([["ref_jordan_420", 42000, "processed", "txn_jordan_420"]]);
    expect(simple(listRefundsForCustomer(db, SEED_IDS.alex))).toEqual([["ref_alex_350", 35000, "pending", "txn_alex_350"]]);
    expect(listTransactionsForCustomer(db, SEED_IDS.alex).map((t) => [t.id, t.amountCents]).sort()).toEqual([
      ["txn_alex_350", 35000],
      ["txn_alex_4500", 450000],
    ]);
  });

  it("generates refunds only against the same customer's completed transactions, never exceeding the amount", () => {
    const bad = db
      .prepare(
        `SELECT r.id FROM refunds r JOIN transactions t ON t.id = r.transaction_id
         WHERE t.customer_id != r.customer_id OR t.status != 'completed' OR r.amount_cents > t.amount_cents`,
      )
      .all();
    expect(bad).toEqual([]);
    expect((db.prepare("SELECT COUNT(*) AS c FROM transactions").get() as { c: number }).c).toBeGreaterThan(60);
    expect((db.prepare("SELECT COUNT(*) AS c FROM refunds").get() as { c: number }).c).toBeGreaterThan(10);
  });

  it("seeds Session 2 refund scenarios: Ben's duplicate request and David's high-value refund", () => {
    const refund = (id: string) => db.prepare("SELECT customer_id AS c, transaction_id AS t, amount_cents AS a, status FROM refunds WHERE id = ?").get(id);
    expect(refund("ref_ben_180")).toEqual({ c: SEED_IDS.ben, t: "txn_ben_180", a: 18000, status: "processed" });
    expect(refund("ref_ben_180_dup")).toEqual({ c: SEED_IDS.ben, t: "txn_ben_180", a: 18000, status: "pending" });
    expect(refund("ref_david_2400")).toEqual({ c: SEED_IDS.david, t: "txn_david_2400", a: 240000, status: "pending" });
    for (const id of [SEED_IDS.ben, SEED_IDS.david]) {
      expect(db.prepare("SELECT kyc_status AS s FROM customers WHERE id = ?").get(id)).toEqual({ s: "approved" });
    }
  });

  it("gives every processed refund exactly one matching payout and closed refunds a decider", () => {
    const mismatched = db
      .prepare(
        `SELECT r.id FROM refunds r LEFT JOIN refund_payouts p ON p.refund_id = r.id
         WHERE (r.status = 'processed') != (p.id IS NOT NULL)
            OR (p.id IS NOT NULL AND (p.amount_cents != r.amount_cents OR p.customer_id != r.customer_id OR p.created_at != r.processed_at))
            OR (r.status != 'pending') != (r.processed_by_role IS NOT NULL)`,
      )
      .all();
    expect(mismatched).toEqual([]);
  });

  it("starts with KYC restriction OFF; only Priya Shah's seeded escalation is held and audited", () => {
    expect(getFeatureFlag(db, BLOCK_REFUNDS_UNVERIFIED_KYC)?.enabled).toBe(false);
    expect(db.prepare("SELECT id, customer_id AS c, status FROM risk_holds").all()).toEqual([{ id: "hold_priya_2750", c: SEED_IDS.priyaShah, status: "active" }]);
    expect(db.prepare("SELECT action, entity_id AS e, outcome, actor_role AS r FROM audit_events").all()).toEqual([
      { action: "fraud_alert.escalate", e: "alert_priya_2750", outcome: "success", r: "risk_admin" },
    ]);
  });
});
