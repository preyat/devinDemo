import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents } from "@/server/audit";
import type { Db } from "@/server/db";
import { BLOCK_REFUNDS_UNVERIFIED_KYC, FEATURE_FLAGS } from "@/server/feature-flags/definitions";
import { allowedFlagDecisions, isFeatureEnabled, toggleFeatureFlag } from "@/server/feature-flags/service";
import { getFeatureFlag, listFeatureFlags } from "@/server/lookups";
import { canProcessRefund } from "@/server/refunds/service";
import { createTestDb } from "./helpers";

const NOW = new Date("2026-02-01T12:00:00.000Z");
const enable = (key = BLOCK_REFUNDS_UNVERIFIED_KYC, note = "Compliance memo 2026-02") => ({ key, decision: "enable", note });

describe("Feature flag administration", () => {
  let db: Db;
  beforeEach(() => (db = createTestDb()));
  afterEach(() => db.close());

  it("seeds every defined flag with its default state", () => {
    expect(listFeatureFlags(db).map((f) => [f.key, f.enabled])).toEqual(
      FEATURE_FLAGS.map((f) => [f.key, f.seedEnabled]).sort(([a], [b]) => String(a).localeCompare(String(b))),
    );
    expect(isFeatureEnabled(db, BLOCK_REFUNDS_UNVERIFIED_KYC)).toBe(false);
  });

  it("Risk Admin turns block_refunds_unverified_kyc ON: persisted, audited, and immediately enforced in Refunds", () => {
    expect(canProcessRefund(db, "payments_operator", "ref_maya_750").eligible).toBe(true);

    expect(toggleFeatureFlag(db, "risk_admin", enable(), NOW)).toEqual({ ok: true, message: "Feature flag block_refunds_unverified_kyc turned ON." });
    expect(getFeatureFlag(db, BLOCK_REFUNDS_UNVERIFIED_KYC)).toMatchObject({ enabled: true, updatedAt: NOW.toISOString(), updatedByRole: "risk_admin" });
    expect(listAuditEvents(db, { entityType: "feature_flag", entityId: BLOCK_REFUNDS_UNVERIFIED_KYC })[0]).toMatchObject({
      outcome: "success",
      action: "feature_flag.enable",
      details: { from: false, to: true, note: "Compliance memo 2026-02" },
    });
    expect(canProcessRefund(db, "payments_operator", "ref_maya_750").reasons.map((r) => r.code)).toEqual(["KYC_NOT_APPROVED"]);
  });

  it.each(["payments_operator", "kyc_reviewer", null] as const)("rejects role %s without changing the flag", (role) => {
    expect(toggleFeatureFlag(db, role, enable(), NOW)).toMatchObject({ ok: false, code: "forbidden" });
    expect(getFeatureFlag(db, BLOCK_REFUNDS_UNVERIFIED_KYC)).toMatchObject({ enabled: false, updatedByRole: null });
    expect(listAuditEvents(db, { entityType: "feature_flag" })[0]).toMatchObject({ outcome: "denied", actorRole: role, action: "feature_flag.enable" });
  });

  it("rejects no-op changes, unknown flags and missing reasons", () => {
    expect(toggleFeatureFlag(db, "risk_admin", { ...enable(), decision: "disable" }, NOW)).toMatchObject({ ok: false, code: "invalid_transition" });
    expect(toggleFeatureFlag(db, "risk_admin", enable("made_up_flag"), NOW)).toMatchObject({ ok: false, code: "validation" });
    expect(toggleFeatureFlag(db, "risk_admin", enable(BLOCK_REFUNDS_UNVERIFIED_KYC, " "), NOW)).toMatchObject({ ok: false, code: "validation" });
    expect(getFeatureFlag(db, BLOCK_REFUNDS_UNVERIFIED_KYC)?.enabled).toBe(false);
  });

  it("offers only the opposite of the current state", () => {
    expect(allowedFlagDecisions(false)).toEqual(["enable"]);
    expect(allowedFlagDecisions(true)).toEqual(["disable"]);
  });
});
