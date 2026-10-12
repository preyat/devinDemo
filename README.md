# Ops Portal (prototype)

A minimal internal operations portal for a fintech, built as a local prototype with **synthetic data only**.
It ships three working workflows. Every decision and every blocked attempt is written to an audit log.

- **KYC Review** (`/kyc`) — searchable, filterable queue of ~50 synthetic customers with summary cards and a case panel
  (profile, risk, identity/address/sanctions/PEP checks, transactions, refunds, decision history). KYC Reviewers can
  Approve (only when all mandatory checks pass), Reject or Request More Information — each requires a note.
- **Refunds** (`/refunds`) — pending/processed/rejected refund queue (search, status/KYC/assignment filters, sort), detail panel
  with an eligibility checklist, payout and audit trail. Payments Operators can **Process** a pending refund (note
  required). Eligibility is decided by one server function, `canProcessRefund()`, which returns structured reason
  codes (`ROLE_NOT_PERMITTED`, `ALREADY_REFUNDED`, `REFUND_NOT_PENDING`, `DUPLICATE_REFUND`, `KYC_NOT_APPROVED`,
  `REFUNDS_PAUSED`, `AMOUNT_OVER_LIMIT`). Other queue actions (Payments Operator, all audited): **Reject** (note
  required, no money moves, never blocked by flags), **Partial refund** (enter a lower amount; the payout records the
  approved amount, and the $1,000 limit still applies to the requested amount), **Claim / release** (records who is
  working a refund; coordination only — demo roles have no user identity), **Bulk process** (selected eligible refunds
  on the page; each runs through `processRefund` and its own audit, blocked ones are reported). Processing marks the refund processed and creates exactly one payout row in
  the same transaction as the audit event.
- **Feature Flags** (`/feature-flags`) — persisted operational flags; only Risk Admins can turn them ON/OFF (reason
  required). Changes apply to the very next refund eligibility check. Flags:
  `block_refunds_unverified_kyc` (OFF; blocks refunds for customers whose KYC is not approved),
  `pause_refund_processing` (OFF; emergency stop), `block_high_value_refunds` (ON; blocks refunds over $1,000).

> The role selector in the navbar is a **DEMO control, not authentication**. The chosen role is stored in a
> cookie and treated as an untrusted claim; the server re-checks it against `src/server/permissions.ts` on
> every mutation.

Planned (not built yet): Transaction Risk Review (`risk_holds` table exists, empty). Demo roles: KYC Reviewer, Payments Operator, Risk Admin.

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

Building a new tool? Devin: start with the `!build-internal-tool` playbook (source:
[playbooks/build-internal-tool.devin.md](playbooks/build-internal-tool.devin.md)), which invokes the repo skill
[.agents/skills/build-internal-tool/SKILL.md](.agents/skills/build-internal-tool/SKILL.md). Detailed procedure:
[docs/playbooks/ops-portal-tool.md](docs/playbooks/ops-portal-tool.md); conventions: [AGENTS.md](AGENTS.md).

## Seed data

50 synthetic customers (20 approved, 15 pending, 10 awaiting info, 5 rejected), 98 transactions, 27 refunds (13 processed, each with one payout),
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
| Ben Carter     | approved | low    | —                | $180 refund processed, then customer re-submitted → pending `ref_ben_180_dup` is blocked `DUPLICATE_REFUND` |
| David Cohen    | approved | medium | —                | $2,400 pending refund → blocked `AMOUNT_OVER_LIMIT` while `block_high_value_refunds` is ON |

Refund demo (Maya): as Risk Admin turn `block_refunds_unverified_kyc` ON → as Payments Operator Maya's `ref_maya_750` is
blocked `KYC_NOT_APPROVED` → as KYC Reviewer approve Maya → as Payments Operator process it → a second attempt is
rejected `ALREADY_REFUNDED`. Jordan's `ref_jordan_420` is already processed and read-only.

Flags: `block_refunds_unverified_kyc` OFF, `pause_refund_processing` OFF, `block_high_value_refunds` ON. No risk holds. Audit log is empty.

## UI

Bootstrap 5 + React Bootstrap with a theme and sidebar layout adapted from the MIT-licensed
[Dashio template](https://github.com/DashboardPack/dashio-template) (Inter font, light/dark toggle in the header).

## More

- [AGENTS.md](AGENTS.md) — file map, conventions, commands (for humans and agents).
- [docs/architecture.md](docs/architecture.md) — diagram and how to add a workflow.
