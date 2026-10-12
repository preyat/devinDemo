# Ops Portal (prototype)

A local internal-operations portal for a fintech: reviewers work queues of KYC cases, refunds and fraud alerts, and
operators toggle feature flags. It runs on **synthetic data only**, and every decision and blocked attempt is
written to an audit log.

> **Status:** prototype / demo. No real authentication, no external providers, no production data.

## Background

Four workflows share one architecture. Each has a queue page with a dedicated case page, business rules in
framework-free server services, and every mutation is permission-checked and audited atomically
(`runAuditedOperation`).

| Workflow | Route | Who acts | What they decide |
| -------- | ----- | -------- | ---------------- |
| KYC Review | `/kyc`, `/kyc/<customerId>` | KYC Reviewer | Approve (only when all mandatory checks pass), Reject or Request More Information; note required |
| Refunds | `/refunds`, `/refunds/<refundId>` | Payments Operator | Process, Partial refund, Reject, Claim/release, Bulk process |
| Feature Flags | `/feature-flags` | Risk Admin | Turn operational flags ON/OFF (reason required) |
| Fraud Operations | `/fraud`, `/fraud/<alertId>` | Risk Admin | Dismiss, or Escalate & Hold (places an account risk hold) |

- **Refund eligibility** comes from a single server function, `canProcessRefund()`, which returns structured reason codes:
  `ROLE_NOT_PERMITTED`, `ALREADY_REFUNDED`, `REFUND_NOT_PENDING`, `DUPLICATE_REFUND`, `KYC_NOT_APPROVED`,
  `REFUNDS_PAUSED`, `AMOUNT_OVER_LIMIT`, `ACCOUNT_RISK_HOLD`. Processing marks the refund processed and creates
  exactly one payout row in the same transaction as the audit event. Reject moves no money and is never blocked by
  flags. A partial refund pays the lower amount, but the $1,000 limit still applies to the requested amount. Claim
  only records who is working a refund. Bulk process runs `processRefund` per refund, each with its own audit row.
- **Feature flags** apply on the very next eligibility check: `block_refunds_unverified_kyc` (OFF),
  `pause_refund_processing` (OFF, emergency stop), `block_high_value_refunds` (ON, blocks refunds over $1,000).
- **Fraud Operations** works on alerts from a *simulated* monitoring system. While a hold from an escalated alert is
  active, refunds fail with `ACCOUNT_RISK_HOLD` ("Account under risk review — refund processing paused.").

## Security

The role selector in the navbar is a **demo control, not authentication**. Roles are KYC Reviewer, Payments
Operator and Risk Admin. The chosen role is stored in a cookie, treated as an untrusted claim and re-checked against
`src/server/permissions.ts` on every mutation. Do not deploy this or point it at real data.

## Install

Requires Node.js 20+ (developed on Node 24; on the Devin VM run `source ~/.nvm/nvm.sh` first) and npm.

```bash
npm install
npm run demo:reset   # create/reset data/portal.db with seed data (db:reset is an alias)
```

## Usage

```bash
npm run dev          # http://localhost:3000/kyc
```

Pick a role in the navbar and follow one of the demo walkthroughs below. Run `npm run demo:reset` to restore
the initial state at any time.

## Demo data

54 synthetic customers (50 KYC customers — 20 approved, 15 pending, 10 awaiting info, 5 rejected — plus 4 approved Fraud Operations customers),
118 transactions, 29 refunds (14 processed, each with one payout) and 5 fraud alerts, fully reproducible on every `npm run demo:reset`.

Each case has a review type explaining why it is in the queue: **Onboarding** (new applicant — no account
activity until approved), **Periodic refresh** or **Triggered** (existing customer being re-reviewed — keeps their
transaction/refund history). Demo scenarios:

| Customer       | KYC      | Risk   | Review           | Scenario |
| -------------- | -------- | ------ | ---------------- | -------- |
| Maya Reed      | pending  | medium | Triggered        | All checks passed → can be approved; $750 purchase + pending refund triggered the review |
| Samira Patel   | pending  | medium | Periodic refresh | Reported address change; proof of address missing → approval blocked; request info |
| Viktor Sokolov | pending  | high   | Onboarding       | Potential sanctions match → approval blocked |
| Lucas Moreau   | pending  | medium | Periodic refresh | Passport on file expired → approval blocked |
| Jordan Lee     | approved | low    | —                | $420 refund already processed |
| Alex Kim       | approved | low    | —                | $350 refund pending + separate $4,500 transaction; HIGH open fraud alert; no risk hold |
| Ben Carter     | approved | low    | —                | $180 refund processed, then customer re-submitted → pending `ref_ben_180_dup` is blocked `DUPLICATE_REFUND` |
| David Cohen    | approved | medium | —                | $2,400 pending refund → blocked `AMOUNT_OVER_LIMIT` while `block_high_value_refunds` is ON |

Refund demo (Maya): as Risk Admin turn `block_refunds_unverified_kyc` ON → as Payments Operator Maya's `ref_maya_750` is
blocked `KYC_NOT_APPROVED` → as KYC Reviewer approve Maya → as Payments Operator process it → a second attempt is
rejected `ALREADY_REFUNDED`. Jordan's `ref_jordan_420` is already processed and read-only.

Fraud Operations cases (all signals simulated; `src/server/fraud/seed-data.ts`):

| Alert                  | Customer    | Severity | Status    | Scenario |
| ---------------------- | ----------- | -------- | --------- | -------- |
| `alert_alex_4500`      | Alex Kim    | HIGH     | OPEN      | Account takeover: new device + unusual location on the $4,500 wire. His $350 refund is pending and **eligible**; no hold. |
| `alert_jamie_velocity` | Jamie Patel | MEDIUM   | OPEN      | Six gift-card purchases ($1,450) in 36 minutes. |
| `alert_maya_chen_9800` | Maya Chen   | HIGH     | OPEN      | $9,800 transfer to a new beneficiary, ~70× her usual spend (one earlier processed $54 refund). |
| `alert_sam_device`     | Sam Taylor  | LOW      | OPEN      | Low-confidence browser fingerprint change on a $62 renewal. |
| `alert_priya_2750`     | Priya Shah  | HIGH     | ESCALATED | Escalated by Risk Admin (seeded through the real service): active hold `hold_priya_2750`, audit row, and her pending $120 refund is blocked `ACCOUNT_RISK_HOLD`. |

Fraud demo (Alex): as Payments Operator `ref_alex_350` is eligible → as Risk Admin open `alert_alex_4500` and
**Escalate & Hold** → as Payments Operator the refund shows `ACCOUNT_RISK_HOLD` / "Account under risk review — refund
processing paused." and a processing attempt is rejected (refund stays pending, denial audited). Dismissing an alert never creates a hold.

Flags: `block_refunds_unverified_kyc` OFF, `pause_refund_processing` OFF, `block_high_value_refunds` ON. One risk hold (Priya). The audit log holds only Priya's seeded escalation.

### Repeatable demo reset

`npm run demo:reset` restores the initial state (Alex's OPEN alert, no Alex hold, eligible pending $350 refund, Priya
escalated). It is guarded (`src/server/demo-guard.ts`) and refuses to run when:

- `PORTAL_ENV=production`;
- the target (`PORTAL_DB_PATH`, default `data/portal.db`) is not the designated demo file (`DEMO_DB_PATH`, default `data/portal.db`);
- the database exists but is not marked `portal_meta.environment = 'demo'` (written by the seed).

The same guard protects the automatic reset `getDb()` performs after a `SCHEMA_VERSION` bump.

## Development

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm test             # vitest run (in-memory SQLite, no watch)
npm run smoke        # Playwright browser smoke test; needs `npm run dev` + Chrome
                     # on the Devin VM: SMOKE_CDP_URL=http://localhost:29229 npm run smoke
npm run new:workflow -- <slug> --entity <type> --role <role>   # scaffold a new tool
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, typecheck, lint, test and `db:reset` on every PR.

Stack: Next.js 15 App Router, React 19, TypeScript, better-sqlite3 (no ORM), Zod, Vitest, and Bootstrap 5 / React
Bootstrap with a theme adapted from the MIT-licensed [Dashio template](https://github.com/DashboardPack/dashio-template).

```text
src/app/          pages + server actions (one folder per workflow)
src/components/   shared UI (queue, filters, case page, decision form)
src/server/       framework-free services: rules, permissions, audited operations, schema + seed
tests/            Vitest suites per workflow + seed invariants
scripts/          db reset, smoke test, workflow scaffold
```

## Contributing

- [AGENTS.md](AGENTS.md): file map, conventions and the agent skills table (for humans and agents).
- [docs/architecture.md](docs/architecture.md): diagram, rules table and how to add a workflow.
- Building a new tool with Devin: start with the `!build-internal-tool` playbook (source:
  [playbooks/build-internal-tool.devin.md](playbooks/build-internal-tool.devin.md)). It invokes the repo skill
  [.agents/skills/build-internal-tool/SKILL.md](.agents/skills/build-internal-tool/SKILL.md). Detailed procedure:
  [docs/playbooks/ops-portal-tool.md](docs/playbooks/ops-portal-tool.md).
- Before every PR: typecheck, lint, test, smoke, and the checklist in `.agents/skills/review-internal-tool`. Never
  commit `data/*.db`.

## License

No license file yet: all rights reserved by the repository owner. The UI theme is derived from the MIT-licensed Dashio template.
