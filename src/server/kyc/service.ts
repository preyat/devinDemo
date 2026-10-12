import { z } from "zod";
import type { Db } from "../db";
import { OperationError } from "../errors";
import { getCustomer, type KycStatus } from "../lookups";
import { runAuditedOperation, type OperationResult } from "../operation";
import { assertCan } from "../permissions";
import type { Role } from "../roles";

export const kycDecisionSchema = z
  .object({
    customerId: z.string().trim().min(1, "Customer is required."),
    decision: z.enum(["approve", "reject"], { message: "Decision must be approve or reject." }),
    note: z.string().trim().max(500, "Note must be 500 characters or fewer.").default(""),
  })
  .refine((v) => v.decision !== "reject" || v.note.length > 0, {
    message: "A note is required when rejecting.",
    path: ["note"],
  });

export type KycDecisionInput = z.input<typeof kycDecisionSchema>;

// Allowed KYC transitions. Decisions are final in this prototype.
const KYC_TRANSITIONS: Record<KycStatus, KycStatus[]> = {
  pending: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export function decideKyc(
  db: Db,
  actorRole: Role | null,
  rawInput: unknown,
  now: Date = new Date(),
): OperationResult {
  const raw = (rawInput ?? {}) as Record<string, unknown>;
  const entityId = typeof raw.customerId === "string" ? raw.customerId : null;
  const action = raw.decision === "reject" ? "kyc.reject" : "kyc.approve";

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

      const target: KycStatus = input.decision === "approve" ? "approved" : "rejected";
      if (!KYC_TRANSITIONS[customer.kycStatus].includes(target)) {
        throw new OperationError(
          "invalid_transition",
          `Cannot change KYC from ${customer.kycStatus} to ${target}.`,
        );
      }

      db.prepare(
        `UPDATE customers
         SET kyc_status = ?, kyc_decided_at = ?, kyc_decided_by_role = ?, kyc_decision_note = ?
         WHERE id = ? AND kyc_status = ?`,
      ).run(target, now.toISOString(), actorRole, input.note || null, customer.id, customer.kycStatus);

      return {
        message: `KYC ${target} for ${customer.name}.`,
        details: { from: customer.kycStatus, to: target, note: input.note || null },
      };
    },
  });
}
