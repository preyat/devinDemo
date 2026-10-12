---
name: capture-session-learnings
description: At the end of an Ops Portal session (before opening/updating the PR), summarise the session's durable context — user decisions and corrections, gotchas hit, new patterns or components — and fold it into AGENTS.md, docs/architecture.md, README.md and the .agents/skills so the next session starts with it.
---

# Capture session learnings

Goal: the next Devin session should not repeat this session's mistakes or re-ask settled questions.

## 1. Summarise the session (scratch notes, not committed)

List, from the conversation and `git log --oneline origin/main..HEAD` / `git diff --stat origin/main...HEAD`:
- **Decisions** the user made and why (e.g. "UI uses the Dashio-derived theme, not Tabler").
- **Corrections** from the user: what was assumed → what they wanted → the rule going forward
  (e.g. "never-approved applicants must have no transactions").
- **Gotchas** that cost time (errors, framework quirks, environment issues) and their fix.
- **New reusable pieces** (components, service helpers, scripts, conventions).
- **Open follow-ups / limitations**.

## 2. Route each item to the right place

| Item | Destination |
| --- | --- |
| Convention or rule for all future code | `AGENTS.md` → "Conventions" |
| Framework/env quirk | `AGENTS.md` → "Gotchas" |
| New file/component/script/command | `AGENTS.md` file map / commands; `README.md` if user-facing |
| Data/flow/architecture change | `docs/architecture.md` (diagram + text) |
| Seed realism or demo-scenario rule | `.agents/skills/add-seed-data/SKILL.md` + `tests/seed.test.ts` |
| Workflow-building procedure change | `.agents/skills/build-internal-tool/SKILL.md` / `plan-internal-tool` |
| Review criterion | `.agents/skills/review-internal-tool/SKILL.md` |
| Session-kickoff procedure / PR report format | `docs/playbooks/ops-portal-tool.md` (then sync the Devin playbook `!ops_portal_tool`) |
| Browser test hook/flow | `.agents/skills/browser-check/SKILL.md` + `scripts/smoke.mjs` |
| Task-specific detail (PR numbers, dates, one-off instructions) | nowhere — leave it out |

Prefer editing an existing line over adding a new one; delete statements that are no longer true. Write rules as
imperatives with the concrete file/symbol names. Never document aspirations — only what the code does.

## 3. Verify and record

- Run the path check from `.agents/skills/update-docs/SKILL.md` and `npm run typecheck && npm run lint && npm test`.
- Commit docs/skill changes with the feature (or as "docs: capture session learnings").
- In the PR description, add a short "Learnings captured" list naming the files updated.
