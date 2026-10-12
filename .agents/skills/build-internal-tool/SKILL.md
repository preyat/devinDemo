---
name: build-internal-tool
description: Add a new workflow (e.g. Refunds, Feature Flags, Transaction Risk Review) to the Ops Portal by reusing the KYC Review patterns — shared components, server-side permission and business-rule checks, atomic state change + audit, Vitest tests, browser check and PR.
---

# Build an internal tool workflow

Reference implementation: KYC Review. Copy its shape; do not invent new layers or a generic workflow engine.

## Procedure

1. **Orient** — read `AGENTS.md` (file map, data model, conventions, gotchas) and `docs/architecture.md`
   ("KYC rules", "Adding another workflow"). Run `npm install && npm run db:reset && npm test` for a green baseline.
2. **Study the reference slice**:
   - rules + mutation: `src/server/kyc/service.ts` (`decideKyc`, `KYC_TRANSITIONS`, `allowedKycDecisions`, `getApprovalBlockers`)
   - cross-workflow gate: `src/server/kyc/eligibility.ts` (`isKycRestricted` — Refunds must use it)
   - atomic+audit wrapper: `src/server/operation.ts` (`runAuditedOperation`, `OperationResult`)
   - queue reads: `src/server/lookups.ts` (`parseCustomerQuery`, `searchCustomers`, `getKycSummary`)
   - action adapter `src/app/kyc/actions.ts`; form wrapper `src/app/kyc/KycDecisionForm.tsx`; page `src/app/kyc/page.tsx`
   - tests: `tests/kyc.test.ts`, `tests/seed.test.ts`, `tests/eligibility.test.ts`, helper `tests/helpers.ts`
3. **Server rules first**
   - Add the permission to `PERMISSIONS` in `src/server/permissions.ts`.
   - Add reads to `src/server/lookups.ts` (refund/transaction lookups exist; seed IDs in `src/server/seed.ts` `SEED_IDS`).
   - Create `src/server/<workflow>/service.ts`: inside `runAuditedOperation({ execute })` do
     `assertCan` → Zod `safeParse` → load row → transition map → business rules → guarded `UPDATE … WHERE id = ? AND status = ?`.
     Throw `OperationError` (`validation|forbidden|not_found|invalid_transition|rule_violation`).
     Export rule helpers (allowed actions, blocker reasons) so the page reuses them instead of duplicating logic.
     Audit action: `<workflow>.<verb>`. Accept `now: Date = new Date()`.
   - Schema/seed changes: `src/server/schema.ts` (bump `SCHEMA_VERSION`, update `TABLES`), `src/server/seed-data.ts` / `seed.ts`.
     Keep seed deterministic and preserve the demo customers listed in `README.md`.
4. **Tests** — `tests/<workflow>.test.ts` with `createTestDb()`: success + persisted state, each forbidden role,
   invalid transition, rule violation, validation error, success/denied audit rows (`listAuditEvents`). Run `npm test`.
5. **UI** — queue page + case page, like `src/app/kyc/page.tsx` and `src/app/kyc/[customerId]/page.tsx`
   (user feedback: a side panel next to the queue felt cramped; reviewers want a focused case page).
   Queue: `PageHeader`, `SummaryCards`, `QueueFilters`, full-width `QueueTable` with rows linking to
   `/<workflow>/<id>` + current queue params, `QueuePagination`. Case: `RecordNav` (back/prev/next via a
   neighbours lookup sharing the queue's WHERE + ORDER BY), header card with status and why it needs attention,
   `RecordTabs` (Overview incl. decision form / Activity / History+audit), `RecordFields`, `VerificationChecklist`,
   `StatusBadge`, `DecisionForm` (+ `OperationFeedback`; pass `successAction` = Next link).
   Thin `"use server"` action calling the service with `getDb()` + `getDemoRole()`, then `revalidatePath("/<workflow>", "layout")`.
   Build row links with `withParams` (`src/lib/url.ts`). In server components use `CardHeader`/`CardBody`
   (not `Card.Header`); pass icons only from client components. Set `available: true` (and an `icon`) in
   `src/lib/workflows.ts` so the sidebar links it. Style with Bootstrap utilities; theme tokens live in `src/styles/`.
6. **Verify** — `npm run typecheck && npm run lint && npm test`; `npm run db:reset && npm run dev`, then in the
   browser exercise: allowed role success, rule-blocked action with explanation, forbidden role (switch the DEMO
   role selector), audit trail rows, queue filters. Reset the DB afterwards.
7. **Docs** — follow `.agents/skills/update-docs/SKILL.md` (AGENTS.md file map, architecture diagram, README).
8. **PR** — branch `devin/<timestamp>-<slug>`, commit only source/docs (never `data/*.db`), open a PR listing
   commands run + results, browser verification status, limitations and time spent.
