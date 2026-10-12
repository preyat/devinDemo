import { defaultDbPath, openDb, resetDb } from "../src/server/db";
import { TABLES } from "../src/server/schema";

const file = defaultDbPath();
const db = openDb(file);
resetDb(db);
const counts = [...TABLES].reverse().map((t) => `${t}=${(db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c}`);
const byStatus = db.prepare("SELECT kyc_status AS s, COUNT(*) AS c FROM customers GROUP BY kyc_status ORDER BY kyc_status").all() as { s: string; c: number }[];
db.close();
console.log(`Reset ${file}: ${counts.join(", ")}`);
console.log(`KYC status: ${byStatus.map((r) => `${r.s}=${r.c}`).join(", ")}`);
