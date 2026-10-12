import { z } from "zod";
import type { Db } from "../db";
import { OperationError } from "../errors";
import { getCustomer, listVerificationChecks, type CheckType, type KycStatus, type VerificationCheck } from "../lookups";
import { runAuditedOperation, type OperationResult } from "../operation";
import { assertCan } from "../permissions";
import type { Role } from "../roles";

export const KYC_DECISIONS = ["approve", "reject", "request_info"] as const;
export type KycDecision = (typeof KYC_DECISIONS)[number];

const DECISION_TARGET: Record<KycDecision, KycStatus> = {
  approve: "approved",
  reject: "rejected",
  request_info: "info_requested",
};

// Allowed KYC transitions. approved/rejected are final (no reopening workflow yet).
const KYC_TRANSITIONS: Record<KycStatus, KycStatus[]> = {
  pending: ["approved", "rejected", "info_requested"],
  info_requested: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export const kycDecisionSchema = z.object({
  customerId: z.string().trim().min(1, "Customer is required."),
  decision: z.enum(KYC_DECISIONS, { message: "Decision must be approve, reject or request_info." }),
  note: z
    .string({ message: "A note is required for every decision." })
    .trim()
    .min(1, "A note is required for every decision.")
    .max(500, "Note must be 500 characters or fewer."),
});

export type KycDecisionInput = z.input<typeof kycDecisionSchema>;

/** Decisions the current status allows (before checking approval blockers). Used by the page and the service. */
export function allowedKycDecisions(status: KycStatus): KycDecision[] {
  return KYC_DECISIONS.filter((d) => KYC_TRANSITIONS[status].includes(DECISION_TARGET[d]));
}

const stripPeriod = (s: string) => s.replace(/\.$/, "");

/**
 * Mandatory-check rule for approval: identity + address passed, sanctions + PEP clear.
 * Returns human-readable reasons; empty array means approval is allowed.
 */
export function getApprovalBlockers(checks: VerificationCheck[]): string[] {
  const byType = new Map<CheckType, VerificationCheck>(checks.map((c) => [c.checkType, c]));
  const blockers: string[] = [];
  const identity = byType.get("identity");
  if (!identity || identity.result === "missing") blockers.push("identity verification is missing");
  else if (identity.result !== "passed") blockers.push(`identity verification failed (${stripPeriod(identity.detail)})`);
  const address = byType.get("address");
  if (!address || address.result === "missing") blockers.push("proof of address is missing");
  else if (address.result !== "passed") blockers.push(`address verification failed (${stripPeriod(address.detail)})`);
  if (byType.get("sanctions")?.result !== "clear") blockers.push("sanctions screening requires further review");
  if (byType.get("pep")?.result !== "clear") blockers.push("PEP screening requires further review");
  return blockers;
}

export function formatApprovalBlockers(blockers: string[]): string {
  return `Cannot approve: ${blockers.join("; ")}.`;
}

export function decideKyc(db: Db, actorRole: Role | null, rawInput: unknown, now: Date = new Date()): OperationResult {
  const raw = (rawInput ?? {}) as Record<string, unknown>;
  const entityId = typeof raw.customerId === "string" ? raw.customerId : null;
  const action = (KYC_DECISIONS as readonly unknown[]).includes(raw.decision) ? `kyc.${raw.decision}` : "kyc.decide";

  return runAuditedOperation({
    db,
    actorRole,
    action,
    entityType: "customer",
    entityId,
    execute: () => {
      assertCan(actorRole, "kyc.decide");

      const parsed = kycDecisionSchema.safeParse(rawInput);
      if (!parsed.success) {
        throw new OperationError("validation", parsed.error.issues.map((i) => i.message).join(" "));
      }
      const input = parsed.data;

      const customer = getCustomer(db, input.customerId);
      if (!customer) throw new OperationError("not_found", `Customer ${input.customerId} not found.`);

      const target = DECISION_TARGET[input.decision];
      if (!KYC_TRANSITIONS[customer.kycStatus].includes(target)) {
        throw new OperationError("invalid_transition", `Cannot change KYC from ${customer.kycStatus} to ${target}.`);
      }
      if (input.decision === "approve") {
        const blockers = getApprovalBlockers(listVerificationChecks(db, customer.id));
        if (blockers.length > 0) throw new OperationError("rule_violation", formatApprovalBlockers(blockers));
      }

      const decidedAt = now.toISOString();
      db.prepare(`UPDATE customers SET kyc_status = ?, updated_at = ? WHERE id = ? AND kyc_status = ?`).run(
        target,
        decidedAt,
        customer.id,
        customer.kycStatus,
      );
      db.prepare(
        `INSERT INTO kyc_decisions (customer_id, decision, from_status, to_status, note, decided_by_role, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(customer.id, input.decision, customer.kycStatus, target, input.note, actorRole, decidedAt);

      const message =
        input.decision === "approve"
          ? `KYC approved for ${customer.name}.`
          : input.decision === "reject"
            ? `KYC rejected for ${customer.name}.`
            : `More information requested from ${customer.name}.`;
      return { message, details: { from: customer.kycStatus, to: target, note: input.note } };
    },
  });
}
