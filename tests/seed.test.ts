import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { getCustomer, listRefundsForCustomer, listTransactionsForCustomer } from "@/server/lookups";
import { KYC_RESTRICTION_FLAG, SEED_IDS } from "@/server/seed";
import { createTestDb } from "./helpers";

describe("seed data", () => {
  let db: Db;
  beforeEach(() => (db = createTestDb()));
  afterEach(() => db.close());

  it("seeds the three synthetic customers with expected KYC status", () => {
    expect(getCustomer(db, SEED_IDS.maya)?.kycStatus).toBe("pending");
    expect(getCustomer(db, SEED_IDS.jordan)?.kycStatus).toBe("approved");
    expect(getCustomer(db, SEED_IDS.alex)?.kycStatus).toBe("approved");
  });

  it("seeds refunds and transactions", () => {
    expect(listRefundsForCustomer(db, SEED_IDS.maya).map((r) => [r.amountCents, r.status])).toEqual([[75000, "pending"]]);
    expect(listRefundsForCustomer(db, SEED_IDS.jordan).map((r) => [r.amountCents, r.status])).toEqual([[42000, "processed"]]);
    expect(listRefundsForCustomer(db, SEED_IDS.alex).map((r) => [r.amountCents, r.status])).toEqual([[35000, "pending"]]);
    expect(listTransactionsForCustomer(db, SEED_IDS.alex).map((t) => t.amountCents)).toContain(450000);
  });

  it("starts with KYC restriction OFF, no risk holds and an empty audit log", () => {
    const flag = db.prepare("SELECT enabled FROM feature_flags WHERE key = ?").get(KYC_RESTRICTION_FLAG) as { enabled: number };
    expect(flag.enabled).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS c FROM risk_holds").get()).toEqual({ c: 0 });
    expect(db.prepare("SELECT COUNT(*) AS c FROM audit_events").get()).toEqual({ c: 0 });
  });
});
