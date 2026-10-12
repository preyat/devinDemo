# !fix-internal-tool — fix a bug in an existing workflow of an internal-tools repo

Source of truth for the Devin playbook `!fix-internal-tool`. Registering it is a manual step in the Devin UI
(Settings → Playbooks → Create, macro `!fix-internal-tool`, paste this file); editing this file does not update the
registered copy — re-paste after edits.

## Inputs (from the user)
- Repo + base branch, the affected workflow, and the bug: steps to reproduce, expected vs actual behaviour, role used.
- Anything explicitly out of scope.

## Procedure
1. **Read repo instructions first**: `AGENTS.md` (or `CLAUDE.md`/`CONTRIBUTING.md`), `README.md`, `docs/architecture.md`
   and any `.agents/skills/*`. Sync the base branch and get a green baseline (install, reset/seed data, run the existing
   tests) before changing anything.
2. **Invoke the repo-specific skill explicitly**: `skill_invoke fix-internal-tool` (fallback: read
   `.agents/skills/fix-internal-tool/SKILL.md` directly if it is not in the catalog) and follow it step by step;
   say in the PR if you deviate.
3. **Reproduce before fixing**: write a failing automated test (unit test for rules/data, the repo's smoke script for UI
   flows) and confirm it fails for the reported reason. If it cannot be reproduced, stop and report what was tried.
4. **Fix the root cause in the correct layer**: business rules in the backend service, never only in the UI. Keep the
   existing architecture — audited-mutation helper, permission policy, single-source rule helpers, denied attempts
   audited without mutating data. Minimal diff; no new frameworks, layers or generic engines.
5. **Verify**: the new test passes; typecheck, lint, the full test suite and the repo's architecture checks pass; run
   the smoke script for anything reachable from the UI.
6. **Update docs/skills** only where behaviour or a lesson changed (rules table, README, AGENTS.md, skill).
7. **Open a PR with evidence**: bug + repro test, root cause and layer, fix, invariants checked, exact commands and
   results, limitations. Do not merge.

## Done when
- The repro test fails before and passes after the fix, all existing checks pass, docs are accurate, the PR is open and
  the user has a short summary with the PR link and anything they must do manually.
