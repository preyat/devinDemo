---
name: build-internal-tool
description: Add a new workflow (e.g. Refunds, Feature Flags, Transaction Risk Review) to the Ops Portal by reusing the KYC Review patterns — shared components, server-side permission checks, atomic state change + audit, Vitest tests, browser check and PR.
---

# Build an internal tool workflow

Reference implementation: KYC Review. Copy its shape; do not invent new layers.

## Procedure

1. **Orient** — read `AGENTS.md` (file map, conventions, gotchas) and `docs/architecture.md`
   ("Adding another workflow"). Run `npm install && npm run db:reset && npm test` to confirm a green baseline.
2. **Study the reference slice**:
   - service: `src/server/kyc/service.ts` (`decideKyc`, `kycDecisionSchema`, `KYC_TRANSITIONS`)
   - atomic+audit wrapper: `src/server/operation.ts` (`runAuditedOperation`, `OperationResult`)
   - action adapter: `src/app/kyc/actions.ts`; form: `src/app/kyc/KycDecisionForm.tsx`; page: `src/app/kyc/page.tsx`
   - tests: `tests/kyc.test.ts`, helper `tests/helpers.ts`
3. **Server rules first**
   - Add the permission to `PERMISSIONS` in `src/server/permissions.ts`.
   - Add reads to `src/server/lookups.ts` only if missing (customers, transactions, refunds exist; seed IDs in `src/server/seed.ts`).
   - Create `src/server/<workflow>/service.ts`: inside `runAuditedOperation({ execute })` do
     `assertCan` → Zod `safeParse` → load row → transition map check → guarded `UPDATE … WHERE id = ? AND status = ?`.
     Throw `OperationError` (`validation|forbidden|not_found|invalid_transition`) for expected failures.
     Audit action name: `<workflow>.<verb>`. Accept `now: Date = new Date()` for deterministic tests.
   - Schema/seed changes go in `src/server/schema.ts` / `src/server/seed.ts`; keep seed deterministic.
4. **Tests** — `tests/<workflow>.test.ts` with `createTestDb()`: success + persisted state, each forbidden role,
   invalid transition, validation error, success/denied audit rows (`listAuditEvents`). Run `npm test`.
5. **UI** — reuse `PageHeader`, `QueueTable`, `RecordDetail`, `StatusBadge`, `OperationFeedback` from
   `src/components/`. Thin `"use server"` action calling the service with `getDb()` + `getDemoRole()`, then
   `revalidatePath`. Client form with `useActionState`; keep feedback rendered after state changes.
   In server components use `CardHeader`/`CardBody` (not `Card.Header`). Set `available: true` in `src/lib/workflows.ts`.
6. **Verify** — `npm run typecheck && npm run lint && npm test`; `npm run db:reset && npm run dev`, then in the
   browser exercise: allowed role success, forbidden role blocked (switch the DEMO role selector), audit trail rows.
   Reset the DB afterwards.
7. **Docs** — follow `.agents/skills/update-docs/SKILL.md` (AGENTS.md file map, architecture diagram, README).
8. **PR** — branch `devin/<timestamp>-<slug>`, commit only source/docs (never `data/*.db`), open a PR listing
   commands run + results, browser verification status, limitations and time spent.
