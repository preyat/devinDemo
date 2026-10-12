import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { isKycRestricted } from "@/server/kyc/eligibility";
import { decideKyc } from "@/server/kyc/service";
import { BLOCK_REFUNDS_UNVERIFIED_KYC } from "@/server/feature-flags/definitions";
import { SEED_IDS } from "@/server/seed";
import { createTestDb } from "./helpers";

describe("isKycRestricted (shared gate for refunds)", () => {
  let db: Db;
  beforeEach(() => (db = createTestDb()));
  afterEach(() => db.close());
  const setFlag = (on: boolean) => db.prepare("UPDATE feature_flags SET enabled = ? WHERE key = ?").run(on ? 1 : 0, BLOCK_REFUNDS_UNVERIFIED_KYC);

  it("restricts nobody while the flag is OFF", () => {
    expect(isKycRestricted(db, SEED_IDS.maya)).toBe(false);
    expect(isKycRestricted(db, SEED_IDS.liam)).toBe(false);
  });

  it("uses the CURRENT KYC status when the flag is ON", () => {
    setFlag(true);
    expect(isKycRestricted(db, SEED_IDS.alex)).toBe(false);
    expect(isKycRestricted(db, SEED_IDS.maya)).toBe(true);
    expect(isKycRestricted(db, SEED_IDS.liam)).toBe(true); // info_requested counts as unapproved

    decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.maya, decision: "approve", note: "verified" });
    expect(isKycRestricted(db, SEED_IDS.maya)).toBe(false);

    decideKyc(db, "kyc_reviewer", { customerId: SEED_IDS.samira, decision: "request_info", note: "address proof" });
    expect(isKycRestricted(db, SEED_IDS.samira)).toBe(true);
  });
});
