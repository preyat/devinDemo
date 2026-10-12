---
name: update-docs
description: Keep README.md, AGENTS.md and docs/architecture.md accurate after any change to the Ops Portal (new workflow, file, script, table, permission or convention). Run before opening every PR.
---

# Update docs

Docs must describe what the code does **now**. Verify against files, not memory.

1. List what changed: `git diff --stat origin/main...HEAD` and `git diff --name-status origin/main...HEAD`.
2. **AGENTS.md**
   - File map: add/remove rows for every new/deleted file under `src/`, `scripts/`, `tests/`.
   - Commands: must match `package.json` `scripts` exactly.
   - Conventions/Gotchas: add any new rule you relied on; delete ones no longer true.
3. **docs/architecture.md**
   - Mermaid diagram: add nodes/edges for new pages, actions, services and tables.
   - "Adding another workflow" steps still match the real files.
4. **README.md** — keep it short: what it does, run steps, a 3–4 line quick demo, list of shipped workflows
   (move items out of "Planned" when they ship). Every command must work as written.
   **docs/demo.md** — reviewer walkthroughs (role → URL → button → expected result), seed scenario tables, reset
   guard; update when seed data, UI labels or messages change.
5. **Skills** — if a procedure changed, update the matching skill in `.agents/skills/` and the skills table in AGENTS.md.
   For session-level context (decisions, corrections, gotchas) use `.agents/skills/capture-session-learnings/SKILL.md`.
6. Check every referenced path exists (templated `<workflow>` paths are skipped):
   `grep -rhoE "(src|tests|scripts|docs|\.agents)/[A-Za-z0-9/._-]*\.(ts|tsx|md)" AGENTS.md README.md docs .agents | sort -u | xargs ls > /dev/null`
   Then run `npm run typecheck && npm run lint && npm test`.
