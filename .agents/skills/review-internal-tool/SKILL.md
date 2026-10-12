---
name: review-internal-tool
description: Pre-PR review checklist for Ops Portal changes — verifies business rules live in backend services, mutations are permission-checked and audited atomically, the UI never enforces rules alone, seed invariants are tested, docs are current and the PR report is complete. Run before opening or updating any PR.
---

# Review an internal tool change

Run each check; fix anything that fails before opening/updating the PR.

## Automated

```bash
npm run typecheck && npm run lint && npm test
npm run dev                                          # another shell
SMOKE_CDP_URL=http://localhost:29229 npm run smoke   # on the Devin VM; omit SMOKE_CDP_URL locally
```

## Architecture greps (each should print nothing)

```bash
grep -rn "db.prepare\|getDb()" src/components            # components never touch the DB
grep -rln "UPDATE \|INSERT INTO" src/app                  # no writes in pages/actions
grep -rn "from \"next" src/server                        # services stay framework-free
grep -rLn "runAuditedOperation" src/server/*/service.ts   # every service mutates via the wrapper
```

## Manual checklist

- [ ] Each mutation: `assertCan` → Zod → load → transition map → business rules → guarded `UPDATE … WHERE id = ? AND status = ?`
      inside `runAuditedOperation` (state change + success audit in one transaction).
- [ ] Expected failures use `OperationError` codes and are audited as `denied`.
- [ ] Rule helpers (allowed decisions, blocker reasons) are exported from the service and reused by the page; no
      duplicated rule logic in components; hidden/disabled buttons are hints only.
- [ ] New permission in `PERMISSIONS`; audit actions named `<key>.<verb>`; every decision requires a note; terminal states read-only.
- [ ] Tests: success+persistence, each forbidden role, invalid transition, each rule violation, validation, audit rows.
- [ ] Seed changes keep `tests/seed.test.ts` invariants and the demo customers in `docs/demo.md` intact; reset is deterministic.
- [ ] UI uses `src/components/`, Bootstrap utilities, `CardHeader`/`CardBody` in server components, no constants imported
      from `"use client"` modules into server code; nav entry has `available: true` + `icon`.
- [ ] Smoke check added to `scripts/smoke.mjs`.
- [ ] Docs updated (`update-docs`) and session learnings captured (`capture-session-learnings`).
- [ ] `data/*.db` and screenshots not committed.

## PR report must include

Commands run + results, browser/smoke verification (screenshots), limitations, time spent, human interventions.
