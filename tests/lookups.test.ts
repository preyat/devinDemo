import { describe, expect, it } from "vitest";
import { decideKyc } from "@/server/kyc/service";
import { getCustomerQueueNeighbours, parseCustomerQuery, searchCustomers } from "@/server/lookups";
import { createTestDb } from "./helpers";

describe("getCustomerQueueNeighbours", () => {
  it("follows the queue's filters and sort", () => {
    const db = createTestDb();
    const query = parseCustomerQuery({ status: "pending", pageSize: "50" });
    const ids = searchCustomers(db, query).rows.map((c) => c.id);
    const idx = ids.indexOf("cus_maya_reed");
    expect(idx).toBeGreaterThan(0);
    expect(getCustomerQueueNeighbours(db, query, "cus_maya_reed")).toEqual({
      position: idx + 1,
      total: ids.length,
      prevId: ids[idx - 1],
      nextId: ids[idx + 1],
    });
    expect(getCustomerQueueNeighbours(db, query, ids[0]).prevId).toBeNull();
    expect(getCustomerQueueNeighbours(db, query, ids.at(-1)!).nextId).toBeNull();
  });

  it("offers the first remaining case once the current one drops out of the filter", () => {
    const db = createTestDb();
    const query = parseCustomerQuery({ status: "pending" });
    expect(decideKyc(db, "kyc_reviewer", { customerId: "cus_maya_reed", decision: "approve", note: "Verified." }).ok).toBe(true);
    const remaining = searchCustomers(db, query);
    const nav = getCustomerQueueNeighbours(db, query, "cus_maya_reed");
    expect(nav).toMatchObject({ position: null, prevId: null, total: remaining.total, nextId: remaining.rows[0].id });
  });
});
