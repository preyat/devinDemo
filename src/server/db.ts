import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_SQL, SCHEMA_VERSION, TABLES } from "./schema";
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
  if (db.pragma("user_version", { simple: true }) === SCHEMA_VERSION) db.exec(SCHEMA_SQL);
  return db;
}

/** Drop every table, recreate the schema and re-seed. Used by `npm run db:reset`, tests and stale DBs. */
export function resetDb(db: Db): void {
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    for (const table of TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
    db.exec(SCHEMA_SQL);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    seedDatabase(db);
  })();
  db.pragma("foreign_keys = ON");
}

const globalForDb = globalThis as unknown as { portalDb?: Db };

/** Shared app connection (survives Next.js dev HMR). Seeds a new or out-of-date DB automatically. */
export function getDb(): Db {
  if (!globalForDb.portalDb) {
    const db = openDb(defaultDbPath());
    if (db.pragma("user_version", { simple: true }) !== SCHEMA_VERSION) resetDb(db);
    globalForDb.portalDb = db;
  }
  return globalForDb.portalDb;
}
