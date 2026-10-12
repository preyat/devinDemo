import { z } from "zod";
import type { Db } from "../db";
import { OperationError } from "../errors";
import { getFraudAlert, type FraudAlertStatus } from "../lookups";
import { runAuditedOperation, type OperationResult } from "../operation";
import { can, type Permission } from "../permissions";
import { ROLE_LABELS, type Role } from "../roles";
import { formatMoney } from "@/lib/format";

export const FRAUD_DECISIONS = ["dismiss", "escalate"] as const;
export type FraudDecision = (typeof FRAUD_DECISIONS)[number];

export type FraudBlockCode = "ROLE_NOT_PERMITTED" | "VALIDATION" | "ALERT_NOT_FOUND" | "INVALID_ALERT_TRANSITION" | "DUPLICATE_ESCALATION";

const DECISION_TARGET: Record<FraudDecision, FraudAlertStatus> = { dismiss: "dismissed", escalate: "escalated" };
const DECISION_PERMISSION: Record<FraudDecision, Permission> = { dismiss: "fraud_alert.dismiss", escalate: "fraud_alert.escalate" };

// Allowed alert transitions. dismissed/escalated are final (hold release is out of scope).
export const FRAUD_ALERT_TRANSITIONS: Record<FraudAlertStatus, FraudAlertStatus[]> = {
  open: ["dismissed", "escalated"],
  dismissed: [],
  escalated: [],
};

/** Decisions the current status allows. Used by the alert page and enforced by decideFraudAlert. */
export function allowedFraudDecisions(status: FraudAlertStatus): FraudDecision[] {
  return FRAUD_DECISIONS.filter((d) => FRAUD_ALERT_TRANSITIONS[status].includes(DECISION_TARGET[d]));
}

/** Hold id for an escalated alert (one hold per alert, enforced by UNIQUE(risk_holds.alert_id)). */
export const holdIdFor = (alertId: string) => `hold_${alertId.replace(/^alert_/, "")}`;

export const fraudDecisionSchema = z.object({
  alertId: z.string().trim().min(1, "Alert is required."),
  decision: z.enum(FRAUD_DECISIONS, { message: "Decision must be dismiss or escalate." }),
  note: z
    .string({ message: "An investigation reason is required." })
    .trim()
    .min(1, "An investigation reason is required.")
    .max(500, "Reason must be 500 characters or fewer."),
});

const fail = (code: ConstructorParameters<typeof OperationError>[0], reason: FraudBlockCode, message: string, extra: Record<string, unknown> = {}) =>
  new OperationError(code, `${reason} — ${message}`, { reasons: [reason], ...extra });

/**
 * Dismiss (OPEN → DISMISSED, no hold) or Escalate & Hold (OPEN → ESCALATED + active account risk hold).
 * Transition, hold, history row and audit event commit in ONE transaction (runAuditedOperation).
 */
export function decideFraudAlert(db: Db, actorRole: Role | null, rawInput: unknown, now: Date = new Date()): OperationResult {
  const raw = (rawInput ?? {}) as Record<string, unknown>;
  const decision = (FRAUD_DECISIONS as readonly unknown[]).includes(raw.decision) ? (raw.decision as FraudDecision) : null;
  return runAuditedOperation({
    db,
    actorRole,
    action: decision ? `fraud_alert.${decision}` : "fraud_alert.decide",
    entityType: "fraud_alert",
    entityId: typeof raw.alertId === "string" ? raw.alertId : null,
    now,
    execute: () => {
      // Permission before validation so a forbidden role is never reported as VALIDATION.
      const permission = decision ? DECISION_PERMISSION[decision] : "fraud_alert.escalate";
      if (!can(actorRole, permission)) {
        throw fail("forbidden", "ROLE_NOT_PERMITTED", `${actorRole ? ROLE_LABELS[actorRole] : "Unknown role"} is not allowed to perform ${permission}. Only Risk Admins may make fraud decisions.`);
      }
      const parsed = fraudDecisionSchema.safeParse(rawInput);
      if (!parsed.success) throw fail("validation", "VALIDATION", parsed.error.issues.map((i) => i.message).join(" "));
      const { alertId, note } = parsed.data;
      const target = DECISION_TARGET[parsed.data.decision];

      const alert = getFraudAlert(db, alertId);
      if (!alert) throw fail("not_found", "ALERT_NOT_FOUND", `Fraud alert ${alertId} not found.`);
      const context = { customerId: alert.customerId, transactionId: alert.transactionId, fromStatus: alert.status };
      if (!allowedFraudDecisions(alert.status).includes(parsed.data.decision)) {
        if (parsed.data.decision === "escalate" && alert.status === "escalated") {
          throw fail("invalid_transition", "DUPLICATE_ESCALATION", `Alert ${alert.id} is already escalated; ${alert.customerName}'s account already has a risk hold.`, context);
        }
        throw fail("invalid_transition", "INVALID_ALERT_TRANSITION", `Alert ${alert.id} is ${alert.status}; only open alerts can be dismissed or escalated.`, context);
      }

      const at = now.toISOString();
      // Guarded transition: a concurrent decision on the same alert changes 0 rows and is rejected.
      const { changes } = db.prepare(`UPDATE fraud_alerts SET status = ?, updated_at = ? WHERE id = ? AND status = 'open'`).run(target, at, alert.id);
      if (changes !== 1) {
        const code = parsed.data.decision === "escalate" ? "DUPLICATE_ESCALATION" : "INVALID_ALERT_TRANSITION";
        throw fail("invalid_transition", code, `Alert ${alert.id} is no longer open.`, context);
      }

      let holdId: string | null = null;
      if (target === "escalated") {
        holdId = holdIdFor(alert.id);
        db.prepare(
          `INSERT INTO risk_holds (id, alert_id, transaction_id, customer_id, status, reason, created_by_role, created_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
        ).run(holdId, alert.id, alert.transactionId, alert.customerId, note, actorRole, at);
      }
      db.prepare(
        `INSERT INTO fraud_alert_decisions (alert_id, decision, from_status, to_status, note, decided_by_role, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(alert.id, parsed.data.decision, alert.status, target, note, actorRole, at);

      const amount = formatMoney(alert.amountCents, alert.currency);
      return {
        message:
          target === "escalated"
            ? `Alert ${alert.id} escalated. Account risk hold ${holdId} placed on ${alert.customerName}; refund processing is paused.`
            : `Alert ${alert.id} dismissed for ${alert.customerName} (${amount}). No account hold created.`,
        details: { ...context, toStatus: target, holdId, reason: note, amountCents: alert.amountCents, severity: alert.severity },
      };
    },
  });
}

export const dismissFraudAlert = (db: Db, role: Role | null, input: { alertId: unknown; note: unknown }, now?: Date) =>
  decideFraudAlert(db, role, { ...input, decision: "dismiss" }, now);

export const escalateFraudAlert = (db: Db, role: Role | null, input: { alertId: unknown; note: unknown }, now?: Date) =>
  decideFraudAlert(db, role, { ...input, decision: "escalate" }, now);
