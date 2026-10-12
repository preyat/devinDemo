import path from "node:path";
import type { Db } from "./db";

export const DEMO_ENVIRONMENT = "demo";

/** The only database file demo:reset (and the stale-schema auto-reset) may modify. */
export function designatedDemoDbPath(): string {
  return path.resolve(process.env.DEMO_DB_PATH ?? path.join(process.cwd(), "data", "portal.db"));
}

export class DemoResetRefusedError extends Error {
  constructor(message: string) {
    super(`Refusing to reset database: ${message}`);
    this.name = "DemoResetRefusedError";
  }
}

/**
 * Throws unless `file` is the designated demo database and is safe to wipe:
 * - PORTAL_ENV must not be "production";
 * - the path must equal DEMO_DB_PATH (default data/portal.db);
 * - an existing database must be marked portal_meta.environment = 'demo' (a brand-new empty file, or a pre-marker
 *   demo DB from schema ≤ 5 at the designated path, is allowed).
 */
export function assertResettableDemoDb(db: Db, file: string): void {
  if ((process.env.PORTAL_ENV ?? "").toLowerCase() === "production") {
    throw new DemoResetRefusedError("PORTAL_ENV=production. demo:reset never runs against production.");
  }
  const designated = designatedDemoDbPath();
  if (file === ":memory:" || path.resolve(file) !== designated) {
    throw new DemoResetRefusedError(`${file} is not the designated demo database (${designated}). Set DEMO_DB_PATH to designate a different demo file.`);
  }
  const hasTable = (name: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  if (hasTable("portal_meta")) {
    const row = db.prepare("SELECT value FROM portal_meta WHERE key = 'environment'").get() as { value: string } | undefined;
    if (row?.value !== DEMO_ENVIRONMENT) throw new DemoResetRefusedError(`database is marked environment=${row?.value ?? "(none)"}, not '${DEMO_ENVIRONMENT}'.`);
    return;
  }
  const tableCount = (db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table'").get() as { c: number }).c;
  const version = db.pragma("user_version", { simple: true }) as number;
  if (tableCount > 0 && version >= 6) throw new DemoResetRefusedError("database has no demo environment marker.");
}
