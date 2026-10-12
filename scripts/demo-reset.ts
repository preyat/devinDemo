// `npm run demo:reset` (alias: db:reset): restore the designated demo database to its seeded state.
// Guarded by assertResettableDemoDb — refuses production, non-demo paths and databases not marked environment=demo.
import { defaultDbPath, openDb, resetDb } from "../src/server/db";
import { assertResettableDemoDb, DemoResetRefusedError } from "../src/server/demo-guard";
import { TABLES } from "../src/server/schema";

const file = defaultDbPath();
const db = openDb(file);
try {
  assertResettableDemoDb(db, file);
} catch (err) {
  db.close();
  if (err instanceof DemoResetRefusedError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
resetDb(db);
const counts = [...TABLES].reverse().map((t) => `${t}=${(db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c}`);
const byStatus = db.prepare("SELECT kyc_status AS s, COUNT(*) AS c FROM customers GROUP BY kyc_status ORDER BY kyc_status").all() as { s: string; c: number }[];
const alerts = db.prepare("SELECT status AS s, COUNT(*) AS c FROM fraud_alerts GROUP BY status ORDER BY status").all() as { s: string; c: number }[];
db.close();
console.log(`Reset demo database ${file}: ${counts.join(", ")}`);
console.log(`KYC status: ${byStatus.map((r) => `${r.s}=${r.c}`).join(", ")}`);
console.log(`Fraud alerts: ${alerts.map((r) => `${r.s}=${r.c}`).join(", ")}; Alex Kim alert open, no hold, $350 refund pending`);
