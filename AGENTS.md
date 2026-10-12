# AGENTS.md

Guide for agents and humans changing this repo. Describes what **exists**, not plans.

## Commands

```bash
npm install
npm run db:reset    # tsx scripts/db-reset.ts — drop, recreate + reseed data/portal.db (or $PORTAL_DB_PATH)
npm run dev         # next dev on http://localhost:3000
npm run typecheck   # tsc --noEmit
npm run lint        # eslint . (flat config, next/core-web-vitals + next/typescript)
npm test            # vitest run — tests/**/*.test.ts, in-memory SQLite
```

Run `typecheck`, `lint` and `test` before every commit. Node 24 via nvm on the dev VM (`source ~/.nvm/nvm.sh`).

## Stack

Next.js 15 App Router · React 19 · TypeScript · React Bootstrap 2 + Bootstrap 5 · lucide-react ·
better-sqlite3 (synchronous, no ORM) · Zod 3 · Vitest 3.

## File map

| Path | Responsibility |
| ---- | -------------- |
| `src/app/layout.tsx` | Root layout; reads demo role, renders `PortalShell`. |
| `src/app/page.tsx` | Home: workflow cards from `src/lib/workflows.ts`. |
| `src/app/kyc/page.tsx` | KYC Review (server component): summary cards, filtered/paginated queue, case panel (profile, risk, verification, decision, history, transactions, refunds, audit). |
| `src/app/kyc/actions.ts` | `"use server"` adapter: `decideKycAction` → `decideKyc`, then `revalidatePath`. |
| `src/app/kyc/KycDecisionForm.tsx` | Client wrapper configuring `DecisionForm` with KYC buttons/icons and the blocked-approval notice. |
| `src/app/actions/role.ts` | `setDemoRole` server action (writes `demo_role` cookie). |
| `src/components/PortalShell.tsx` | Client navbar + nav links + `DemoRoleSelector`. |
| `src/components/QueueTable.tsx` | Generic table: `columns`, `getRowKey`, optional `getRowHref`, `selectedKey`. |
| `src/components/QueueFilters.tsx` | Client, URL-driven search box + select filters; any change resets `page`. |
| `src/components/QueuePagination.tsx` | Client prev/next/page links preserving other URL params + "Showing x–y of n". |
| `src/components/SummaryCards.tsx` | Row of metric cards (`label`, `value`, `variant`). |
| `src/components/RecordDetail.tsx` | Card with label/value list + `children` slot. |
| `src/components/VerificationChecklist.tsx` | List of `{ label, status, detail }` with `StatusBadge`. |
| `src/components/DecisionForm.tsx` | Client generic note + decision buttons form bound to a server action returning `OperationResult`; `notice`, `readOnlyMessage`. |
| `src/components/StatusBadge.tsx` | Status → Bootstrap colour + label (`statusLabel`). |
| `src/components/OperationFeedback.tsx` | Renders an `OperationResult` as success/danger alert. |
| `src/components/PageHeader.tsx` | Page title + description. |
| `src/lib/workflows.ts` | Nav registry; flip `available: true` when a workflow ships. |
| `src/lib/session.ts` | `getDemoRole()` — reads cookie, defaults to `kyc_reviewer`, unknown → `null`. |
| `src/lib/url.ts` | `withParams(path, currentParams, overrides)` for server-built links. |
| `src/lib/format.ts` | `formatMoney(cents)`, `formatDateTime(iso)`. |
| `src/server/db.ts` | `openDb(path)`, `resetDb(db)` (drop + recreate + seed), `getDb()` singleton (auto-resets if `user_version` ≠ `SCHEMA_VERSION`). |
| `src/server/schema.ts` | All DDL, `SCHEMA_VERSION`, `TABLES` (drop order). |
| `src/server/seed-data.ts` | Hand-written synthetic customers (status, risk, scenario, history). |
| `src/server/seed.ts` | Expands seed-data into rows; deterministic PRNG for transactions/refunds; `SEED_IDS`, `SEED_TIMESTAMP`, `KYC_RESTRICTION_FLAG`. |
| `src/server/lookups.ts` | Read-only queries + row types: customers (`searchCustomers`, `parseCustomerQuery`, `getKycSummary`), checks, decisions, transactions, refunds, `getFeatureFlag`. |
| `src/server/roles.ts` | `ROLES`, `ROLE_LABELS`, `parseRoleClaim` (untrusted claim parsing). |
| `src/server/permissions.ts` | `PERMISSIONS` policy map, `can`, `assertCan`. |
| `src/server/errors.ts` | `OperationError(code, message)` — expected failures. |
| `src/server/operation.ts` | `runAuditedOperation` — atomic change + audit; `OperationResult` type. |
| `src/server/audit.ts` | `writeAuditEvent`, `listAuditEvents`. |
| `src/server/kyc/service.ts` | KYC rules: `decideKyc`, `KYC_TRANSITIONS`, `allowedKycDecisions`, `getApprovalBlockers`, `formatApprovalBlockers`. |
| `src/server/kyc/eligibility.ts` | `isKycRestricted(db, customerId)` — shared gate for other workflows (e.g. Refunds). |
| `scripts/db-reset.ts` | CLI for `npm run db:reset`. |
| `tests/helpers.ts` | `createTestDb()` — fresh seeded `:memory:` DB. |
| `tests/kyc.test.ts`, `tests/seed.test.ts`, `tests/eligibility.test.ts` | Service, seed consistency/determinism, KYC gate tests. |

## Data model

`customers` (kyc_status `pending | info_requested | approved | rejected`, risk_level `low | medium | high`, risk_reason),
`verification_checks` (one row per customer × `identity | address | sanctions | pep`; result `passed | missing | failed | clear | review_required` + `detail`),
`kyc_decisions` (append-only history: decision, from/to status, note, role, time), `transactions`, `refunds`,
`feature_flags` (`kyc_restriction`, OFF), `risk_holds` (empty), `audit_events`.

## Service boundaries

- **`src/server/**` is server-only** and framework-free (no `next/*` imports) so it is testable with Vitest.
  Pages and server actions call it; client components import only **types/constants** from it.
- **`src/app/<workflow>/actions.ts`** is a thin adapter: read `FormData` + `getDemoRole()`, call one service
  function with `getDb()`, `revalidatePath`, return the `OperationResult`. No business logic here.
- **Pages** are server components that read via `lookups.ts`/`audit.ts` and pass plain data to components.

## Conventions (as implemented)

1. **Mutations go through `runAuditedOperation`** (`src/server/operation.ts`). Inside `execute()`, in order:
   `assertCan(role, permission)` → Zod `safeParse` → load row → transition map check → business-rule check →
   guarded `UPDATE … WHERE id = ? AND status = ?` (+ history insert) → return `{ message, details }`.
   Everything plus the `success` audit event commits in one SQLite transaction.
2. **Expected failures** throw `OperationError` with code `validation | forbidden | not_found | invalid_transition | rule_violation`.
   They roll back, are audited with `outcome = 'denied'` (`details.code`), and return `{ ok: false }`.
   Unexpected errors roll back and are rethrown.
3. **One source for rules.** Rule helpers are exported from the service (`allowedKycDecisions`, `getApprovalBlockers`,
   `formatApprovalBlockers`) and the page calls the same functions to show buttons/explanations. The UI never
   re-implements a rule and never relies on hiding a button for enforcement.
4. **Transitions** are an explicit map in the service (`KYC_TRANSITIONS`); terminal states have `[]` (read-only).
5. **Every decision requires a note**; history goes to a per-workflow table (`kyc_decisions`) and the audit log.
6. **Permissions** are added to `PERMISSIONS` in `permissions.ts`; the UI may call `can()` for hints only.
7. **Audit actions** are named `<workflow>.<verb>` (e.g. `kyc.approve`, `kyc.reject`, `kyc.request_info`); `entity_type` is the noun (`customer`).
8. **Queues are URL-driven.** Parse untrusted `searchParams` with a Zod schema using `.catch(default)` (`parseCustomerQuery`),
   whitelist sort columns (`CUSTOMER_SORTS`), page with `LIMIT/OFFSET`. UI: `QueueFilters` + `QueueTable` + `QueuePagination`.
9. **Money** is integer cents (`amount_cents`); format with `formatMoney`.
10. **Services take `now: Date`** as an optional last argument for deterministic tests.
11. **Seed is deterministic**: hand-written `seed-data.ts`, timestamps derived from `SEED_TIMESTAMP`, generated rows from
    a fixed-seed PRNG. Seed invariants (e.g. approved ⇒ all checks pass) are enforced in `seed.ts` and `tests/seed.test.ts`.
12. **Schema changes**: edit `schema.ts`, add the table to `TABLES`, bump `SCHEMA_VERSION`, update seed + tests.
13. **Tests** use `createTestDb()`; never touch `data/portal.db`.

## Gotchas

- React Bootstrap in **server components**: use named sub-components (`CardHeader`, `CardBody`, `ListGroupItem`)
  not dot access (`Card.Header`) — dot access on a client reference is `undefined` in RSC and 500s the page.
  Components that pass functions/elements as props (e.g. `as={Link}`, lucide icons) must be `"use client"`.
- `getDb()` caches the connection on `globalThis`; `npm run db:reset` works while `npm run dev` is running,
  but restart `npm run dev` after a `SCHEMA_VERSION` bump.
- Seed data is dated around `SEED_TIMESTAMP` (2026-01-15); live decisions use the real clock.
- `data/*.db` is git-ignored.

## Keeping docs current

Use `.agents/skills/update-docs/SKILL.md` after any change. To add a workflow, use
`.agents/skills/build-internal-tool/SKILL.md`.
