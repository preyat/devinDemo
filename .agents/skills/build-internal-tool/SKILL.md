---
name: build-internal-tool
description: Add a new workflow (e.g. Transaction Risk Review) to the Ops Portal by reusing the KYC/Refunds/Feature Flags patterns — shared components, server-side permission and business-rule checks, structured eligibility, atomic state change + audit, Vitest tests, browser smoke and PR.
---

# Build an internal tool workflow

References: **KYC Review** (transition map + blockers), **Refunds** (ordered rule list + `canProcessRefund` with
structured reasons, guarded money movement), **Feature Flags** (registry + Risk-Admin-only toggle read at decision time).
Copy their shape; do not invent new layers or a generic workflow engine.

## Procedure

1. **Orient (≈10 min)** — `git pull --ff-only` on the base branch; read `AGENTS.md` (file map, conventions, gotchas)
   and `docs/architecture.md`. `source ~/.nvm/nvm.sh && npm ci && npm run db:reset && npm test` → green baseline
   (Session 2 baseline: 26 tests; after Session 2: 51). If the VM snapshot lacks `node_modules`, `npm ci` fixes it.
2. **Resolve ambiguity in the request before coding**: name every rule, its reason code, error code and which role
   may act. If the request contradicts itself, implement the narrow reading and say so in the PR.
3. **Scaffold** — `npm run new:workflow -- <slug> --entity <type> --role <role>`. It is a stub: rename the
   `<slug>.decide` permission to `<noun>.<verb>`, replace the decide form and delete the `it.todo` tests.
4. **Server rules first** (`src/server/<workflow>/service.ts`)
   - Reads → `src/server/lookups.ts` (`parse<X>Query` with `.catch()` defaults, `search<X>`, `get<X>`, summary).
   - One rule → transition map + exported helper (KYC). Several rules → ordered `RULES` array
     `{ code, label, errorCode, check }` + `can<Action>(db, role, id)` returning `{ eligible, checks, reasons, errorCode }`
     (Refunds). Put the role check in the rule list so the page can show it, and order by error precedence.
   - Mutation inside `runAuditedOperation`: Zod → `can<Action>` (throw `OperationError(errorCode, msg, { reasons })`)
     → guarded `UPDATE … WHERE id = ? AND status = ?` (check `changes`) → history / money insert with a UNIQUE key
     → return `{ message, details }`. Accept `now: Date = new Date()`.
   - Reuse cross-workflow gates: `isKycRestricted`, `isFeatureEnabled`, existing `REFUND_RULES` (Session 3: add
     `RISK_HOLD_ACTIVE` there, reading `risk_holds`). New flags go in `feature-flags/definitions.ts` with `blockCode`.
   - Schema/seed: follow `add-seed-data` (bump `SCHEMA_VERSION`, update `TABLES`, restart `npm run dev`).
     Preserve Maya, Samira, Jordan, Alex, Ben, David; add a seed test for every new scenario/invariant.
5. **Tests** — `tests/<workflow>.test.ts` with `createTestDb()`: each reason code, success + persisted state,
   repeat attempt, every forbidden role (`it.each`, incl. `null`), validation, not found, success/denied audit rows
   with `details.reasons`, no mutation on denial, rollback when `audit_events` is dropped. Run `npm test`.
6. **UI** — queue page + case page, like `src/app/kyc/page.tsx` + `src/app/kyc/[customerId]/page.tsx`
   (user feedback: a detail panel beside the queue felt cramped; reviewers want a focused case page).
   Queue: `PageHeader`, `SummaryCards`, `QueueFilters`, full-width `QueueTable` with rows linking to
   `/<workflow>/<id>` + current queue params (`withParams`), `QueuePagination`. Case: `RecordNav` (back keeps filters;
   prev/next via a `get<X>QueueNeighbours` lookup sharing the queue's WHERE + ORDER BY), header card (status + why it
   needs attention), `RecordTabs` (Overview incl. decision form / Activity / History+audit), `RecordFields`,
   `VerificationChecklist` (render `can<Action>().checks`), `StatusBadge`, `DecisionForm` via a tiny client wrapper
   (`key` = record id; `successAction` = "Next" link). Actions `revalidatePath("/<workflow>", "layout")`. Pages call the
   service helpers — never re-derive a rule. Keep the action button visible-but-annotated for wrong roles so the
   backend rejection is demonstrable. `CardHeader`/`CardBody` in server components. Set `available: true` in
   `src/lib/workflows.ts`. Single-page admin lists without a "case" (Feature Flags) may stay on one page.
7. **Verify** — `npm run typecheck && npm run lint && npm test`; architecture greps from `review-internal-tool`;
   `npm run dev` + `SMOKE_CDP_URL=http://localhost:29229 npm run smoke` with new checks ordered as one story
   (see `browser-check`). Capture screenshots outside the repo for the PR. `npm run db:reset` afterwards.
8. **Docs** — `update-docs` + `capture-session-learnings` (README scenarios, AGENTS.md file map/conventions,
   architecture diagram + rules table, this skill).
9. **PR** — branch `devin/<timestamp>-<slug>`; never commit `data/*.db` or screenshots. PR body: modules reused /
   new / existing services changed, rule table, commands + results, smoke output, screenshots, manual interventions,
   limitations, time spent.

## Measured lessons (Sessions 1–2)

- Session 2 implementation (two workflows, 25 new tests, 4 smoke checks, docs) took ~1 session; most time went to
  rules/tests, not UI, because shared components covered every screen.
- The only smoke failure was a remounting form `key` that hid the success alert — check feedback after every mutation.
- Moving `statusLabel` to `src/lib/labels.ts` let services format messages without importing a component.
- Adding more actions to an existing queue (Refunds reject/partial/claim/bulk): tag shared rules with the `actions` they
  gate instead of writing a second rule list; check the action's permission before Zod; batch operations loop over the
  single-item service (nested savepoints) so each item keeps its own audit row; extend `DecisionForm` via `extraFields`
  rather than writing a new form component.
