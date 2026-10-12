import { z } from "zod";
import type { Db } from "../db";
import { OperationError, type OperationErrorCode } from "../errors";
import { BLOCK_HIGH_VALUE_REFUNDS, HIGH_VALUE_REFUND_LIMIT_CENTS, PAUSE_REFUND_PROCESSING } from "../feature-flags/definitions";
import { isFeatureEnabled } from "../feature-flags/service";
import { isKycRestricted } from "../kyc/eligibility";
import { getRefund, listRefundsForTransaction, type RefundRow } from "../lookups";
import { runAuditedOperation, type OperationResult } from "../operation";
import { can, type Permission } from "../permissions";
import { ROLE_LABELS, type Role } from "../roles";
import { formatMoney } from "@/lib/format";
import { statusLabel } from "@/lib/labels";

export type RefundBlockCode =
  | "REFUND_NOT_FOUND"
  | "ROLE_NOT_PERMITTED"
  | "ALREADY_REFUNDED"
  | "REFUND_NOT_PENDING"
  | "DUPLICATE_REFUND"
  | "KYC_NOT_APPROVED"
  | "REFUNDS_PAUSED"
  | "AMOUNT_OVER_LIMIT"
  | "ALREADY_CLAIMED"
  | "NOT_CLAIMED";

/** Queue actions that share REFUND_RULES. */
export type RefundAction = "process" | "reject" | "claim";

const ACTION_PERMISSION: Record<RefundAction, Permission> = {
  process: "refund.process",
  reject: "refund.reject",
  claim: "refund.claim",
};

export interface RefundRuleContext {
  db: Db;
  role: Role | null;
  refund: RefundRow;
  action: RefundAction;
  /** Amount that would be paid out (approved amount for a partial refund). */
  payoutCents: number;
}

interface RefundRule {
  code: RefundBlockCode;
  /** Actions the rule applies to. Role + state rules gate every action; money rules gate only process. */
  actions: RefundAction[];
  /** Shown in the eligibility checklist. */
  label: string;
  /** OperationError code used when this rule is the first one that blocks. */
  errorCode: OperationErrorCode;
  /** Returns a human-readable reason when the rule blocks, otherwise null. */
  check: (ctx: RefundRuleContext) => string | null;
}

/**
 * Ordered eligibility rules: the SINGLE place refund processing rules live. Order = error precedence
 * (forbidden → invalid_transition → rule_violation). Extension point: Session 3 appends a RISK_HOLD_ACTIVE
 * rule here (reading risk_holds) — the page, service and audit pick it up automatically.
 */
export const REFUND_RULES: RefundRule[] = [
  {
    code: "ROLE_NOT_PERMITTED",
    actions: ["process", "reject", "claim"],
    label: "Demo role may act on refunds",
    errorCode: "forbidden",
    check: ({ role, action }) =>
      can(role, ACTION_PERMISSION[action]) ? null : `${role ? ROLE_LABELS[role] : "Unknown role"} is not allowed to perform ${ACTION_PERMISSION[action]}.`,
  },
  {
    code: "ALREADY_REFUNDED",
    actions: ["process", "reject", "claim"],
    label: "Refund not already processed",
    errorCode: "invalid_transition",
    check: ({ refund }) => (refund.status === "processed" ? `Refund ${refund.id} was already processed on ${refund.processedAt?.slice(0, 10)}.` : null),
  },
  {
    code: "REFUND_NOT_PENDING",
    actions: ["process", "reject", "claim"],
    label: "Refund is pending",
    errorCode: "invalid_transition",
    check: ({ refund }) => (refund.status === "rejected" ? `Refund ${refund.id} is ${statusLabel(refund.status).toLowerCase()} and read-only.` : null),
  },
  {
    code: "DUPLICATE_REFUND",
    actions: ["process"],
    label: "Transaction not already refunded",
    errorCode: "rule_violation",
    check: ({ db, refund, payoutCents }) => {
      const others = listRefundsForTransaction(db, refund.transactionId).filter((r) => r.id !== refund.id && r.status === "processed");
      if (others.length === 0) return null;
      const refunded = others.reduce((sum, r) => sum + (r.approvedAmountCents ?? r.amountCents), 0);
      const txn = db.prepare("SELECT amount_cents AS a FROM transactions WHERE id = ?").get(refund.transactionId) as { a: number };
      if (refunded + payoutCents <= txn.a) return null;
      return `Transaction ${refund.transactionId} already refunded ${formatMoney(refunded, refund.currency)} (${others.map((r) => r.id).join(", ")}); this refund would exceed the original ${formatMoney(txn.a, refund.currency)}.`;
    },
  },
  {
    code: "KYC_NOT_APPROVED",
    actions: ["process"],
    label: "Customer KYC approved (flag block_refunds_unverified_kyc)",
    errorCode: "rule_violation",
    check: ({ db, refund }) =>
      isKycRestricted(db, refund.customerId)
        ? `${refund.customerName}'s KYC is ${statusLabel(refund.customerKycStatus).toLowerCase()}; refunds are blocked for unverified customers.`
        : null,
  },
  {
    code: "REFUNDS_PAUSED",
    actions: ["process"],
    label: "Refund processing not paused (flag pause_refund_processing)",
    errorCode: "rule_violation",
    check: ({ db }) => (isFeatureEnabled(db, PAUSE_REFUND_PROCESSING) ? "Refund processing is paused by a Risk Admin." : null),
  },
  {
    code: "AMOUNT_OVER_LIMIT",
    actions: ["process"],
    label: `Amount within ${formatMoney(HIGH_VALUE_REFUND_LIMIT_CENTS)} limit (flag block_high_value_refunds)`,
    errorCode: "rule_violation",
    check: ({ db, refund }) =>
      isFeatureEnabled(db, BLOCK_HIGH_VALUE_REFUNDS) && refund.amountCents > HIGH_VALUE_REFUND_LIMIT_CENTS
        ? `${formatMoney(refund.amountCents, refund.currency)} exceeds the ${formatMoney(HIGH_VALUE_REFUND_LIMIT_CENTS)} portal limit; escalate to Risk.`
        : null,
  },
];

export interface RefundCheckResult {
  code: RefundBlockCode;
  label: string;
  passed: boolean;
  message: string | null;
}

export interface RefundEligibility {
  eligible: boolean;
  refund: RefundRow | null;
  /** Every rule's outcome (for the checklist). */
  checks: RefundCheckResult[];
  /** Failed rules only, in precedence order. */
  reasons: { code: RefundBlockCode; message: string }[];
  /** OperationError code of the first failing rule. */
  errorCode: OperationErrorCode | null;
}

/**
 * Evaluates REFUND_RULES for one action. AMOUNT_OVER_LIMIT deliberately checks the *requested* amount, so a
 * partial refund cannot be used to slip a high-value request under the limit.
 */
export function evaluateRefundRules(db: Db, role: Role | null, refundId: string, action: RefundAction, payoutCents?: number): RefundEligibility {
  const refund = getRefund(db, refundId);
  if (!refund) {
    return {
      eligible: false,
      refund: null,
      checks: [],
      reasons: [{ code: "REFUND_NOT_FOUND", message: `Refund ${refundId} not found.` }],
      errorCode: "not_found",
    };
  }
  const rules = REFUND_RULES.filter((r) => r.actions.includes(action));
  const ctx = { db, role, refund, action, payoutCents: payoutCents ?? refund.amountCents };
  const checks = rules.map((rule) => {
    const message = rule.check(ctx);
    return { code: rule.code, label: rule.label, passed: message === null, message };
  });
  const failed = rules.filter((_, i) => !checks[i].passed);
  return {
    eligible: failed.length === 0,
    refund,
    checks,
    reasons: checks.filter((c) => !c.passed).map((c) => ({ code: c.code, message: c.message! })),
    errorCode: failed[0]?.errorCode ?? null,
  };
}

/** The central refund eligibility decision. Used by the Refunds page (buttons, checklist, queue, bulk) and by processRefund. */
export function canProcessRefund(db: Db, role: Role | null, refundId: string, payoutCents?: number): RefundEligibility {
  return evaluateRefundRules(db, role, refundId, "process", payoutCents);
}

/** Reject only needs the role + pending-state rules (flags never block declining a refund). */
export function canRejectRefund(db: Db, role: Role | null, refundId: string): RefundEligibility {
  return evaluateRefundRules(db, role, refundId, "reject");
}

/** Business blockers ignoring the viewer's role (what any permitted operator would hit). */
export function businessBlockers(eligibility: RefundEligibility): RefundBlockCode[] {
  return eligibility.reasons.map((r) => r.code).filter((c) => c !== "ROLE_NOT_PERMITTED");
}

export function formatRefundBlockers(reasons: RefundEligibility["reasons"], verb = "process"): string {
  return `Cannot ${verb} refund: ${reasons.map((r) => `${r.code} — ${r.message}`).join(" ")}`;
}

const requiredNote = (verb: string) =>
  z
    .string({ message: `A note is required to ${verb} a refund.` })
    .trim()
    .min(1, `A note is required to ${verb} a refund.`)
    .max(500, "Note must be 500 characters or fewer.");

/** Optional dollar amount for a partial refund ("" / missing = full amount), parsed to integer cents. */
const partialAmount = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ?? "").trim().replace(/^\$/, "").replace(/,/g, ""))
  .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Refund amount must be a dollar amount like 120 or 120.50.")
  .transform((v) => (v === "" ? null : Math.round(Number(v) * 100)))
  .refine((v) => v === null || v > 0, "Refund amount must be greater than zero.");

export const processRefundSchema = z.object({
  refundId: z.string().trim().min(1, "Refund is required."),
  note: requiredNote("process"),
  amount: partialAmount,
});

export const rejectRefundSchema = z.object({
  refundId: z.string().trim().min(1, "Refund is required."),
  note: requiredNote("reject"),
});

export const claimRefundSchema = z.object({
  refundId: z.string().trim().min(1, "Refund is required."),
  decision: z.enum(["claim", "release"], { message: "Choose claim or release." }),
  assignee: z.string().trim().max(60, "Name must be 60 characters or fewer.").optional().default(""),
  note: z.string().trim().max(500, "Note must be 500 characters or fewer.").optional().default(""),
});

export const bulkProcessSchema = z.object({
  refundIds: z
    .array(z.string().trim().min(1))
    .min(1, "Select at least one refund.")
    .max(50, "Process at most 50 refunds at once.")
    .transform((ids) => [...new Set(ids)]),
  note: requiredNote("process"),
});

const validationError = (issues: z.ZodIssue[]) =>
  new OperationError("validation", issues.map((i) => i.message).join(" "), { reasons: ["VALIDATION"] });

/** Permission first (like decideKyc/toggleFeatureFlag), so a forbidden role is never reported as a validation error. */
function assertRefundPermission(role: Role | null, action: RefundAction): void {
  const permission = ACTION_PERMISSION[action];
  if (!can(role, permission)) {
    const message = `${role ? ROLE_LABELS[role] : "Unknown role"} is not allowed to perform ${permission}.`;
    throw new OperationError("forbidden", formatRefundBlockers([{ code: "ROLE_NOT_PERMITTED", message }], action), {
      reasons: ["ROLE_NOT_PERMITTED"],
    });
  }
}

function throwIfBlocked(eligibility: RefundEligibility, verb: string): RefundRow {
  if (!eligibility.eligible) {
    throw new OperationError(eligibility.errorCode!, formatRefundBlockers(eligibility.reasons, verb), {
      reasons: eligibility.reasons.map((r) => r.code),
    });
  }
  return eligibility.refund!;
}

export function processRefund(db: Db, actorRole: Role | null, rawInput: unknown, now: Date = new Date()): OperationResult {
  const raw = (rawInput ?? {}) as Record<string, unknown>;
  return runAuditedOperation({
    db,
    actorRole,
    action: "refund.process",
    entityType: "refund",
    entityId: typeof raw.refundId === "string" ? raw.refundId : null,
    execute: () => {
      assertRefundPermission(actorRole, "process");
      const parsed = processRefundSchema.safeParse(rawInput);
      if (!parsed.success) throw validationError(parsed.error.issues);
      const { refundId, note, amount } = parsed.data;

      const requested = getRefund(db, refundId);
      if (requested && amount !== null && amount > requested.amountCents) {
        throw new OperationError(
          "validation",
          `Refund amount ${formatMoney(amount, requested.currency)} exceeds the requested ${formatMoney(requested.amountCents, requested.currency)}.`,
          { reasons: ["AMOUNT_EXCEEDS_REQUEST"] },
        );
      }
      const refund = throwIfBlocked(canProcessRefund(db, actorRole, refundId, amount ?? undefined), "process");
      const payoutCents = amount ?? refund.amountCents;
      const partial = payoutCents < refund.amountCents;
      const processedAt = now.toISOString();
      // Guarded transition: only a still-pending refund can be processed (no double processing on races).
      const { changes } = db
        .prepare(
          `UPDATE refunds SET status = 'processed', processed_at = ?, processed_by_role = ?, processing_note = ?, approved_amount_cents = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .run(processedAt, actorRole, note, payoutCents, refund.id);
      if (changes !== 1) {
        throw new OperationError("invalid_transition", `Refund ${refund.id} is no longer pending.`, { reasons: ["ALREADY_REFUNDED"] });
      }
      // UNIQUE(refund_id) makes a second payout impossible even if the guard above were bypassed.
      db.prepare(
        `INSERT INTO refund_payouts (refund_id, customer_id, amount_cents, currency, created_by_role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(refund.id, refund.customerId, payoutCents, refund.currency, actorRole, processedAt);

      return {
        message: partial
          ? `Refund ${refund.id}: partial refund of ${formatMoney(payoutCents, refund.currency)} (of ${formatMoney(refund.amountCents, refund.currency)} requested) processed for ${refund.customerName}.`
          : `Refund ${refund.id} of ${formatMoney(refund.amountCents, refund.currency)} processed for ${refund.customerName}.`,
        details: {
          customerId: refund.customerId,
          transactionId: refund.transactionId,
          amountCents: payoutCents,
          requestedCents: refund.amountCents,
          partial,
          note,
        },
      };
    },
  });
}

export function rejectRefund(db: Db, actorRole: Role | null, rawInput: unknown, now: Date = new Date()): OperationResult {
  const raw = (rawInput ?? {}) as Record<string, unknown>;
  return runAuditedOperation({
    db,
    actorRole,
    action: "refund.reject",
    entityType: "refund",
    entityId: typeof raw.refundId === "string" ? raw.refundId : null,
    execute: () => {
      assertRefundPermission(actorRole, "reject");
      const parsed = rejectRefundSchema.safeParse(rawInput);
      if (!parsed.success) throw validationError(parsed.error.issues);
      const refund = throwIfBlocked(canRejectRefund(db, actorRole, parsed.data.refundId), "reject");
      const { changes } = db
        .prepare(
          `UPDATE refunds SET status = 'rejected', processed_at = ?, processed_by_role = ?, processing_note = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .run(now.toISOString(), actorRole, parsed.data.note, refund.id);
      if (changes !== 1) throw new OperationError("invalid_transition", `Refund ${refund.id} is no longer pending.`, { reasons: ["REFUND_NOT_PENDING"] });
      return {
        message: `Refund ${refund.id} of ${formatMoney(refund.amountCents, refund.currency)} rejected for ${refund.customerName}. No money moved.`,
        details: { customerId: refund.customerId, amountCents: refund.amountCents, note: parsed.data.note },
      };
    },
  });
}

/**
 * Claim/release a pending refund. Coordination only: demo roles carry no user identity, so a claim records a
 * name and is shown in the queue, but does not block other operators from processing.
 */
export function claimRefund(db: Db, actorRole: Role | null, rawInput: unknown, now: Date = new Date()): OperationResult {
  const raw = (rawInput ?? {}) as Record<string, unknown>;
  return runAuditedOperation({
    db,
    actorRole,
    action: raw.decision === "release" ? "refund.release" : "refund.claim",
    entityType: "refund",
    entityId: typeof raw.refundId === "string" ? raw.refundId : null,
    execute: () => {
      assertRefundPermission(actorRole, "claim");
      const parsed = claimRefundSchema.safeParse(rawInput);
      if (!parsed.success) throw validationError(parsed.error.issues);
      const { refundId, decision, assignee, note } = parsed.data;
      const refund = throwIfBlocked(evaluateRefundRules(db, actorRole, refundId, "claim"), decision);
      if (decision === "claim") {
        if (assignee.length < 2) throw new OperationError("validation", "Enter your name (2+ characters) to claim a refund.", { reasons: ["VALIDATION"] });
        if (refund.assignedTo) {
          throw new OperationError("invalid_transition", `Refund ${refund.id} is already claimed by ${refund.assignedTo}; release it first.`, {
            reasons: ["ALREADY_CLAIMED"],
          });
        }
        const { changes } = db
          .prepare(`UPDATE refunds SET assigned_to = ?, assigned_at = ? WHERE id = ? AND status = 'pending' AND assigned_to IS NULL`)
          .run(assignee, now.toISOString(), refund.id);
        if (changes !== 1) throw new OperationError("invalid_transition", `Refund ${refund.id} was just claimed by someone else.`, { reasons: ["ALREADY_CLAIMED"] });
        return { message: `Refund ${refund.id} claimed by ${assignee}.`, details: { assignee, note } };
      }
      if (!refund.assignedTo) throw new OperationError("invalid_transition", `Refund ${refund.id} is not claimed.`, { reasons: ["NOT_CLAIMED"] });
      db.prepare(`UPDATE refunds SET assigned_to = NULL, assigned_at = NULL WHERE id = ? AND status = 'pending'`).run(refund.id);
      return { message: `Refund ${refund.id} released by ${refund.assignedTo}.`, details: { previousAssignee: refund.assignedTo, note } };
    },
  });
}

export interface BulkProcessOutcome {
  processed: string[];
  blocked: { refundId: string; code: OperationErrorCode; message: string }[];
}

/**
 * Processes several refunds. Each refund goes through processRefund (its own savepoint + success/denied audit),
 * so one blocked refund never stops or rolls back the others; a refund.bulk_process audit row summarises the batch.
 */
export function bulkProcessRefunds(db: Db, actorRole: Role | null, rawInput: unknown, now: Date = new Date()): OperationResult & { outcome?: BulkProcessOutcome } {
  let outcome: BulkProcessOutcome | undefined;
  const result = runAuditedOperation({
    db,
    actorRole,
    action: "refund.bulk_process",
    entityType: "refund_batch",
    entityId: null,
    execute: () => {
      assertRefundPermission(actorRole, "process");
      const parsed = bulkProcessSchema.safeParse(rawInput);
      if (!parsed.success) throw validationError(parsed.error.issues);
      const { refundIds, note } = parsed.data;
      const o: BulkProcessOutcome = { processed: [], blocked: [] };
      for (const refundId of refundIds) {
        const r = processRefund(db, actorRole, { refundId, note }, now);
        if (r.ok) o.processed.push(refundId);
        else o.blocked.push({ refundId, code: r.code, message: r.message });
      }
      outcome = o;
      const blockedText = o.blocked.length ? ` Blocked: ${o.blocked.map((b) => b.refundId).join(", ")} (see each refund's audit for reasons).` : "";
      return {
        message: `Bulk process: ${o.processed.length} of ${refundIds.length} refunds processed.${blockedText}`,
        details: { processed: o.processed, blocked: o.blocked.map((b) => ({ refundId: b.refundId, code: b.code })), note },
      };
    },
  });
  if (result.ok && outcome && outcome.processed.length === 0) {
    return { ok: false, code: "rule_violation", message: result.message, outcome };
  }
  return { ...result, outcome };
}
