import type { Db } from "./db";
import type { Role } from "./roles";

export type AuditOutcome = "success" | "denied";

export interface AuditEventInput {
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: AuditOutcome;
  message: string;
  details?: Record<string, unknown>;
}

export interface AuditEvent {
  id: number;
  occurredAt: string;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: AuditOutcome;
  message: string;
  details: Record<string, unknown> | null;
}

export function writeAuditEvent(db: Db, event: AuditEventInput, now = new Date()): void {
  db.prepare(
    `INSERT INTO audit_events (occurred_at, actor_role, action, entity_type, entity_id, outcome, message, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    now.toISOString(),
    event.actorRole,
    event.action,
    event.entityType,
    event.entityId,
    event.outcome,
    event.message,
    event.details ? JSON.stringify(event.details) : null,
  );
}

interface AuditRow {
  id: number;
  occurred_at: string;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  outcome: AuditOutcome;
  message: string;
  details_json: string | null;
}

export function listAuditEvents(
  db: Db,
  filter: { entityType?: string; entityId?: string; limit?: number } = {},
): AuditEvent[] {
  const rows = db
    .prepare(
      `SELECT * FROM audit_events
       WHERE (@entityType IS NULL OR entity_type = @entityType)
         AND (@entityId IS NULL OR entity_id = @entityId)
       ORDER BY id DESC LIMIT @limit`,
    )
    .all({
      entityType: filter.entityType ?? null,
      entityId: filter.entityId ?? null,
      limit: filter.limit ?? 50,
    }) as AuditRow[];
  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    actorRole: r.actor_role,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    outcome: r.outcome,
    message: r.message,
    details: r.details_json ? (JSON.parse(r.details_json) as Record<string, unknown>) : null,
  }));
}
