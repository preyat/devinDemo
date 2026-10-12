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

Pick a role in the navbar. **Quick demo (Fraud Operations → Refunds):** as Payments Operator, Alex's refund
`ref_alex_350` is eligible. As Risk Admin, click **Escalate & Hold** on alert `alert_alex_4500`. Back as Payments
Operator, the server now blocks the refund with `ACCOUNT_RISK_HOLD`. `npm run demo:reset` restores the initial state.

Full step-by-step walkthroughs, the seed scenarios and the reset guard are in [docs/demo.md](docs/demo.md).

## Demo data

Synthetic and deterministic: 54 customers, 118 transactions, 29 refunds and 5 fraud alerts, recreated identically by
`npm run demo:reset`. The reset is guarded and refuses to touch a non-demo database. The named scenarios
(Maya, Samira, Alex, Priya, …) are listed in [docs/demo.md](docs/demo.md#seed-data).

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
- [docs/demo.md](docs/demo.md): reviewer walkthroughs, seed scenarios and the demo reset guard.
- Building a new tool with Devin: start with the `!build-internal-tool` playbook (source:
  [playbooks/build-internal-tool.devin.md](playbooks/build-internal-tool.devin.md)). It invokes the repo skill
  [.agents/skills/build-internal-tool/SKILL.md](.agents/skills/build-internal-tool/SKILL.md). Detailed procedure:
  [docs/playbooks/ops-portal-tool.md](docs/playbooks/ops-portal-tool.md).
- Before every PR: typecheck, lint, test, smoke, and the checklist in `.agents/skills/review-internal-tool`. Never
  commit `data/*.db`.

## License

No license file yet: all rights reserved by the repository owner. The UI theme is derived from the MIT-licensed Dashio template.
