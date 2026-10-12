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
npm run smoke      # browser smoke test (needs `npm run dev` running and Chrome)
npm run new:workflow -- refunds --entity refund --role payments_operator   # scaffold a new tool
```

Building a new tool? Follow [docs/playbooks/ops-portal-tool.md](docs/playbooks/ops-portal-tool.md)
(Devin: start the session with `!ops_portal_tool`), plus [AGENTS.md](AGENTS.md) and the skills in `.agents/skills/`.

## Seed data

50 synthetic customers (20 approved, 15 pending, 10 awaiting info, 5 rejected), ~94 transactions, ~21 refunds,
fully reproducible on every `npm run db:reset`. Demo scenarios:

Each case has a review type explaining why it is in the queue: **Onboarding** (new applicant — no account
activity until approved), **Periodic refresh** or **Triggered** (existing customer being re-reviewed — keeps their
transaction/refund history).

| Customer       | KYC      | Risk   | Review           | Scenario |
| -------------- | -------- | ------ | ---------------- | -------- |
| Maya Reed      | pending  | medium | Triggered        | All checks passed → can be approved; $750 purchase + pending refund triggered the review |
| Samira Patel   | pending  | medium | Periodic refresh | Reported address change; proof of address missing → approval blocked; request info |
| Viktor Sokolov | pending  | high   | Onboarding       | Potential sanctions match → approval blocked |
| Lucas Moreau   | pending  | medium | Periodic refresh | Passport on file expired → approval blocked |
| Jordan Lee     | approved | low    | —                | $420 refund already processed |
| Alex Kim       | approved | low    | —                | $350 refund pending + separate $4,500 transaction; no risk hold |

Feature flag `kyc_restriction` is OFF. No risk holds. Audit log is empty.

## UI

Bootstrap 5 + React Bootstrap with a theme and sidebar layout adapted from the MIT-licensed
[Dashio template](https://github.com/DashboardPack/dashio-template) (Inter font, light/dark toggle in the header).

## More

- [AGENTS.md](AGENTS.md) — file map, conventions, commands (for humans and agents).
- [docs/architecture.md](docs/architecture.md) — diagram and how to add a workflow.
