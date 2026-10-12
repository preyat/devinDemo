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
npm run smoke       # browser smoke test against a running `npm run dev` (resets DB before/after)
                    # on the Devin VM: SMOKE_CDP_URL=http://localhost:29229 npm run smoke
npm run new:workflow -- <slug> [--entity <type>] [--role <role>]   # scaffold a workflow on the shared architecture
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, typecheck, lint, test and `db:reset` on every PR.

## Playbooks

- `playbooks/build-internal-tool.devin.md` — short, general task template; source for the Devin playbook
  `!build-internal-tool` (registered manually in the Devin UI — editing the file does not update the registered copy).
  It requires invoking the repo skill `build-internal-tool`.
- `docs/playbooks/ops-portal-tool.md` — detailed repo procedure (source for `!ops_portal_tool`; keep both in sync).

## Skills (in `.agents/skills/`, auto-discovered — use them)

| Skill | When |
| ----- | ---- |
| `plan-internal-tool` | Start of a new workflow: write the one-page spec. |
| `build-internal-tool` | Implement a workflow end-to-end (scaffold → rules → tests → UI → verify → PR). |
| `add-seed-data` | Any schema or seed change; preserves demo scenarios + realism invariants. |
| `browser-check` | Run/extend `npm run smoke`. |
| `review-internal-tool` | Pre-PR checklist + architecture greps. |
| `update-docs` | Keep README / AGENTS.md / architecture accurate. |
| `capture-session-learnings` | End of session: fold decisions, corrections and gotchas into docs/skills. |

Run `typecheck`, `lint` and `test` before every commit. Node 24 via nvm on the dev VM (`source ~/.nvm/nvm.sh`).

## Stack

Next.js 15 App Router · React 19 · TypeScript · React Bootstrap 2 + Bootstrap 5 (compiled from SCSS with `sass`) ·
Dashio-derived theme (Inter font, sidebar layout, light/dark) · lucide-react · better-sqlite3 (synchronous, no ORM) · Zod 3 · Vitest 3.

## File map

| Path | Responsibility |
| ---- | -------------- |
| `src/app/layout.tsx` | Root layout; imports Inter + `portal.scss`, reads demo role + theme cookies, renders `PortalShell`. |
| `src/styles/_variables.scss` | Bootstrap variable overrides (colours, Inter, radii, shadows, `$sidebar-width`), adapted from Dashio (MIT). |
| `src/styles/portal.scss` | Imports Bootstrap SCSS + light/dark tokens + sidebar/header layout. The only global stylesheet. |
| `src/app/page.tsx` | Home: workflow cards from `src/lib/workflows.ts`. |
| `src/app/kyc/page.tsx` | KYC queue (server component): summary cards, URL-driven filters, full-width paginated queue; rows open `/kyc/<id>` carrying the queue params. Legacy `?customer=` redirects. |
| `src/app/kyc/[customerId]/page.tsx` | KYC case page: `RecordNav` (back to filtered queue, prev/next), header (status, risk, review type, why open), `RecordTabs` Overview (profile, risk, checks, decision) / Activity (transactions, refunds) / History (decisions, audit). |
| `src/app/refunds/[refundId]/page.tsx` | Refund page: same pattern as the KYC case page (`RecordNav`, header with eligibility codes, `RecordTabs` Overview (fields, `canProcessRefund` checks, process form) / Activity (payout, sibling refunds) / History (audit)). `/refunds?refund=` redirects here. |
| `src/app/kyc/actions.ts` | `"use server"` adapter: `decideKycAction` → `decideKyc`, then `revalidatePath("/kyc", "layout")` (covers case pages). |
| `src/app/kyc/KycDecisionForm.tsx` | Client wrapper configuring `DecisionForm` with KYC buttons/icons and the blocked-approval notice. |
| `src/app/refunds/page.tsx` | Refunds queue (server component): summary cards, active-flag banner, full-width refund queue with per-row eligibility badges; rows open `/refunds/<id>` with the queue params. |
| `src/app/refunds/actions.ts` | `processRefundAction` → `processRefund`, `revalidatePath("/refunds", "layout")`. |
| `src/app/refunds/ProcessRefundForm.tsx` | Client wrapper around `DecisionForm` (single "Process refund" button, role/blocked notices, read-only when closed). |
| `src/app/feature-flags/page.tsx` | Feature Flags (server component): flag table, detail (registry metadata, refunds currently blocked by the flag, toggle form, audit). |
| `src/app/feature-flags/actions.ts` | `toggleFeatureFlagAction` → `toggleFeatureFlag`; revalidates `/feature-flags` and `/refunds`. |
| `src/app/feature-flags/ToggleFlagForm.tsx` | Client wrapper around `DecisionForm` with Turn ON / Turn OFF (from `allowedFlagDecisions`). |
| `src/app/actions/role.ts` | `setDemoRole` server action (writes `demo_role` cookie). |
| `src/components/PortalShell.tsx` | Client app chrome: sidebar nav from `WORKFLOWS` (active state, "Soon" for unavailable, mobile off-canvas) + sticky header with `DemoRoleSelector` and `ThemeToggle`. |
| `src/components/ThemeToggle.tsx` | Client light/dark toggle (`data-bs-theme` + `theme` cookie). |
| `src/components/QueueTable.tsx` | Generic table: `columns` (optional `className`), `getRowKey`, optional `getRowHref` (whole row clickable), `selectedKey`. |
| `src/components/ClickableRow.tsx` | Client `<tr>` that navigates on click (ignores clicks on links/buttons/inputs). |
| `src/components/QueueFilters.tsx` | Client, URL-driven search box + select filters; any change resets `page`. |
| `src/components/QueuePagination.tsx` | Client prev/next/page links preserving other URL params + "Showing x–y of n". |
| `src/components/SummaryCards.tsx` | Row of metric cards (`label`, `value`, `variant`). |
| `src/components/RecordDetail.tsx` | `RecordFields` (label/value list) and `RecordDetail` (card wrapping it + `children`). |
| `src/components/RecordTabs.tsx` | Client tabs for a record page; server-rendered tab content passed as props. |
| `src/components/RecordNav.tsx` | Case-page nav: back to filtered queue, "x of n", previous/next links. |
| `src/components/VerificationChecklist.tsx` | List of `{ label, status, detail }` with `StatusBadge`. |
| `src/components/DecisionForm.tsx` | Client generic note + decision buttons form bound to a server action returning `OperationResult`; `notice`, `readOnlyMessage`, `successAction` (e.g. "Next case"). |
| `src/components/StatusBadge.tsx` | Status → Bootstrap colour + label (re-exports `statusLabel`). |
| `src/components/OperationFeedback.tsx` | Renders an `OperationResult` as success/danger alert. |
| `src/components/PageHeader.tsx` | Page title + description. |
| `src/lib/workflows.ts` | Nav registry (`name`, `href`, `description`, `available`, lucide `icon`); flip `available: true` when a workflow ships. |
| `src/lib/theme.ts` | `Theme`, `THEME_COOKIE`, `parseTheme` (shared by server layout and client toggle). |
| `src/lib/session.ts` | `getDemoRole()` — reads cookie, defaults to `kyc_reviewer`, unknown → `null`. |
| `src/lib/url.ts` | `withParams(path, currentParams, overrides)` for server-built links. |
| `src/lib/format.ts` | `formatMoney(cents)`, `formatDateTime(iso)`. |
| `src/lib/labels.ts` | `statusLabel(status)` — plain module so services can build messages with it. |
| `src/server/db.ts` | `openDb(path)`, `resetDb(db)` (drop + recreate + seed), `getDb()` singleton (auto-resets if `user_version` ≠ `SCHEMA_VERSION`). |
| `src/server/schema.ts` | All DDL, `SCHEMA_VERSION`, `TABLES` (drop order). |
| `src/server/seed-data.ts` | Hand-written synthetic customers (status, risk, scenario, history). |
| `src/server/seed.ts` | Expands seed-data into rows; deterministic PRNG for transactions/refunds; `SEED_IDS`, `SEED_TIMESTAMP`; one `feature_flags` row per definition; one payout per processed refund. |
| `src/server/lookups.ts` | Read-only queries + row types: customers (`searchCustomers`, `parseCustomerQuery`, `getCustomerQueueNeighbours`, `getKycSummary`), checks, decisions, transactions; refunds (`searchRefunds`, `parseRefundQuery`, `getRefund`, `getRefundSummary`, `listRefundsForTransaction`, `listPendingRefundIds`, `listPayoutsForRefund`); `getFeatureFlag`, `listFeatureFlags`. |
| `src/server/roles.ts` | `ROLES`, `ROLE_LABELS`, `parseRoleClaim` (untrusted claim parsing). |
| `src/server/permissions.ts` | `PERMISSIONS` policy map, `can`, `assertCan`. |
| `src/server/errors.ts` | `OperationError(code, message, details?)` — expected failures; `details` (e.g. `{ reasons }`) is merged into the denied audit row. |
| `src/server/operation.ts` | `runAuditedOperation` — atomic change + audit; `OperationResult` type. |
| `src/server/audit.ts` | `writeAuditEvent`, `listAuditEvents`. |
| `src/server/kyc/service.ts` | KYC rules: `decideKyc`, `KYC_TRANSITIONS`, `allowedKycDecisions`, `getApprovalBlockers`, `formatApprovalBlockers`. |
| `src/server/kyc/eligibility.ts` | `isKycRestricted(db, customerId)` — KYC gate driven by flag `block_refunds_unverified_kyc`; used by Refunds. |
| `src/server/refunds/service.ts` | `REFUND_RULES` (ordered, single source), `canProcessRefund` (structured reasons), `businessBlockers`, `formatRefundBlockers`, `processRefund`. |
| `src/server/feature-flags/definitions.ts` | Flag registry (`FEATURE_FLAGS`, key constants, `HIGH_VALUE_REFUND_LIMIT_CENTS`). |
| `src/server/feature-flags/service.ts` | `isFeatureEnabled`, `allowedFlagDecisions`, `toggleFeatureFlag`. |
| `scripts/db-reset.ts` | CLI for `npm run db:reset`. |
| `scripts/smoke.mjs` | Playwright (playwright-core) browser smoke checks; extend per workflow. |
| `scripts/new-workflow.ts` | Scaffold generator for `npm run new:workflow`. |
| `tests/helpers.ts` | `createTestDb()` — fresh seeded `:memory:` DB. |
| `tests/kyc.test.ts`, `tests/seed.test.ts`, `tests/eligibility.test.ts` | Service, seed consistency/determinism, KYC gate tests. |
| `tests/refunds.test.ts`, `tests/feature-flags.test.ts` | Refund eligibility/processing (Maya, Jordan, Ben, David, roles, audit, rollback) and flag administration. |

## Data model

`customers` (kyc_status `pending | info_requested | approved | rejected`, risk_level `low | medium | high`, risk_reason,
review_type `onboarding | periodic_refresh | triggered` + review_reason + review_opened_at = why the current KYC case exists; applied_at = original application),
`verification_checks` (one row per customer × `identity | address | sanctions | pep`; result `passed | missing | failed | clear | review_required` + `detail`),
`kyc_decisions` (append-only history: decision, from/to status, note, role, time; `open_review` rows are written by role `system` when an existing customer is re-reviewed), `transactions`,
`refunds` (status `pending | processed | rejected`; closed rows have `processed_at`, `processed_by_role`, `processing_note`),
`refund_payouts` (simulated money movement; `UNIQUE(refund_id)` — one per processed refund),
`feature_flags` (`key`, `enabled`, `description`, `updated_at`, `updated_by_role`; seeded from `definitions.ts`), `risk_holds` (empty), `audit_events`.

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
4a. **Multi-rule eligibility** uses an ordered rule list + `can<Action>(db, role, id)` returning
   `{ eligible, checks, reasons[{code,message}], errorCode }` (`REFUND_RULES`/`canProcessRefund`). The service throws
   `OperationError(errorCode, message, { reasons })`; the page renders `checks`. New rules (e.g. risk holds) are appended there only.
4b. **Money movement** is a separate insert guarded by a UNIQUE key (`refund_payouts.refund_id`) inside the same transaction as the status change.
4c. **Feature flags** are declared in `feature-flags/definitions.ts` and read with `isFeatureEnabled` at decision time (never cached).
5. **Every decision requires a note**; history goes to a per-workflow table (`kyc_decisions`) and the audit log.
6. **Permissions** are added to `PERMISSIONS` in `permissions.ts`; the UI may call `can()` for hints only.
7. **Audit actions** are named `<noun>.<verb>` (`kyc.approve`, `refund.process`, `feature_flag.enable`); `entity_type` is the noun (`customer`, `refund`, `feature_flag`). Permissions use the same style (`kyc.decide`, `refund.process`, `feature_flag.toggle`).
8. **Queues are URL-driven.** Parse untrusted `searchParams` with a Zod schema using `.catch(default)` (`parseCustomerQuery`),
   whitelist sort columns (`CUSTOMER_SORTS`), page with `LIMIT/OFFSET`. UI: `QueueFilters` + `QueueTable` + `QueuePagination`.
9. **Money** is integer cents (`amount_cents`); format with `formatMoney`.
10. **Services take `now: Date`** as an optional last argument for deterministic tests.
11. **Seed is deterministic**: hand-written `seed-data.ts`, timestamps derived from `SEED_TIMESTAMP`, generated rows from
    a fixed-seed PRNG. Seed invariants are enforced in `seed.ts` and `tests/seed.test.ts`: approved ⇒ all checks pass;
    never-approved applicants (onboarding) have no transactions/refunds; activity only after the first approval;
    open cases with history are re-reviews (`existing` in `seed-data.ts`) with an `approve` → `open_review` trail.
12. **Schema changes**: edit `schema.ts`, add the table to `TABLES`, bump `SCHEMA_VERSION`, update seed + tests.
13. **Tests** use `createTestDb()`; never touch `data/portal.db`.
14. **Styling**: theme via `src/styles/_variables.scss`; layout/token rules in `portal.scss`. In components use
    Bootstrap/React Bootstrap + utility classes only (no new CSS files, no inline styles beyond sizing).
    Use `stat-card` for metric cards and `className: "text-nowrap"` on short `QueueTable` columns (dates, names).

## Gotchas

- Record pages: compute "Next" before the decision and keep it in client state (`useState(nextHref)`); a decision changes `updated_at`, which can re-sort the queue and make a recomputed Next point backwards. Render disabled prev/next as `<span>`, not `Link href="#"`.
- React Bootstrap in **server components**: use named sub-components (`CardHeader`, `CardBody`, `ListGroupItem`)
  not dot access (`Card.Header`) — dot access on a client reference is `undefined` in RSC and 500s the page.
  Components that pass functions/elements as props (e.g. `as={Link}`, lucide icons) must be `"use client"`.
- Never import constants from a `"use client"` module into a server component — the server gets a client reference,
  not the value (this broke the theme cookie once). Put shared constants in `src/lib/*` without `"use client"`.
- Bootstrap's `--bs-offcanvas-zindex` is only defined on `.offcanvas`; use the Sass `$zindex-offcanvas` instead.
- Sass deprecation noise from Bootstrap is silenced in `next.config.ts` (`sassOptions`).
- `getDb()` caches the connection on `globalThis`; `npm run db:reset` works while `npm run dev` is running,
  but restart `npm run dev` after a `SCHEMA_VERSION` bump.
- Seed data is dated around `SEED_TIMESTAMP` (2026-01-15); live decisions use the real clock.
- `data/*.db` is git-ignored.
- `DecisionForm` keeps its `useActionState` result only while mounted: give wrappers a `key` that is stable across the
  mutation (record id, not record state) or the success feedback vanishes when revalidation re-renders (hit on Feature Flags).
- `npm run new:workflow` output is a stub: it generates `<slug>.decide` permissions, a decide/approve/reject form and
  `it.todo` tests that pass green — rename, replace and delete them; a green run right after scaffolding proves nothing.
- Smoke checks share one DB per run (reset only before/after), so order them as one story (e.g. flag ON → Maya blocked →
  KYC approves Maya → refund processes). Use a second tab with the stale form to exercise double-submit.
- Devin VM: the repo skill may not be in the Devin skill catalog; read `.agents/skills/<name>/SKILL.md` directly.

## Keeping docs current

Use `.agents/skills/update-docs/SKILL.md` after any change. To add a workflow, use
`.agents/skills/build-internal-tool/SKILL.md`.
