import { writeAuditEvent } from "./audit";
import type { Db } from "./db";
import { OperationError, type OperationErrorCode } from "./errors";
import type { Role } from "./roles";

export type OperationResult =
  | { ok: true; message: string }
  | { ok: false; code: OperationErrorCode; message: string };

export interface AuditedOperation {
  db: Db;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string | null;
  /**
   * Validate, check permission, load state, check transition and write the change.
   * Runs inside ONE SQLite transaction together with the success audit event.
   * Throw OperationError for expected failures; return a success message + details.
   */
  execute: () => { message: string; details?: Record<string, unknown> };
}

/**
 * The single convention for every state-changing workflow:
 *  - state change + success audit are atomic (same transaction);
 *  - expected failures (OperationError) roll back, are audited as "denied",
 *    and are returned as { ok: false } for the UI;
 *  - unexpected errors roll back and are rethrown.
 */
export function runAuditedOperation(op: AuditedOperation): OperationResult {
  const base = {
    actorRole: op.actorRole,
    action: op.action,
    entityType: op.entityType,
    entityId: op.entityId,
  };
  try {
    const result = op.db.transaction(() => {
      const r = op.execute();
      writeAuditEvent(op.db, { ...base, outcome: "success", message: r.message, details: r.details });
      return r;
    })();
    return { ok: true, message: result.message };
  } catch (err) {
    if (!(err instanceof OperationError)) throw err;
    writeAuditEvent(op.db, {
      ...base,
      outcome: "denied",
      message: err.message,
      details: { code: err.code },
    });
    return { ok: false, code: err.code, message: err.message };
  }
}
