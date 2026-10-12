import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema";
import { seedDatabase } from "./seed";

export type Db = Database.Database;

export function defaultDbPath(): string {
  return process.env.PORTAL_DB_PATH ?? path.join(process.cwd(), "data", "portal.db");
}

/** Open a connection and ensure the schema exists. Use ":memory:" in tests. */
export function openDb(filename: string): Db {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

/** Drop all data and re-seed. Used by `npm run db:reset` and tests. */
export function resetDb(db: Db): void {
  db.transaction(() => {
    for (const table of ["audit_events", "risk_holds", "refunds", "transactions", "feature_flags", "customers"]) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'audit_events'`).run();
  })();
  seedDatabase(db);
}

const globalForDb = globalThis as unknown as { portalDb?: Db };

/** Shared app connection (survives Next.js dev HMR). Seeds automatically on first run. */
export function getDb(): Db {
  if (!globalForDb.portalDb) {
    const db = openDb(defaultDbPath());
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number };
    if (count === 0) seedDatabase(db);
    globalForDb.portalDb = db;
  }
  return globalForDb.portalDb;
}
