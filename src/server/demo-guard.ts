import path from "node:path";
import type { Db } from "./db";
import { TABLES } from "./schema";

export const DEMO_ENVIRONMENT = "demo";
/** Seeded customer present in every demo database since schema v1. */
const LEGACY_DEMO_FIXTURE = "cus_alex_kim";

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
 *   schema 1–5 DB containing only portal tables and the seeded demo fixture, is allowed).
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
  // No marker: allow only a brand-new empty file, or a pre-marker demo DB (schema 1–5) that contains nothing but
  // portal tables and the seeded demo fixtures. Anything else is not provably a demo database.
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name);
  if (tables.length === 0) return;
  const version = db.pragma("user_version", { simple: true }) as number;
  const onlyPortalTables = tables.every((t) => (TABLES as readonly string[]).includes(t));
  const hasDemoFixture = tables.includes("customers") && !!db.prepare("SELECT 1 FROM customers WHERE id = ?").get(LEGACY_DEMO_FIXTURE);
  if (version >= 1 && version < 6 && onlyPortalTables && hasDemoFixture) return;
  throw new DemoResetRefusedError("database has no demo environment marker and is not a recognisable legacy demo database.");
}
