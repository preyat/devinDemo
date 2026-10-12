---
name: fix-internal-tool
description: Fix a bug or make a small maintenance change in an EXISTING Ops Portal workflow (KYC Review, Refunds, Feature Flags) — green baseline, reproduce with a failing test or smoke check first, fix in the right layer (src/server/<workflow>/service.ts), keep the audit/permission/single-source-rule invariants, verify and open a PR with evidence. Use for any change that is not a new workflow.
---

# Fix an internal tool workflow

Scope: change existing behaviour, not add a workflow (that is `build-internal-tool`). Keep the diff minimal; no new
frameworks, layers or a generic engine. References: KYC (transition map + blockers), Refunds (`REFUND_RULES` +
`canProcessRefund`), Feature Flags (`definitions.ts` registry + `isFeatureEnabled`).

## Procedure

1. **Orient on a green baseline** — `git pull --ff-only` on the base branch; read `AGENTS.md` (file map, conventions)
   and `docs/architecture.md` (rules table). `source ~/.nvm/nvm.sh && npm ci && npm run db:reset && npm test` must
   pass before you change anything; if it does not, report that separately from the bug.
2. **Reproduce first** — turn the report into an executable failure before touching code:
   - Rule/data/permission/audit bug → a failing Vitest case in the workflow's existing `tests/<workflow>.test.ts`
     (`createTestDb()` from `tests/helpers.ts`; name it after the bug). Run it and see it fail.
   - UI-only/flow bug → a failing check in `scripts/smoke.mjs` (`npm run dev` +
     `SMOKE_CDP_URL=http://localhost:29229 npm run smoke`, see `browser-check`), plus a Vitest case if a rule is involved.
   - Cannot reproduce → stop and report what you tried, with the seeded record IDs used.
3. **Locate the right layer** (fix the root cause there, not the symptom elsewhere):
   - Business rules, transitions, eligibility, reason/error codes → `src/server/<workflow>/service.ts`
     (cross-workflow gates: `isKycRestricted` in `src/server/kyc/eligibility.ts`, `isFeatureEnabled` in
     `src/server/feature-flags/service.ts`, flag registry in `src/server/feature-flags/definitions.ts`).
   - Queue reads, filters, sort, neighbours → `src/server/lookups.ts`. Roles/permissions → `src/server/permissions.ts`.
   - Seed/schema → `add-seed-data` (bump `SCHEMA_VERSION`, keep demo scenarios + `tests/seed.test.ts`).
   - Rendering only → `src/app/<workflow>/…` / `src/components/`. Never patch a rule in a component or page.
4. **Preserve invariants**
   - Mutations stay inside `runAuditedOperation`: permission → Zod → `can<Action>`/transition map → guarded
     `UPDATE … WHERE id = ? AND status = ?` → history/audit, all in one transaction.
   - Rules stay single-source: change the rule list/helper in the service; the page keeps calling the exported helper.
   - Denied attempts still throw `OperationError` and are audited as `denied` (with `details.reasons`), mutating nothing.
   - Existing tests are not weakened or deleted to make the fix pass; if one encoded the bug, change it and say why in the PR.
5. **Verify** — the new test now passes; `npm run typecheck && npm run lint && npm test`; architecture greps from
   `.agents/skills/review-internal-tool/SKILL.md` (each prints nothing); `npm run dev` + `npm run smoke` for any change
   reachable from the UI. `npm run db:reset` afterwards.
6. **Docs** — `update-docs` (only what changed: rules table, README scenarios, AGENTS.md) + `capture-session-learnings`
   (add the root cause / gotcha to the relevant skill or AGENTS.md if it could recur).
7. **PR** — branch `devin/<timestamp>-fix-<slug>`; never commit `data/*.db` or screenshots. PR body: bug + repro
   (failing test name / smoke check), root cause and layer, fix, invariants checked, commands + results, limitations.
