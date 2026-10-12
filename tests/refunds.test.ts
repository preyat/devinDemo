import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents } from "@/server/audit";
import type { Db } from "@/server/db";
import { BLOCK_HIGH_VALUE_REFUNDS, BLOCK_REFUNDS_UNVERIFIED_KYC, PAUSE_REFUND_PROCESSING } from "@/server/feature-flags/definitions";
import { toggleFeatureFlag } from "@/server/feature-flags/service";
import { decideKyc } from "@/server/kyc/service";
import { getRefund, listPayoutsForRefund } from "@/server/lookups";
import { canProcessRefund, processRefund, REFUND_RULES } from "@/server/refunds/service";
import { SEED_IDS } from "@/server/seed";
import { createTestDb } from "./helpers";

const NOW = new Date("2026-02-01T12:00:00.000Z");
const MAYA_REFUND = "ref_maya_750";
const process = (refundId: string, note = "Verified with customer") => ({ refundId, note });
const setFlag = (db: Db, key: string, on: boolean) =>
  expect(toggleFeatureFlag(db, "risk_admin", { key, decision: on ? "enable" : "disable", note: "test" }, NOW).ok).toBe(true);
const codes = (db: Db, refundId: string) => canProcessRefund(db, "payments_operator", refundId).reasons.map((r) => r.code);
const refundAudit = (db: Db, id: string) => listAuditEvents(db, { entityType: "refund", entityId: id });

describe("canProcessRefund + processRefund", () => {
  let db: Db;
  beforeEach(() => (db = createTestDb()));
  afterEach(() => db.close());

  it("flag ON blocks Maya with KYC_NOT_APPROVED and does not mutate business data", () => {
    setFlag(db, BLOCK_REFUNDS_UNVERIFIED_KYC, true);
    const eligibility = canProcessRefund(db, "payments_operator", MAYA_REFUND);
    expect(eligibility).toMatchObject({ eligible: false, errorCode: "rule_violation" });
    expect(eligibility.reasons.map((r) => r.code)).toEqual(["KYC_NOT_APPROVED"]);

    const result = processRefund(db, "payments_operator", process(MAYA_REFUND), NOW);
    expect(result).toMatchObject({ ok: false, code: "rule_violation" });
    expect(!result.ok && result.message).toContain("KYC_NOT_APPROVED");
    expect(getRefund(db, MAYA_REFUND)).toMatchObject({ status: "pending", processedAt: null, processedByRole: null });
    expect(listPayoutsForRefund(db, MAYA_REFUND)).toHaveLength(0);
    expect(refundAudit(db, MAYA_REFUND)[0]).toMatchObject({
      outcome: "denied",
      action: "refund.process",
      actorRole: "payments_operator",
      details: { code: "rule_violation", reasons: ["KYC_NOT_APPROVED"] },
    });
  });

  it("after KYC approval Maya becomes eligible; the first refund persists with one payout and a success audit", () => {
    setFlag(db, BLOCK_REFUNDS_UNVERIFIED_KYC, true);
    expect(decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "approve", note: "Verified" }, NOW).ok).toBe(true);
    expect(canProcessRefund(db, "payments_operator", MAYA_REFUND)).toMatchObject({ eligible: true, reasons: [], errorCode: null });

    const result = processRefund(db, "payments_operator", process(MAYA_REFUND, "Refund to original card"), NOW);
    expect(result).toEqual({ ok: true, message: "Refund ref_maya_750 of $750.00 processed for Maya Reed." });
    expect(getRefund(db, MAYA_REFUND)).toMatchObject({
      status: "processed",
      processedAt: NOW.toISOString(),
      processedByRole: "payments_operator",
      processingNote: "Refund to original card",
    });
    expect(listPayoutsForRefund(db, MAYA_REFUND)).toEqual([
      expect.objectContaining({ amountCents: 75000, customerId: SEED_IDS.maya, createdByRole: "payments_operator" }),
    ]);
    expect(refundAudit(db, MAYA_REFUND)[0]).toMatchObject({ outcome: "success", action: "refund.process", details: { amountCents: 75000 } });
  });

  it("a repeat attempt rejects with ALREADY_REFUNDED and never creates a second payout", () => {
    expect(processRefund(db, "payments_operator", process(MAYA_REFUND), NOW).ok).toBe(true);
    const again = processRefund(db, "payments_operator", process(MAYA_REFUND), new Date("2026-02-02T00:00:00Z"));
    expect(again).toMatchObject({ ok: false, code: "invalid_transition" });
    expect(!again.ok && again.message).toContain("ALREADY_REFUNDED");
    expect(getRefund(db, MAYA_REFUND)?.processedAt).toBe(NOW.toISOString());
    expect(listPayoutsForRefund(db, MAYA_REFUND)).toHaveLength(1);
    expect(refundAudit(db, MAYA_REFUND).map((e) => e.outcome)).toEqual(["denied", "success"]);
  });

  it("Jordan's seeded refund is already processed and read-only", () => {
    expect(codes(db, "ref_jordan_420")).toEqual(["ALREADY_REFUNDED"]);
    expect(processRefund(db, "payments_operator", process("ref_jordan_420"), NOW)).toMatchObject({ ok: false, code: "invalid_transition" });
    expect(listPayoutsForRefund(db, "ref_jordan_420")).toHaveLength(1);
  });

  it("flag OFF removes the KYC restriction (Maya still pending KYC can be refunded)", () => {
    setFlag(db, BLOCK_REFUNDS_UNVERIFIED_KYC, true);
    expect(codes(db, MAYA_REFUND)).toEqual(["KYC_NOT_APPROVED"]);
    setFlag(db, BLOCK_REFUNDS_UNVERIFIED_KYC, false);
    expect(codes(db, MAYA_REFUND)).toEqual([]);
    expect(processRefund(db, "payments_operator", process(MAYA_REFUND), NOW).ok).toBe(true);
  });

  it.each(["kyc_reviewer", "risk_admin", null] as const)("rejects role %s with ROLE_NOT_PERMITTED without mutating", (role) => {
    const eligibility = canProcessRefund(db, role, "ref_alex_350");
    expect(eligibility.reasons.map((r) => r.code)).toEqual(["ROLE_NOT_PERMITTED"]);

    expect(processRefund(db, role, process("ref_alex_350"), NOW)).toMatchObject({ ok: false, code: "forbidden" });
    expect(getRefund(db, "ref_alex_350")?.status).toBe("pending");
    expect(listPayoutsForRefund(db, "ref_alex_350")).toHaveLength(0);
    expect(refundAudit(db, "ref_alex_350")[0]).toMatchObject({ outcome: "denied", actorRole: role, details: { reasons: ["ROLE_NOT_PERMITTED"] } });
  });

  it("returns every failing reason, ordered by precedence", () => {
    setFlag(db, BLOCK_REFUNDS_UNVERIFIED_KYC, true);
    setFlag(db, PAUSE_REFUND_PROCESSING, true);
    expect(canProcessRefund(db, "kyc_reviewer", MAYA_REFUND).reasons.map((r) => r.code)).toEqual([
      "ROLE_NOT_PERMITTED",
      "KYC_NOT_APPROVED",
      "REFUNDS_PAUSED",
    ]);
    expect(processRefund(db, "kyc_reviewer", process(MAYA_REFUND), NOW)).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("blocks a duplicate refund for an already fully refunded transaction (Ben)", () => {
    expect(codes(db, "ref_ben_180_dup")).toEqual(["DUPLICATE_REFUND"]);
    expect(processRefund(db, "payments_operator", process("ref_ben_180_dup"), NOW)).toMatchObject({ ok: false, code: "rule_violation" });
    expect(getRefund(db, "ref_ben_180_dup")?.status).toBe("pending");
  });

  it("pause_refund_processing blocks every refund with REFUNDS_PAUSED", () => {
    setFlag(db, PAUSE_REFUND_PROCESSING, true);
    expect(codes(db, "ref_alex_350")).toEqual(["REFUNDS_PAUSED"]);
  });

  it("block_high_value_refunds (seeded ON) blocks David's $2,400 refund until turned off", () => {
    expect(codes(db, "ref_david_2400")).toEqual(["AMOUNT_OVER_LIMIT"]);
    setFlag(db, BLOCK_HIGH_VALUE_REFUNDS, false);
    expect(processRefund(db, "payments_operator", process("ref_david_2400"), NOW).ok).toBe(true);
  });

  it("validates input and unknown refunds before mutating", () => {
    expect(processRefund(db, "payments_operator", process(MAYA_REFUND, "  "), NOW)).toEqual({
      ok: false,
      code: "validation",
      message: "A note is required to process a refund.",
    });
    expect(processRefund(db, "payments_operator", process("ref_nope"), NOW)).toMatchObject({ ok: false, code: "not_found" });
    expect(getRefund(db, MAYA_REFUND)?.status).toBe("pending");
  });

  it("rolls back the refund and payout if the audit write fails", () => {
    db.exec("DROP TABLE audit_events");
    expect(() => processRefund(db, "payments_operator", process(MAYA_REFUND), NOW)).toThrow();
    expect(getRefund(db, MAYA_REFUND)?.status).toBe("pending");
    expect(listPayoutsForRefund(db, MAYA_REFUND)).toHaveLength(0);
  });

  it("the database refuses a second payout for the same refund", () => {
    expect(() =>
      db
        .prepare(`INSERT INTO refund_payouts (refund_id, customer_id, amount_cents, created_by_role, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run("ref_jordan_420", SEED_IDS.jordan, 42000, "payments_operator", NOW.toISOString()),
    ).toThrow(/UNIQUE/);
  });

  it("has a single ordered rule list (extension point for risk holds)", () => {
    expect(REFUND_RULES.map((r) => r.code)).toEqual([
      "ROLE_NOT_PERMITTED",
      "ALREADY_REFUNDED",
      "REFUND_NOT_PENDING",
      "DUPLICATE_REFUND",
      "KYC_NOT_APPROVED",
      "REFUNDS_PAUSED",
      "AMOUNT_OVER_LIMIT",
    ]);
  });
});
