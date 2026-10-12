import { z } from "zod";
import type { Db } from "../db";
import { OperationError, type OperationErrorCode } from "../errors";
import { BLOCK_HIGH_VALUE_REFUNDS, HIGH_VALUE_REFUND_LIMIT_CENTS, PAUSE_REFUND_PROCESSING } from "../feature-flags/definitions";
import { isFeatureEnabled } from "../feature-flags/service";
import { isKycRestricted } from "../kyc/eligibility";
import { getRefund, listRefundsForTransaction, type RefundRow } from "../lookups";
import { runAuditedOperation, type OperationResult } from "../operation";
import { can } from "../permissions";
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
  | "AMOUNT_OVER_LIMIT";

export interface RefundRuleContext {
  db: Db;
  role: Role | null;
  refund: RefundRow;
}

interface RefundRule {
  code: RefundBlockCode;
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
    label: "Demo role may process refunds",
    errorCode: "forbidden",
    check: ({ role }) =>
      can(role, "refund.process") ? null : `${role ? ROLE_LABELS[role] : "Unknown role"} is not allowed to perform refund.process.`,
  },
  {
    code: "ALREADY_REFUNDED",
    label: "Refund not already processed",
    errorCode: "invalid_transition",
    check: ({ refund }) => (refund.status === "processed" ? `Refund ${refund.id} was already processed on ${refund.processedAt?.slice(0, 10)}.` : null),
  },
  {
    code: "REFUND_NOT_PENDING",
    label: "Refund is pending",
    errorCode: "invalid_transition",
    check: ({ refund }) => (refund.status === "rejected" ? `Refund ${refund.id} is ${statusLabel(refund.status).toLowerCase()} and read-only.` : null),
  },
  {
    code: "DUPLICATE_REFUND",
    label: "Transaction not already refunded",
    errorCode: "rule_violation",
    check: ({ db, refund }) => {
      const others = listRefundsForTransaction(db, refund.transactionId).filter((r) => r.id !== refund.id && r.status === "processed");
      if (others.length === 0) return null;
      const refunded = others.reduce((sum, r) => sum + r.amountCents, 0);
      const txn = db.prepare("SELECT amount_cents AS a FROM transactions WHERE id = ?").get(refund.transactionId) as { a: number };
      if (refunded + refund.amountCents <= txn.a) return null;
      return `Transaction ${refund.transactionId} already refunded ${formatMoney(refunded, refund.currency)} (${others.map((r) => r.id).join(", ")}); this refund would exceed the original ${formatMoney(txn.a, refund.currency)}.`;
    },
  },
  {
    code: "KYC_NOT_APPROVED",
    label: "Customer KYC approved (flag block_refunds_unverified_kyc)",
    errorCode: "rule_violation",
    check: ({ db, refund }) =>
      isKycRestricted(db, refund.customerId)
        ? `${refund.customerName}'s KYC is ${statusLabel(refund.customerKycStatus).toLowerCase()}; refunds are blocked for unverified customers.`
        : null,
  },
  {
    code: "REFUNDS_PAUSED",
    label: "Refund processing not paused (flag pause_refund_processing)",
    errorCode: "rule_violation",
    check: ({ db }) => (isFeatureEnabled(db, PAUSE_REFUND_PROCESSING) ? "Refund processing is paused by a Risk Admin." : null),
  },
  {
    code: "AMOUNT_OVER_LIMIT",
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

/** The central refund eligibility decision. Used by the Refunds page (buttons, checklist, queue) and by processRefund. */
export function canProcessRefund(db: Db, role: Role | null, refundId: string): RefundEligibility {
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
  const checks = REFUND_RULES.map((rule) => {
    const message = rule.check({ db, role, refund });
    return { code: rule.code, label: rule.label, passed: message === null, message };
  });
  const failed = REFUND_RULES.filter((_, i) => !checks[i].passed);
  return {
    eligible: failed.length === 0,
    refund,
    checks,
    reasons: checks.filter((c) => !c.passed).map((c) => ({ code: c.code, message: c.message! })),
    errorCode: failed[0]?.errorCode ?? null,
  };
}

/** Business blockers ignoring the viewer's role (what any permitted operator would hit). */
export function businessBlockers(eligibility: RefundEligibility): RefundBlockCode[] {
  return eligibility.reasons.map((r) => r.code).filter((c) => c !== "ROLE_NOT_PERMITTED");
}

export function formatRefundBlockers(reasons: RefundEligibility["reasons"]): string {
  return `Cannot process refund: ${reasons.map((r) => `${r.code} — ${r.message}`).join(" ")}`;
}

export const processRefundSchema = z.object({
  refundId: z.string().trim().min(1, "Refund is required."),
  note: z
    .string({ message: "A note is required to process a refund." })
    .trim()
    .min(1, "A note is required to process a refund.")
    .max(500, "Note must be 500 characters or fewer."),
});

export function processRefund(db: Db, actorRole: Role | null, rawInput: unknown, now: Date = new Date()): OperationResult {
  const raw = (rawInput ?? {}) as Record<string, unknown>;
  return runAuditedOperation({
    db,
    actorRole,
    action: "refund.process",
    entityType: "refund",
    entityId: typeof raw.refundId === "string" ? raw.refundId : null,
    execute: () => {
      const parsed = processRefundSchema.safeParse(rawInput);
      if (!parsed.success) {
        throw new OperationError("validation", parsed.error.issues.map((i) => i.message).join(" "), { reasons: ["VALIDATION"] });
      }
      const { refundId, note } = parsed.data;

      const eligibility = canProcessRefund(db, actorRole, refundId);
      if (!eligibility.eligible) {
        throw new OperationError(eligibility.errorCode!, formatRefundBlockers(eligibility.reasons), {
          reasons: eligibility.reasons.map((r) => r.code),
        });
      }
      const refund = eligibility.refund!;
      const processedAt = now.toISOString();
      // Guarded transition: only a still-pending refund can be processed (no double processing on races).
      const { changes } = db
        .prepare(
          `UPDATE refunds SET status = 'processed', processed_at = ?, processed_by_role = ?, processing_note = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .run(processedAt, actorRole, note, refund.id);
      if (changes !== 1) {
        throw new OperationError("invalid_transition", `Refund ${refund.id} is no longer pending.`, { reasons: ["ALREADY_REFUNDED"] });
      }
      // UNIQUE(refund_id) makes a second payout impossible even if the guard above were bypassed.
      db.prepare(
        `INSERT INTO refund_payouts (refund_id, customer_id, amount_cents, currency, created_by_role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(refund.id, refund.customerId, refund.amountCents, refund.currency, actorRole, processedAt);

      return {
        message: `Refund ${refund.id} of ${formatMoney(refund.amountCents, refund.currency)} processed for ${refund.customerName}.`,
        details: { customerId: refund.customerId, transactionId: refund.transactionId, amountCents: refund.amountCents, note },
      };
    },
  });
}
