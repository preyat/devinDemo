import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents } from "@/server/audit";
import type { Db } from "@/server/db";
import { allowedKycDecisions, decideKyc, getApprovalBlockers } from "@/server/kyc/service";
import { getCustomer, listKycDecisions, listVerificationChecks } from "@/server/lookups";
import { SEED_IDS } from "@/server/seed";
import { createTestDb } from "./helpers";

const NOW = new Date("2026-02-01T12:00:00.000Z");
const approve = (customerId: string, note = "All checks verified") => ({ customerId, decision: "approve", note });

describe("KYC decisions", () => {
  let db: Db;
  beforeEach(() => (db = createTestDb()));
  afterEach(() => db.close());

  it("approves Maya when all mandatory checks pass and persists status + history", () => {
    const result = decideKyc(db, "kyc_reviewer", approve(SEED_IDS.maya, "Passport and address verified"), NOW);

    expect(result).toEqual({ ok: true, message: "KYC approved for Maya Reed." });
    expect(getCustomer(db, SEED_IDS.maya)).toMatchObject({ kycStatus: "approved", updatedAt: NOW.toISOString() });
    expect(listKycDecisions(db, SEED_IDS.maya)[0]).toMatchObject({
      decision: "approve",
      fromStatus: "pending",
      toStatus: "approved",
      note: "Passport and address verified",
      decidedByRole: "kyc_reviewer",
      decidedAt: NOW.toISOString(),
    });
  });

  it("blocks approval when proof of address is missing (Samira)", () => {
    const result = decideKyc(db, "kyc_reviewer", approve(SEED_IDS.samira), NOW);

    expect(result).toEqual({ ok: false, code: "rule_violation", message: "Cannot approve: proof of address is missing." });
    expect(getCustomer(db, SEED_IDS.samira)?.kycStatus).toBe("pending");
    expect(listKycDecisions(db, SEED_IDS.samira)[0].decision).toBe("open_review");
  });

  it("blocks approval when the identity document is expired (Lucas)", () => {
    const result = decideKyc(db, "kyc_reviewer", approve(SEED_IDS.lucas), NOW);
    expect(result).toMatchObject({ ok: false, code: "rule_violation" });
    expect(result.message).toBe("Cannot approve: identity verification failed (Passport expired on 2025-11-30).");
  });

  it("blocks approval when sanctions or PEP screening requires review", () => {
    expect(decideKyc(db, "kyc_reviewer", approve(SEED_IDS.viktor), NOW)).toEqual({
      ok: false,
      code: "rule_violation",
      message: "Cannot approve: sanctions screening requires further review.",
    });
    expect(decideKyc(db, "kyc_reviewer", approve("cus_aisha_bello"), NOW)).toEqual({
      ok: false,
      code: "rule_violation",
      message: "Cannot approve: PEP screening requires further review.",
    });
  });

  it("lists every blocker for an incomplete case", () => {
    expect(
      getApprovalBlockers([
        { customerId: "x", checkType: "identity", result: "missing", detail: "", checkedAt: "" },
        { customerId: "x", checkType: "sanctions", result: "review_required", detail: "", checkedAt: "" },
        { customerId: "x", checkType: "pep", result: "clear", detail: "", checkedAt: "" },
      ]),
    ).toEqual(["identity verification is missing", "proof of address is missing", "sanctions screening requires further review"]);
  });

  it("requests more information for Samira, updating status and recording the reason", () => {
    const note = "Provide a utility bill or bank statement dated within 3 months.";
    const result = decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.samira, decision: "request_info", note }, NOW);

    expect(result).toEqual({ ok: true, message: "More information requested from Samira Patel." });
    expect(getCustomer(db, SEED_IDS.samira)?.kycStatus).toBe("info_requested");
    expect(listKycDecisions(db, SEED_IDS.samira)[0]).toMatchObject({ decision: "request_info", toStatus: "info_requested", note });
    expect(listAuditEvents(db, { entityId: SEED_IDS.samira })[0]).toMatchObject({
      action: "kyc.request_info",
      outcome: "success",
      details: { from: "pending", to: "info_requested", note },
    });
    // From info_requested, the reviewer can still approve or reject (but not re-request).
    expect(allowedKycDecisions("info_requested")).toEqual(["approve", "reject"]);
    expect(decideKyc(db, "kyc_reviewer", approve(SEED_IDS.samira), NOW)).toMatchObject({ code: "rule_violation" });
  });

  it("rejects with a reason, and requires a note for every decision", () => {
    expect(decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.samira, decision: "reject" }, NOW)).toEqual({
      ok: false,
      code: "validation",
      message: "A note is required for every decision.",
    });
    expect(decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "approve", note: "   " }, NOW)).toMatchObject({
      code: "validation",
    });
    expect(getCustomer(db, SEED_IDS.maya)?.kycStatus).toBe("pending");

    const result = decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.samira, decision: "reject", note: "Fraud indicators" }, NOW);
    expect(result).toEqual({ ok: true, message: "KYC rejected for Samira Patel." });
    expect(getCustomer(db, SEED_IDS.samira)?.kycStatus).toBe("rejected");
  });

  it.each(["payments_operator", "risk_admin", null] as const)("forbids role %s in the backend and audits the denial", (role) => {
    for (const decision of ["approve", "reject", "request_info"]) {
      const result = decideKyc(db, role, { customerId: SEED_IDS.maya, decision, note: "attempt" }, NOW);
      expect(result).toMatchObject({ ok: false, code: "forbidden" });
    }
    expect(getCustomer(db, SEED_IDS.maya)?.kycStatus).toBe("pending");
    const events = listAuditEvents(db, { entityId: SEED_IDS.maya });
    expect(events.map((e) => [e.action, e.outcome, e.actorRole])).toEqual([
      ["kyc.request_info", "denied", role],
      ["kyc.reject", "denied", role],
      ["kyc.approve", "denied", role],
    ]);
  });

  it("rejects duplicate decisions on approved/rejected customers", () => {
    expect(decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.jordan, decision: "reject", note: "late" }, NOW)).toEqual({
      ok: false,
      code: "invalid_transition",
      message: "Cannot change KYC from approved to rejected.",
    });
    decideKyc(db, "kyc_reviewer", approve(SEED_IDS.maya), NOW);
    expect(decideKyc(db, "kyc_reviewer", approve(SEED_IDS.maya), NOW)).toMatchObject({ code: "invalid_transition" });
    expect(decideKyc(db, "kyc_reviewer", { customerId: "cus_marcus_hale", decision: "request_info", note: "x" }, NOW)).toMatchObject({
      code: "invalid_transition",
    });
    expect(listKycDecisions(db, SEED_IDS.maya).filter((d) => d.decidedAt === NOW.toISOString())).toHaveLength(1);
  });

  it("records successful and blocked actions in the audit trail", () => {
    decideKyc(db, "payments_operator", approve(SEED_IDS.maya), NOW);
    decideKyc(db, "kyc_reviewer", approve(SEED_IDS.samira), NOW);
    decideKyc(db, "kyc_reviewer", approve(SEED_IDS.maya), NOW);

    expect(listAuditEvents(db).map((e) => [e.entityId, e.action, e.outcome, e.details?.code ?? null])).toEqual([
      [SEED_IDS.maya, "kyc.approve", "success", null],
      [SEED_IDS.samira, "kyc.approve", "denied", "rule_violation"],
      [SEED_IDS.maya, "kyc.approve", "denied", "forbidden"],
    ]);
  });

  it("validates malformed input and unknown customers", () => {
    expect(decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "escalate", note: "x" }, NOW)).toMatchObject({
      code: "validation",
    });
    expect(listAuditEvents(db)[0].action).toBe("kyc.decide");
    expect(decideKyc(db, "kyc_reviewer", approve("cus_missing"), NOW)).toMatchObject({ code: "not_found" });
  });

  it("rolls back the state change if the audit write fails", () => {
    db.exec("DROP TABLE audit_events");
    expect(() => decideKyc(db, "kyc_reviewer", approve(SEED_IDS.maya), NOW)).toThrow();
    expect(getCustomer(db, SEED_IDS.maya)?.kycStatus).toBe("pending");
    expect(listKycDecisions(db, SEED_IDS.maya)[0].decision).toBe("open_review");
  });

  it("keeps verification checks unchanged by decisions", () => {
    const before = listVerificationChecks(db, SEED_IDS.maya);
    decideKyc(db, "kyc_reviewer", approve(SEED_IDS.maya), NOW);
    expect(listVerificationChecks(db, SEED_IDS.maya)).toEqual(before);
  });
});
