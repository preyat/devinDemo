import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents } from "@/server/audit";
import { openDb, resetDb, type Db } from "@/server/db";
import { assertResettableDemoDb, DemoResetRefusedError } from "@/server/demo-guard";
import { ACCOUNT_RISK_HOLD_MESSAGE } from "@/server/fraud/holds";
import { FRAUD_SEED_CASES } from "@/server/fraud/seed-data";
import { decideFraudAlert, dismissFraudAlert, escalateFraudAlert } from "@/server/fraud/service";
import {
  getActiveRiskHold,
  getCustomer,
  getFraudAlert,
  getRefund,
  getTransaction,
  listFraudAlertDecisions,
  listFraudSignals,
  listRefundsForCustomer,
  parseFraudAlertQuery,
  searchFraudAlerts,
} from "@/server/lookups";
import { canProcessRefund, canRejectRefund, processRefund } from "@/server/refunds/service";
import { SEED_IDS } from "@/server/seed";
import { createTestDb } from "./helpers";

const NOW = new Date("2026-02-01T12:00:00.000Z");
const ALEX_ALERT = "alert_alex_4500";
const ALEX_REFUND = "ref_alex_350";
const note = "Customer confirmed they did not make this transfer.";
const fraudAudit = (db: Db, id: string) => listAuditEvents(db, { entityType: "fraud_alert", entityId: id });
const holdCount = (db: Db) => (db.prepare("SELECT COUNT(*) AS c FROM risk_holds").get() as { c: number }).c;
const snapshot = (db: Db) => ({
  alerts: db.prepare("SELECT id, status, updated_at FROM fraud_alerts ORDER BY id").all(),
  holds: db.prepare("SELECT * FROM risk_holds ORDER BY id").all(),
  decisions: db.prepare("SELECT COUNT(*) AS c FROM fraud_alert_decisions").get(),
  refunds: db.prepare("SELECT id, status FROM refunds ORDER BY id").all(),
});
const refundCodes = (db: Db, id: string) => canProcessRefund(db, "payments_operator", id).reasons.map((r) => r.code);

let db: Db;
beforeEach(() => {
  db = createTestDb();
});
afterEach(() => db.close());

describe("fraud seed", () => {
  it("seeds the five required linked cases with valid relationships and simulated signals", () => {
    const rows = searchFraudAlerts(db, parseFraudAlertQuery({ status: "all", pageSize: "50" })).rows;
    expect(rows.map((r) => [r.customerName, r.severity, r.status]).sort()).toEqual([
      ["Alex Kim", "high", "open"],
      ["Jamie Patel", "medium", "open"],
      ["Maya Chen", "high", "open"],
      ["Priya Shah", "high", "escalated"],
      ["Sam Taylor", "low", "open"],
    ]);
    for (const r of rows) {
      const txn = getTransaction(db, r.transactionId)!;
      expect(txn.customerId).toBe(r.customerId);
      expect(getCustomer(db, r.customerId)!.kycStatus).toBe("approved");
      expect(r.reason.length).toBeGreaterThan(40);
      expect(r.createdAt >= txn.createdAt).toBe(true);
      const signals = listFraudSignals(db, r.id);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every((s) => s.source === "simulated")).toBe(true);
      expect(listFraudAlertDecisions(db, r.id).at(-1)).toMatchObject({ decision: "open", decidedByRole: "system" });
    }
    for (const r of listRefundsForCustomer(db, SEED_IDS.mayaChen)) expect(getTransaction(db, r.transactionId)!.customerId).toBe(SEED_IDS.mayaChen);
    expect(FRAUD_SEED_CASES).toHaveLength(5);
  });

  it("preserves the Alex Kim fixture: approved, $4,500 txn, eligible pending $350 refund, HIGH OPEN alert, no hold", () => {
    const alert = getFraudAlert(db, ALEX_ALERT)!;
    expect(alert).toMatchObject({ customerId: SEED_IDS.alex, transactionId: "txn_alex_4500", amountCents: 450000, severity: "high", status: "open" });
    expect(listFraudSignals(db, ALEX_ALERT).map((s) => s.code)).toEqual(expect.arrayContaining(["NEW_DEVICE", "UNUSUAL_LOCATION"]));
    expect(getCustomer(db, SEED_IDS.alex)!.kycStatus).toBe("approved");
    expect(getRefund(db, ALEX_REFUND)).toMatchObject({ amountCents: 35000, status: "pending" });
    expect(getActiveRiskHold(db, SEED_IDS.alex)).toBeNull();
    expect(canProcessRefund(db, "payments_operator", ALEX_REFUND).eligible).toBe(true);
  });

  it("seeds Priya Shah as escalated with an active hold, decision history and audit event", () => {
    expect(getActiveRiskHold(db, SEED_IDS.priyaShah)).toMatchObject({ id: "hold_priya_2750", alertId: "alert_priya_2750", createdByRole: "risk_admin" });
    expect(listFraudAlertDecisions(db, "alert_priya_2750").map((d) => d.decision)).toEqual(["escalate", "open"]);
    expect(fraudAudit(db, "alert_priya_2750")).toMatchObject([{ action: "fraud_alert.escalate", outcome: "success", details: { holdId: "hold_priya_2750" } }]);
    expect(refundCodes(db, "ref_priya_shah_120")).toEqual(["ACCOUNT_RISK_HOLD"]);
  });
});

describe("Escalate & Hold", () => {
  it("transitions OPEN → ESCALATED, places a hold and audits atomically", () => {
    const res = escalateFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note }, NOW);
    expect(res).toMatchObject({ ok: true });
    expect(getFraudAlert(db, ALEX_ALERT)).toMatchObject({ status: "escalated", updatedAt: NOW.toISOString() });
    expect(getActiveRiskHold(db, SEED_IDS.alex)).toMatchObject({
      id: "hold_alex_4500", alertId: ALEX_ALERT, transactionId: "txn_alex_4500", reason: note, createdByRole: "risk_admin", createdAt: NOW.toISOString(),
    });
    expect(listFraudAlertDecisions(db, ALEX_ALERT)[0]).toMatchObject({ decision: "escalate", fromStatus: "open", toStatus: "escalated", note });
    expect(fraudAudit(db, ALEX_ALERT)).toMatchObject([
      {
        action: "fraud_alert.escalate", outcome: "success", actorRole: "risk_admin", occurredAt: NOW.toISOString(),
        details: { customerId: SEED_IDS.alex, transactionId: "txn_alex_4500", fromStatus: "open", toStatus: "escalated", holdId: "hold_alex_4500", reason: note },
      },
    ]);
  });

  it("blocks Alex's refund with ACCOUNT_RISK_HOLD across the central eligibility service; refund stays pending", () => {
    expect(refundCodes(db, ALEX_REFUND)).toEqual([]);
    escalateFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note }, NOW);
    const eligibility = canProcessRefund(db, "payments_operator", ALEX_REFUND);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.errorCode).toBe("rule_violation");
    expect(eligibility.reasons).toEqual([{ code: "ACCOUNT_RISK_HOLD", message: expect.stringContaining(ACCOUNT_RISK_HOLD_MESSAGE) }]);

    const res = processRefund(db, "payments_operator", { refundId: ALEX_REFUND, note: "Duplicate confirmed" }, NOW);
    expect(res).toMatchObject({ ok: false, code: "rule_violation", message: expect.stringContaining(ACCOUNT_RISK_HOLD_MESSAGE) });
    expect(getRefund(db, ALEX_REFUND)!.status).toBe("pending");
    expect(listAuditEvents(db, { entityType: "refund", entityId: ALEX_REFUND })).toMatchObject([
      { action: "refund.process", outcome: "denied", details: { code: "rule_violation", reasons: ["ACCOUNT_RISK_HOLD"] } },
    ]);
    // The hold pauses processing only; rejecting a refund is still allowed.
    expect(canRejectRefund(db, "payments_operator", ALEX_REFUND).eligible).toBe(true);
  });

  it("rejects a duplicate escalation without mutating state", () => {
    escalateFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note }, NOW);
    const before = snapshot(db);
    expect(escalateFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note }, NOW)).toMatchObject({
      ok: false, code: "invalid_transition", message: expect.stringContaining("DUPLICATE_ESCALATION"),
    });
    expect(snapshot(db)).toEqual(before);
    expect(fraudAudit(db, ALEX_ALERT)[0]).toMatchObject({ outcome: "denied", details: { code: "invalid_transition", reasons: ["DUPLICATE_ESCALATION"] } });
  });

  it("rolls back the transition and hold if the audit write fails", () => {
    db.exec("DROP TABLE audit_events");
    expect(() => escalateFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note }, NOW)).toThrow();
    expect(getFraudAlert(db, ALEX_ALERT)!.status).toBe("open");
    expect(getActiveRiskHold(db, SEED_IDS.alex)).toBeNull();
    expect(listFraudAlertDecisions(db, ALEX_ALERT)).toHaveLength(1);
  });
});

describe("Dismiss", () => {
  it("transitions OPEN → DISMISSED with no hold and never blocks refunds", () => {
    const holds = holdCount(db);
    expect(dismissFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note: "Customer was travelling; confirmed by phone." }, NOW)).toMatchObject({ ok: true });
    expect(getFraudAlert(db, ALEX_ALERT)!.status).toBe("dismissed");
    expect(holdCount(db)).toBe(holds);
    expect(getActiveRiskHold(db, SEED_IDS.alex)).toBeNull();
    expect(canProcessRefund(db, "payments_operator", ALEX_REFUND).eligible).toBe(true);
    expect(fraudAudit(db, ALEX_ALERT)[0]).toMatchObject({ action: "fraud_alert.dismiss", outcome: "success", details: { toStatus: "dismissed", holdId: null } });
    expect(processRefund(db, "payments_operator", { refundId: ALEX_REFUND, note: "Duplicate confirmed" }, NOW)).toMatchObject({ ok: true });
  });

  it("rejects dismissing a decided alert (invalid transition) without mutating state", () => {
    dismissFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note }, NOW);
    const before = snapshot(db);
    expect(dismissFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note }, NOW)).toMatchObject({ code: "invalid_transition", message: expect.stringContaining("INVALID_ALERT_TRANSITION") });
    expect(escalateFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note }, NOW)).toMatchObject({ code: "invalid_transition", message: expect.stringContaining("INVALID_ALERT_TRANSITION") });
    expect(dismissFraudAlert(db, "risk_admin", { alertId: "alert_priya_2750", note }, NOW)).toMatchObject({ code: "invalid_transition" });
    expect(snapshot(db)).toEqual(before);
  });
});

describe("permissions and validation", () => {
  it.each([["payments_operator"], ["kyc_reviewer"], [null]] as const)("forbids %s and audits the denial without mutating", (role) => {
    const before = snapshot(db);
    for (const decide of [dismissFraudAlert, escalateFraudAlert]) {
      expect(decide(db, role, { alertId: ALEX_ALERT, note }, NOW)).toMatchObject({ ok: false, code: "forbidden", message: expect.stringContaining("ROLE_NOT_PERMITTED") });
    }
    expect(snapshot(db)).toEqual(before);
    expect(fraudAudit(db, ALEX_ALERT).map((e) => [e.action, e.outcome, e.actorRole, e.details?.code])).toEqual([
      ["fraud_alert.escalate", "denied", role, "forbidden"],
      ["fraud_alert.dismiss", "denied", role, "forbidden"],
    ]);
  });

  it("checks permission before validation", () => {
    expect(escalateFraudAlert(db, "payments_operator", { alertId: ALEX_ALERT, note: "" }, NOW)).toMatchObject({ code: "forbidden" });
  });

  it("requires an investigation reason and a known alert/decision", () => {
    const before = snapshot(db);
    expect(escalateFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note: "   " }, NOW)).toMatchObject({ code: "validation", message: expect.stringContaining("investigation reason") });
    expect(dismissFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, note: undefined }, NOW)).toMatchObject({ code: "validation" });
    expect(decideFraudAlert(db, "risk_admin", { alertId: ALEX_ALERT, decision: "release", note }, NOW)).toMatchObject({ code: "validation" });
    expect(escalateFraudAlert(db, "risk_admin", { alertId: "alert_missing", note }, NOW)).toMatchObject({ code: "not_found" });
    expect(snapshot(db)).toEqual(before);
    expect(fraudAudit(db, ALEX_ALERT)[0]).toMatchObject({ outcome: "denied", details: { code: "validation", reasons: ["VALIDATION"] } });
  });
});

describe("queue filters", () => {
  it("filters by severity and status", () => {
    const names = (raw: Record<string, string>) => searchFraudAlerts(db, parseFraudAlertQuery(raw)).rows.map((r) => r.customerName);
    expect(names({ severity: "high", status: "open" }).sort()).toEqual(["Alex Kim", "Maya Chen"]);
    expect(names({ status: "escalated" })).toEqual(["Priya Shah"]);
    expect(names({ severity: "low" })).toEqual(["Sam Taylor"]);
  });
});

describe("demo reset guard", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "demo-guard-"));
  const demoPath = path.join(tmp, "portal.db");
  const env = { ...process.env };
  beforeEach(() => {
    process.env.DEMO_DB_PATH = demoPath;
    delete process.env.PORTAL_ENV;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("resets only the designated demo database and restores the initial fraud state", () => {
    const file = openDb(demoPath);
    expect(() => assertResettableDemoDb(file, demoPath)).not.toThrow(); // brand-new empty file
    resetDb(file);
    escalateFraudAlert(file, "risk_admin", { alertId: ALEX_ALERT, note }, NOW);
    expect(() => assertResettableDemoDb(file, demoPath)).not.toThrow();
    resetDb(file);
    expect(getFraudAlert(file, ALEX_ALERT)!.status).toBe("open");
    expect(getActiveRiskHold(file, SEED_IDS.alex)).toBeNull();
    expect(canProcessRefund(file, "payments_operator", ALEX_REFUND).eligible).toBe(true);
    file.close();
  });

  it("refuses production, non-designated paths and databases not marked as demo", () => {
    const other = path.join(tmp, "prod.db");
    const prod = openDb(other);
    expect(() => assertResettableDemoDb(prod, other)).toThrow(DemoResetRefusedError);
    prod.close();

    const demo = openDb(demoPath);
    resetDb(demo);
    process.env.PORTAL_ENV = "production";
    expect(() => assertResettableDemoDb(demo, demoPath)).toThrow(/PORTAL_ENV=production/);
    delete process.env.PORTAL_ENV;
    demo.prepare("UPDATE portal_meta SET value = 'production' WHERE key = 'environment'").run();
    expect(() => assertResettableDemoDb(demo, demoPath)).toThrow(/environment=production/);
    demo.close();
  });
});
