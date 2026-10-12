# Ops Portal (prototype)

A minimal internal operations portal for a fintech, built as a local prototype with **synthetic data only**.
It currently ships one workflow, **KYC Review** (`/kyc`): reviewers see a customer queue, inspect synthetic
identity details, and Approve/Reject pending KYC checks. Every decision and every blocked attempt is written
to an audit log.

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

| Customer   | KYC      | Refunds                 | Other transactions |
| ---------- | -------- | ----------------------- | ------------------ |
| Maya Reed  | pending  | $750 pending            | —                  |
| Jordan Lee | approved | $420 already processed  | —                  |
| Alex Kim   | approved | $350 pending            | $4,500 transfer    |

Feature flag `kyc_restriction` is OFF. No risk holds. Audit log is empty.

## More

- [AGENTS.md](AGENTS.md) — file map, conventions, commands (for humans and agents).
- [docs/architecture.md](docs/architecture.md) — diagram and how to add a workflow.
