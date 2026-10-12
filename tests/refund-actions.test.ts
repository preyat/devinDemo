import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents } from "@/server/audit";
import type { Db } from "@/server/db";
import { BLOCK_REFUNDS_UNVERIFIED_KYC } from "@/server/feature-flags/definitions";
import { toggleFeatureFlag } from "@/server/feature-flags/service";
import { getRefund, listPayoutsForRefund } from "@/server/lookups";
import { bulkProcessRefunds, canRejectRefund, claimRefund, processRefund, rejectRefund } from "@/server/refunds/service";
import { DAVID_REFUND_ASSIGNEE } from "@/server/seed";
import { createTestDb } from "./helpers";

const NOW = new Date("2026-02-01T12:00:00.000Z");
const OP = "payments_operator" as const;
const refundAudit = (db: Db, id: string) => listAuditEvents(db, { entityType: "refund", entityId: id });

describe("refund queue actions", () => {
  let db: Db;
  beforeEach(() => (db = createTestDb()));
  afterEach(() => db.close());

  it("a forbidden role with an invalid payload is rejected as forbidden, not validation", () => {
    for (const r of [
      processRefund(db, "kyc_reviewer", { refundId: "ref_alex_350", note: "" }, NOW),
      rejectRefund(db, "kyc_reviewer", { refundId: "ref_alex_350", note: "" }, NOW),
      claimRefund(db, "kyc_reviewer", { refundId: "ref_alex_350", decision: "nope" }, NOW),
    ]) {
      expect(r).toMatchObject({ ok: false, code: "forbidden" });
    }
    expect(refundAudit(db, "ref_alex_350").map((e) => e.details?.reasons)).toEqual([["ROLE_NOT_PERMITTED"], ["ROLE_NOT_PERMITTED"], ["ROLE_NOT_PERMITTED"]]);
  });

  describe("reject", () => {
    it("rejects a pending refund with a note, moves no money and audits", () => {
      const r = rejectRefund(db, OP, { refundId: "ref_alex_350", note: "Charge was legitimate" }, NOW);
      expect(r).toMatchObject({ ok: true });
      expect(getRefund(db, "ref_alex_350")).toMatchObject({ status: "rejected", processedByRole: OP, processingNote: "Charge was legitimate" });
      expect(listPayoutsForRefund(db, "ref_alex_350")).toHaveLength(0);
      expect(refundAudit(db, "ref_alex_350")[0]).toMatchObject({ action: "refund.reject", outcome: "success" });
      expect(processRefund(db, OP, { refundId: "ref_alex_350", note: "x" }, NOW)).toMatchObject({ ok: false, code: "invalid_transition" });
    });

    it("is not blocked by refund flags (a KYC-blocked refund can still be declined)", () => {
      expect(toggleFeatureFlag(db, "risk_admin", { key: BLOCK_REFUNDS_UNVERIFIED_KYC, decision: "enable", note: "t" }, NOW).ok).toBe(true);
      expect(canRejectRefund(db, OP, "ref_maya_750").eligible).toBe(true);
      expect(rejectRefund(db, OP, { refundId: "ref_maya_750", note: "Customer withdrew" }, NOW).ok).toBe(true);
    });

    it("rejects wrong roles, closed refunds and missing notes without mutating", () => {
      expect(rejectRefund(db, "kyc_reviewer", { refundId: "ref_alex_350", note: "n" }, NOW)).toMatchObject({ ok: false, code: "forbidden" });
      expect(rejectRefund(db, OP, { refundId: "ref_jordan_420", note: "n" }, NOW)).toMatchObject({ ok: false, code: "invalid_transition" });
      expect(rejectRefund(db, OP, { refundId: "ref_alex_350", note: " " }, NOW)).toMatchObject({ ok: false, code: "validation" });
      expect(getRefund(db, "ref_alex_350")?.status).toBe("pending");
      expect(refundAudit(db, "ref_alex_350")[0]).toMatchObject({ outcome: "denied", details: { reasons: ["VALIDATION"] } });
      expect(refundAudit(db, "ref_jordan_420")[0]).toMatchObject({ outcome: "denied", details: { reasons: ["ALREADY_REFUNDED"] } });
    });
  });

  describe("partial refund", () => {
    it("pays out the approved amount and records it", () => {
      const r = processRefund(db, OP, { refundId: "ref_alex_350", note: "Partial goodwill", amount: "120.50" }, NOW);
      expect(r).toMatchObject({ ok: true });
      expect(r.message).toContain("partial refund of $120.50");
      expect(getRefund(db, "ref_alex_350")).toMatchObject({ status: "processed", amountCents: 35000, approvedAmountCents: 12050 });
      expect(listPayoutsForRefund(db, "ref_alex_350").map((p) => p.amountCents)).toEqual([12050]);
      expect(refundAudit(db, "ref_alex_350")[0].details).toMatchObject({ amountCents: 12050, requestedCents: 35000, partial: true });
    });

    it("blank amount means full refund", () => {
      expect(processRefund(db, OP, { refundId: "ref_alex_350", note: "Full", amount: "" }, NOW).ok).toBe(true);
      expect(getRefund(db, "ref_alex_350")?.approvedAmountCents).toBe(35000);
    });

    it("rejects amounts above the request, zero or malformed", () => {
      expect(processRefund(db, OP, { refundId: "ref_alex_350", note: "n", amount: "351" }, NOW)).toMatchObject({ ok: false, code: "validation" });
      expect(refundAudit(db, "ref_alex_350")[0].details).toMatchObject({ reasons: ["AMOUNT_EXCEEDS_REQUEST"] });
      expect(processRefund(db, OP, { refundId: "ref_alex_350", note: "n", amount: "0" }, NOW)).toMatchObject({ ok: false, code: "validation" });
      expect(processRefund(db, OP, { refundId: "ref_alex_350", note: "n", amount: "12.345" }, NOW)).toMatchObject({ ok: false, code: "validation" });
      expect(getRefund(db, "ref_alex_350")?.status).toBe("pending");
    });

    it("a partial amount cannot slip a high-value refund under the limit", () => {
      expect(processRefund(db, OP, { refundId: "ref_david_2400", note: "n", amount: "500" }, NOW)).toMatchObject({ ok: false, code: "rule_violation" });
      expect(refundAudit(db, "ref_david_2400")[0].details).toMatchObject({ reasons: ["AMOUNT_OVER_LIMIT"] });
    });

    it("duplicate check uses paid-out amounts: a partial leaves room for the remainder", () => {
      expect(processRefund(db, OP, { refundId: "ref_alex_350", note: "first half", amount: "200" }, NOW).ok).toBe(true);
      db.prepare(
        `INSERT INTO refunds (id, customer_id, transaction_id, amount_cents, status, reason, created_at) SELECT 'ref_alex_rest', customer_id, transaction_id, 15000, 'pending', 'Remainder', ? FROM refunds WHERE id = 'ref_alex_350'`,
      ).run(NOW.toISOString());
      expect(processRefund(db, OP, { refundId: "ref_alex_rest", note: "remainder" }, NOW).ok).toBe(true);
    });
  });

  describe("claim / assign", () => {
    it("claims, blocks a second claim, releases, and audits each step", () => {
      expect(claimRefund(db, OP, { refundId: "ref_alex_350", decision: "claim", assignee: "Sam" }, NOW)).toMatchObject({ ok: true });
      expect(getRefund(db, "ref_alex_350")).toMatchObject({ assignedTo: "Sam", assignedAt: NOW.toISOString() });
      expect(claimRefund(db, OP, { refundId: "ref_alex_350", decision: "claim", assignee: "Kim" }, NOW)).toMatchObject({ ok: false, code: "invalid_transition" });
      expect(refundAudit(db, "ref_alex_350")[0].details).toMatchObject({ reasons: ["ALREADY_CLAIMED"] });
      expect(claimRefund(db, OP, { refundId: "ref_alex_350", decision: "release" }, NOW)).toMatchObject({ ok: true });
      expect(getRefund(db, "ref_alex_350")?.assignedTo).toBeNull();
      expect(claimRefund(db, OP, { refundId: "ref_alex_350", decision: "release" }, NOW)).toMatchObject({ ok: false, code: "invalid_transition" });
      expect(refundAudit(db, "ref_alex_350").map((e) => `${e.action}:${e.outcome}`)).toEqual([
        "refund.release:denied",
        "refund.release:success",
        "refund.claim:denied",
        "refund.claim:success",
      ]);
    });

    it("David's seeded refund is claimed; wrong roles, closed refunds and blank names are rejected", () => {
      expect(getRefund(db, "ref_david_2400")?.assignedTo).toBe(DAVID_REFUND_ASSIGNEE);
      expect(claimRefund(db, "risk_admin", { refundId: "ref_alex_350", decision: "claim", assignee: "Sam" }, NOW)).toMatchObject({ ok: false, code: "forbidden" });
      expect(claimRefund(db, OP, { refundId: "ref_jordan_420", decision: "claim", assignee: "Sam" }, NOW)).toMatchObject({ ok: false, code: "invalid_transition" });
      expect(claimRefund(db, OP, { refundId: "ref_alex_350", decision: "claim", assignee: " " }, NOW)).toMatchObject({ ok: false, code: "validation" });
      expect(getRefund(db, "ref_alex_350")?.assignedTo).toBeNull();
    });
  });

  describe("bulk process", () => {
    it("processes eligible refunds and reports blocked ones, each audited individually", () => {
      const r = bulkProcessRefunds(db, OP, { refundIds: ["ref_alex_350", "ref_ben_180_dup", "ref_maya_750", "ref_alex_350"], note: "Batch run" }, NOW);
      expect(r).toMatchObject({ ok: true });
      expect(r.outcome?.processed).toEqual(["ref_alex_350", "ref_maya_750"]);
      expect(r.outcome?.blocked).toEqual([expect.objectContaining({ refundId: "ref_ben_180_dup", code: "rule_violation" })]);
      expect(getRefund(db, "ref_ben_180_dup")?.status).toBe("pending");
      expect(listPayoutsForRefund(db, "ref_alex_350")).toHaveLength(1);
      expect(refundAudit(db, "ref_ben_180_dup")[0]).toMatchObject({ outcome: "denied", details: { reasons: ["DUPLICATE_REFUND"] } });
      expect(listAuditEvents(db, { entityType: "refund_batch" })[0]).toMatchObject({ action: "refund.bulk_process", outcome: "success" });
    });

    it("reports failure when nothing could be processed", () => {
      const r = bulkProcessRefunds(db, OP, { refundIds: ["ref_jordan_420"], note: "n" }, NOW);
      expect(r).toMatchObject({ ok: false, code: "rule_violation" });
    });

    it("wrong role or empty selection is rejected before any refund is touched", () => {
      expect(bulkProcessRefunds(db, "kyc_reviewer", { refundIds: ["ref_alex_350"], note: "n" }, NOW)).toMatchObject({ ok: false, code: "forbidden" });
      expect(bulkProcessRefunds(db, OP, { refundIds: [], note: "n" }, NOW)).toMatchObject({ ok: false, code: "validation" });
      expect(getRefund(db, "ref_alex_350")?.status).toBe("pending");
      expect(refundAudit(db, "ref_alex_350")).toHaveLength(0);
      expect(listAuditEvents(db, { entityType: "refund_batch" }).map((e) => e.outcome)).toEqual(["denied", "denied"]);
    });
  });
});
