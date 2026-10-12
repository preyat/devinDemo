# !build-internal-tool — implement a workflow in an existing internal-tools repo

Source of truth for the Devin playbook `!build-internal-tool`. Registering it is a manual step in the Devin UI
(Settings → Playbooks → Create, macro `!build-internal-tool`, paste this file); re-paste after edits.

## Inputs (from the user)
- Repo + base branch, and the tool/change to build (roles, rules, data, acceptance tests).
- Anything explicitly out of scope.

## Procedure
1. **Read repo instructions first**: `AGENTS.md` (or `CLAUDE.md`/`CONTRIBUTING.md`), `README.md`, `docs/architecture.md`,
   and any `.agents/skills/*`, `.cursor/rules`, or `docs/playbooks/*`. Sync the base branch and get a green baseline
   (install, reset/seed data, run the existing tests) before changing anything.
2. **Invoke the repo-specific skill explicitly**: `skill_invoke build-internal-tool` (fallback: read
   `.agents/skills/build-internal-tool/SKILL.md` directly if it is not in the catalog) and follow it step by step;
   say in the PR if you deviate.
3. **Use the existing architecture**: same stack, shared components, data-access/lookups, permission policy,
   audited-mutation helper and seed conventions. Prefer the repo's scaffold generator. No new frameworks, layers or
   duplicate rule logic in the UI; enforce every rule server-side even when the UI hides/disables the action.
4. **Clarify the spec** (roles, statuses, transitions, rule/reason codes, audit actions, seed scenarios). If the request
   is ambiguous or contradictory, choose the narrow reading, continue, and flag it to the user.
5. **Implement rules + data first, then UI**: atomic state change + audit, guarded updates, no duplicate side effects,
   rejected attempts audited without mutating data. Preserve existing seeded scenarios; add new ones deterministically.
6. **Add tests**: success + persistence, each rule/reason code, wrong roles, repeat/duplicate attempts, validation,
   audit success/denial, and that existing suites still pass. Run typecheck, lint and tests.
7. **Verify in a browser**: run the app, exercise the main flows for each role (allowed, rule-blocked, forbidden)
   with the repo's smoke script (extend it) and capture screenshots outside the repo.
8. **Update docs/skills** with what exists now and the lessons learned (README, AGENTS.md, architecture, skill).
9. **Open a PR with evidence**: modules reused / new / existing services changed; rule table; exact commands and
   results; smoke output + screenshots; manual interventions; known limitations; time spent. Do not merge.

## Done when
- All acceptance tests pass, smoke passes, architecture checks are clean, docs are accurate, PR is open and the user
  has a short summary with the PR link and anything they must do manually.
