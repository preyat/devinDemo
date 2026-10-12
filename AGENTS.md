# AGENTS.md

Guide for agents and humans changing this repo. Describes what **exists**, not plans.

## Commands

```bash
npm install
npm run db:reset    # tsx scripts/db-reset.ts — wipe + reseed data/portal.db (or $PORTAL_DB_PATH)
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
| `src/app/kyc/page.tsx` | KYC Review page (server component): queue, detail, audit trail. |
| `src/app/kyc/actions.ts` | `"use server"` adapter: `decideKycAction` → `decideKyc`, then `revalidatePath`. |
| `src/app/kyc/KycDecisionForm.tsx` | Client form using `useActionState`; shows `OperationFeedback`. |
| `src/app/actions/role.ts` | `setDemoRole` server action (writes `demo_role` cookie). |
| `src/components/PortalShell.tsx` | Client navbar + nav links + `DemoRoleSelector`. |
| `src/components/QueueTable.tsx` | Generic table: `columns`, `getRowKey`, optional `getRowHref`, `selectedKey`. |
| `src/components/RecordDetail.tsx` | Card with label/value list + `children` slot for actions. |
| `src/components/StatusBadge.tsx` | Status → Bootstrap colour mapping. |
| `src/components/OperationFeedback.tsx` | Renders an `OperationResult` as success/danger alert. |
| `src/components/PageHeader.tsx` | Page title + description. |
| `src/lib/workflows.ts` | Nav registry; flip `available: true` when a workflow ships. |
| `src/lib/session.ts` | `getDemoRole()` — reads cookie, defaults to `kyc_reviewer`, unknown → `null`. |
| `src/lib/format.ts` | `formatMoney(cents)`, `formatDateTime(iso)`. |
| `src/server/db.ts` | `openDb(path)`, `resetDb(db)`, `getDb()` app singleton (auto-seeds empty DB). |
| `src/server/schema.ts` | All DDL: customers, transactions, refunds, feature_flags, risk_holds, audit_events. |
| `src/server/seed.ts` | Deterministic seed (`SEED_IDS`, `SEED_TIMESTAMP`, `KYC_RESTRICTION_FLAG`). |
| `src/server/lookups.ts` | Read-only queries: customers, transactions, refunds (camelCase row types). |
| `src/server/roles.ts` | `ROLES`, `ROLE_LABELS`, `parseRoleClaim` (untrusted claim parsing). |
| `src/server/permissions.ts` | `PERMISSIONS` policy map, `can`, `assertCan`. |
| `src/server/errors.ts` | `OperationError(code, message)` — expected failures. |
| `src/server/operation.ts` | `runAuditedOperation` — atomic change + audit; `OperationResult` type. |
| `src/server/audit.ts` | `writeAuditEvent`, `listAuditEvents`. |
| `src/server/kyc/service.ts` | `decideKyc` — the KYC business rule (reference workflow). |
| `scripts/db-reset.ts` | CLI for `npm run db:reset`. |
| `tests/helpers.ts` | `createTestDb()` — fresh seeded `:memory:` DB. |
| `tests/kyc.test.ts`, `tests/seed.test.ts` | Service + seed tests. |

## Service boundaries

- **`src/server/**` is server-only** and framework-free (no `next/*` imports) so it is testable with Vitest.
  Pages and server actions call it; client components never import it except for **types/constants**
  (`roles.ts`, `operation.ts` types).
- **`src/app/<workflow>/actions.ts`** is a thin adapter: read `FormData` + `getDemoRole()`, call one service
  function with `getDb()`, `revalidatePath`, return the `OperationResult`. No business logic here.
- **Pages** are server components that read via `lookups.ts`/`audit.ts` and pass plain data to components.

## Conventions (as implemented)

1. **Mutations go through `runAuditedOperation`** (`src/server/operation.ts`). Inside `execute()`, in order:
   `assertCan(role, permission)` → Zod `safeParse` of raw input → load row → check allowed transition →
   `UPDATE … WHERE id = ? AND status = ?` → return `{ message, details }`.
   The update and the `success` audit event commit in one SQLite transaction.
2. **Expected failures** throw `OperationError` with code `validation | forbidden | not_found | invalid_transition`.
   They roll back, are audited with `outcome = 'denied'` (`details.code`), and return `{ ok: false }`.
   Unexpected errors roll back and are rethrown.
3. **Transitions** are an explicit map in the service (see `KYC_TRANSITIONS`).
4. **Permissions** are added to `PERMISSIONS` in `permissions.ts`; the UI may call `can()` for hints only.
5. **Audit actions** are named `<workflow>.<verb>` (e.g. `kyc.approve`, `kyc.reject`), `entity_type` is the table noun (`customer`).
6. **Money** is integer cents (`amount_cents`); format with `formatMoney`.
7. **Services take `now: Date`** as an optional last argument for deterministic tests.
8. **Tests** use `createTestDb()`; never touch `data/portal.db`.

## Gotchas

- React Bootstrap in **server components**: use named sub-components (`CardHeader`, `CardBody`, `CardTitle`)
  not dot access (`Card.Header`) — dot access on a client reference is `undefined` in RSC and 500s the page.
  Components that pass functions as props (e.g. `as={Link}`) must be `"use client"` (see `PortalShell.tsx`).
- `getDb()` caches the connection on `globalThis`; `npm run db:reset` works while `npm run dev` is running.
- `data/*.db` is git-ignored.

## Keeping docs current

Use `.agents/skills/update-docs/SKILL.md` after any change. To add a workflow, use
`.agents/skills/build-internal-tool/SKILL.md`.
