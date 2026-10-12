import { openDb, resetDb, type Db } from "@/server/db";

/** Fresh, seeded in-memory database per test. */
export function createTestDb(): Db {
  const db = openDb(":memory:");
  resetDb(db);
  return db;
}
