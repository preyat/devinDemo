import { defaultDbPath, openDb, resetDb } from "../src/server/db";

const file = defaultDbPath();
const db = openDb(file);
resetDb(db);
const counts = ["customers", "transactions", "refunds", "feature_flags", "risk_holds", "audit_events"].map(
  (t) => `${t}=${(db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c}`,
);
db.close();
console.log(`Reset ${file}: ${counts.join(", ")}`);
