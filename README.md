# Ops Portal (prototype)

A minimal internal operations portal for a fintech, built as a local prototype with **synthetic data only**.
It currently ships one workflow, **KYC Review** (`/kyc`): a searchable, filterable queue of ~50 synthetic
customers with summary cards, and a case panel showing profile, risk classification, identity/address/sanctions/PEP
verification results, transactions, refunds and decision history. KYC Reviewers can Approve (only when all
mandatory checks pass), Reject or Request More Information — each requires a note. Every decision and every
blocked attempt is written to an audit log.

> The role selector in the navbar is a **DEMO control, not authentication**. The chosen role is stored in a
> cookie and treated as an untrusted claim; the server re-checks it against `src/server/permissions.ts` on
> every mutation.

Planned (not built yet): Refunds, Feature Flags, Transaction Risk Review. Their tables are already seeded.

## Run it

Requires Node.js 20+ (developed on Node 24) and npm.

```bash
npm install
npm run db:reset   # creates/reset data/portal.db with seed data
npm run dev        # http://localhost:3000/kyc
```

## Other commands

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm test           # vitest run (in-memory SQLite, no watch)
```

## Seed data

50 synthetic customers (20 approved, 15 pending, 10 awaiting info, 5 rejected), ~94 transactions, ~21 refunds,
fully reproducible on every `npm run db:reset`. Demo scenarios:

| Customer      | KYC      | Risk   | Scenario |
| ------------- | -------- | ------ | -------- |
| Maya Reed     | pending  | medium | All checks passed → can be approved; $750 refund pending |
| Samira Patel  | pending  | medium | Proof of address missing → approval blocked; request info |
| Viktor Sokolov| pending  | high   | Potential sanctions match → approval blocked |
| Lucas Moreau  | pending  | medium | Expired passport → approval blocked |
| Jordan Lee    | approved | low    | $420 refund already processed |
| Alex Kim      | approved | low    | $350 refund pending + separate $4,500 transaction; no risk hold |

Feature flag `kyc_restriction` is OFF. No risk holds. Audit log is empty.

## More

- [AGENTS.md](AGENTS.md) — file map, conventions, commands (for humans and agents).
- [docs/architecture.md](docs/architecture.md) — diagram and how to add a workflow.
