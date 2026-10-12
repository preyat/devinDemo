import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents } from "@/server/audit";
import type { Db } from "@/server/db";
import { decideKyc } from "@/server/kyc/service";
import { getCustomer } from "@/server/lookups";
import { SEED_IDS } from "@/server/seed";
import { createTestDb } from "./helpers";

const NOW = new Date("2026-02-01T12:00:00.000Z");

describe("KYC decisions", () => {
  let db: Db;
  beforeEach(() => (db = createTestDb()));
  afterEach(() => db.close());

  it("approves a pending customer and persists the decision", () => {
    const result = decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "approve" }, NOW);

    expect(result).toEqual({ ok: true, message: "KYC approved for Maya Reed." });
    const maya = getCustomer(db, SEED_IDS.maya);
    expect(maya).toMatchObject({
      kycStatus: "approved",
      kycDecidedAt: NOW.toISOString(),
      kycDecidedByRole: "kyc_reviewer",
    });
  });

  it("rejects a pending customer when a note is given", () => {
    const result = decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "reject", note: "Document expired" }, NOW);
    expect(result.ok).toBe(true);
    expect(getCustomer(db, SEED_IDS.maya)).toMatchObject({ kycStatus: "rejected", kycDecisionNote: "Document expired" });
  });

  it("records a success audit event for the decision", () => {
    decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "approve" }, NOW);

    const events = listAuditEvents(db, { entityType: "customer", entityId: SEED_IDS.maya });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorRole: "kyc_reviewer",
      action: "kyc.approve",
      outcome: "success",
      details: { from: "pending", to: "approved", note: null },
    });
  });

  it.each(["payments_operator", "risk_admin", null] as const)("forbids role %s and audits the denial", (role) => {
    const result = decideKyc(db, role, { customerId: SEED_IDS.maya, decision: "approve" }, NOW);

    expect(result).toMatchObject({ ok: false, code: "forbidden" });
    expect(getCustomer(db, SEED_IDS.maya)?.kycStatus).toBe("pending");
    const [event] = listAuditEvents(db, { entityId: SEED_IDS.maya });
    expect(event).toMatchObject({ actorRole: role, action: "kyc.approve", outcome: "denied", details: { code: "forbidden" } });
  });

  it("blocks invalid transitions on an already-decided customer and audits them", () => {
    const result = decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.jordan, decision: "reject", note: "late" }, NOW);

    expect(result).toEqual({ ok: false, code: "invalid_transition", message: "Cannot change KYC from approved to rejected." });
    expect(getCustomer(db, SEED_IDS.jordan)?.kycStatus).toBe("approved");
    const [event] = listAuditEvents(db, { entityId: SEED_IDS.jordan });
    expect(event).toMatchObject({ action: "kyc.reject", outcome: "denied", details: { code: "invalid_transition" } });
  });

  it("cannot decide the same customer twice", () => {
    decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "approve" }, NOW);
    const second = decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "reject", note: "x" }, NOW);
    expect(second).toMatchObject({ ok: false, code: "invalid_transition" });
  });

  it("validates input server-side", () => {
    expect(decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "reject" }, NOW)).toMatchObject({
      ok: false,
      code: "validation",
      message: "A note is required when rejecting.",
    });
    expect(decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "escalate" }, NOW)).toMatchObject({
      ok: false,
      code: "validation",
    });
    expect(decideKyc(db, "kyc_reviewer", { customerId: "cus_missing", decision: "approve" }, NOW)).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(getCustomer(db, SEED_IDS.maya)?.kycStatus).toBe("pending");
  });

  it("rolls back the state change if the audit write fails", () => {
    db.exec("DROP TABLE audit_events");
    expect(() => decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "approve" }, NOW)).toThrow();
    expect(getCustomer(db, SEED_IDS.maya)?.kycStatus).toBe("pending");
  });
});
