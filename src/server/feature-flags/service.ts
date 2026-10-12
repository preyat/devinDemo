import { z } from "zod";
import type { Db } from "../db";
import { OperationError } from "../errors";
import { getFeatureFlag } from "../lookups";
import { runAuditedOperation, type OperationResult } from "../operation";
import { assertCan } from "../permissions";
import type { Role } from "../roles";
import { FEATURE_FLAG_KEYS } from "./definitions";

export const FLAG_DECISIONS = ["enable", "disable"] as const;
export type FlagDecision = (typeof FLAG_DECISIONS)[number];

/** Reads the persisted flag on every call, so a toggle affects the next request immediately. Unknown flag = OFF. */
export function isFeatureEnabled(db: Db, key: string): boolean {
  return getFeatureFlag(db, key)?.enabled ?? false;
}

/** The only change the current state allows. Used by the page and enforced by the service. */
export function allowedFlagDecisions(enabled: boolean): FlagDecision[] {
  return [enabled ? "disable" : "enable"];
}

export const toggleFlagSchema = z.object({
  key: z.enum(FEATURE_FLAG_KEYS, { message: "Unknown feature flag." }),
  decision: z.enum(FLAG_DECISIONS, { message: "Decision must be enable or disable." }),
  note: z
    .string({ message: "A reason is required for every flag change." })
    .trim()
    .min(1, "A reason is required for every flag change.")
    .max(500, "Note must be 500 characters or fewer."),
});

export function toggleFeatureFlag(db: Db, actorRole: Role | null, rawInput: unknown, now: Date = new Date()): OperationResult {
  const raw = (rawInput ?? {}) as Record<string, unknown>;
  const action = (FLAG_DECISIONS as readonly unknown[]).includes(raw.decision) ? `feature_flag.${raw.decision}` : "feature_flag.toggle";

  return runAuditedOperation({
    db,
    actorRole,
    action,
    entityType: "feature_flag",
    entityId: typeof raw.key === "string" ? raw.key : null,
    execute: () => {
      assertCan(actorRole, "feature_flag.toggle");
      const parsed = toggleFlagSchema.safeParse(rawInput);
      if (!parsed.success) throw new OperationError("validation", parsed.error.issues.map((i) => i.message).join(" "));
      const { key, decision, note } = parsed.data;

      const flag = getFeatureFlag(db, key);
      if (!flag) throw new OperationError("not_found", `Feature flag ${key} not found.`);
      if (!allowedFlagDecisions(flag.enabled).includes(decision)) {
        throw new OperationError("invalid_transition", `Feature flag ${key} is already ${flag.enabled ? "ON" : "OFF"}.`);
      }

      const enabled = decision === "enable";
      const updatedAt = now.toISOString();
      db.prepare(`UPDATE feature_flags SET enabled = ?, updated_at = ?, updated_by_role = ? WHERE key = ? AND enabled = ?`).run(
        enabled ? 1 : 0,
        updatedAt,
        actorRole,
        key,
        flag.enabled ? 1 : 0,
      );
      return {
        message: `Feature flag ${key} turned ${enabled ? "ON" : "OFF"}.`,
        details: { from: flag.enabled, to: enabled, note },
      };
    },
  });
}
