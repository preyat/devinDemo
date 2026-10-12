---
name: add-seed-data
description: Extend or change the Ops Portal's synthetic seed data (customers, verification checks, KYC history, transactions, refunds, feature flags, risk holds) deterministically and realistically without breaking the preserved demo scenarios. Use whenever a workflow needs new tables, columns or demo records.
---

# Add seed data

Files: `src/server/schema.ts` (DDL, `SCHEMA_VERSION`, `TABLES`), `src/server/seed-data.ts` (hand-written customers),
`src/server/seed.ts` (expansion + deterministic PRNG), `tests/seed.test.ts` (invariants).

## Rules

- **Deterministic**: timestamps from `SEED_TIMESTAMP` via `at(daysAgo)`; randomness only from the seeded `rng()`;
  stable IDs (`cus_<name>`, `txn_<customer>_<n>`, `ref_<customer>_<n>` or explicit).
- **Preserve demo scenarios** (asserted in `tests/seed.test.ts`): Maya (pending, triggered review, checks passed,
  `txn_maya_750` + pending `ref_maya_750`), Samira (pending, periodic refresh, address missing), Jordan (approved,
  `ref_jordan_420` processed), Alex (approved, `ref_alex_350` pending + `txn_alex_4500`, no risk hold), Viktor
  (sanctions match), Lucas (expired passport). Ben (duplicate refund request), David ($2,400 high-value refund). Flags: `block_refunds_unverified_kyc` OFF, `pause_refund_processing` OFF, `block_high_value_refunds` ON; every processed refund has exactly one `refund_payouts` row; Fraud Operations: 5 simulated alerts (`src/server/fraud/seed-data.ts`; Alex HIGH OPEN with no hold and an eligible `ref_alex_350`; Priya ESCALATED with active `hold_priya_2750`); the only seeded `risk_holds`/`audit_events` rows are Priya's escalation, created through `decideFraudAlert` at a fixed `now`. New fraud-only customers are appended to `SEED_CUSTOMERS` with `fixedTransactions: true` so generated data for existing customers is unchanged.
- **Realism invariants**: approved ⇒ all checks pass; never-approved onboarding applicants have no transactions/refunds;
  activity only after first approval; open cases with activity are re-reviews (`existing` in `seed-data.ts`, history
  `approve` → `open_review` by `system`); refunds reference the same customer's `completed` transaction and never exceed
  it; history ends in the current status.

## Steps

1. Schema change: edit `schema.ts`, add tables to `TABLES` (children first), bump `SCHEMA_VERSION`.
2. Records: customers in `seed-data.ts`; derived rows in `seedDatabase()`; export new demo IDs in `SEED_IDS`.
   Fixed demo rows are inserted explicitly; generated rows use `rng()`.
3. Add invariants/scenario assertions to `tests/seed.test.ts` (keep the determinism test).
4. `npm test && npm run db:reset`; restart `npm run dev` after a `SCHEMA_VERSION` bump.
5. Update the seed tables in `docs/demo.md` and the AGENTS.md data model.
