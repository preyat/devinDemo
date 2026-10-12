# Playbook: Ops Portal — build an internal tool

> Source of truth for the Devin playbook **"Ops Portal: build an internal tool"** (macro `!ops_portal_tool`).
> Devin does not sync playbooks from git: after editing this file, update the Devin playbook with the same content
> (Settings → Playbooks, or ask Devin to run `devin_playbook_manage` update). Engineers can follow it directly.

## Overview
Build or extend an internal tool in the Ops Portal (`preyat/devinDemo`), a local fintech prototype: Next.js 15 + React Bootstrap (Dashio-derived theme) + better-sqlite3 + Zod + Vitest, with synthetic data only. The goal is to follow the established architecture (backend business rules, permission checks, atomic state change + audit, shared UI components, deterministic seed), so that every tool looks and behaves like KYC Review and the codebase stays easy to extend.

## What's Needed From User
- The tool to build or change, e.g. "Transaction Risk Review (Session 3)" (Refunds + Feature Flags shipped in Session 2).
- Any business rules, roles and demo scenarios that must exist or be preserved.
- Scope limits (time box, what is out of scope).

## Procedure
1. Set up and confirm a green baseline: `source ~/.nvm/nvm.sh && npm install && npm run db:reset && npm test`. Read `AGENTS.md` and `docs/architecture.md`.
2. Write a one-page spec with `.agents/skills/plan-internal-tool/SKILL.md` (roles, statuses/transitions, rules, audit actions, seed scenarios, tests, smoke flows). Share it with the user before coding if any rule is ambiguous.
3. Scaffold each workflow: `npm run new:workflow -- <slug> --entity <type> --role <role>`.
4. Implement schema/seed changes with `.agents/skills/add-seed-data/SKILL.md`, keeping the preserved demo customers (Maya, Samira, Jordan, Alex) and the realism invariants.
5. Implement the service in `src/server/<slug>/service.ts` following `.agents/skills/build-internal-tool/SKILL.md`. Reuse cross-workflow gates such as `isKycRestricted` (`src/server/kyc/eligibility.ts`) for Refunds.
6. Write Vitest tests (success + persistence, each forbidden role, invalid transition, each rule violation, validation, audit rows) and make `npm test` pass.
7. Build the page from shared components (`SummaryCards`, `QueueFilters`, `QueueTable`, `QueuePagination`, `RecordDetail`, `DecisionForm`, `StatusBadge`). Then set `available: true` for the workflow in `src/lib/workflows.ts`.
8. Add smoke checks to `scripts/smoke.mjs`, then run `npm run dev` and `SMOKE_CDP_URL=http://localhost:29229 npm run smoke` (see `.agents/skills/browser-check/SKILL.md`). Take full-page screenshots.
9. Run `.agents/skills/review-internal-tool/SKILL.md`, then `.agents/skills/update-docs/SKILL.md` and `.agents/skills/capture-session-learnings/SKILL.md`.
10. Open a PR whose description includes the commands run with results, browser/smoke status with screenshots, limitations, time spent, human interventions and the learnings captured. Wait for CI to pass.

## Specifications
- `npm run typecheck`, `npm run lint`, `npm test` and `npm run smoke` all pass, and CI is green.
- Every mutation goes through `runAuditedOperation` with `assertCan`, Zod validation, a transition map and business rules. Blocked attempts are audited as `denied`.
- The page uses the service's exported rule helpers; no rule logic is duplicated in components.
- `npm run db:reset` is deterministic, and `tests/seed.test.ts` (including the preserved scenarios) passes.
- AGENTS.md, architecture doc, README and skills describe the code as implemented.
- Validation: the smoke run shows PASS for every check, including the new workflow's success, rule-blocked and forbidden-role flows.

## Advice and Pointers
- The DEMO role selector is not authentication. Enforce everything server-side and treat hidden buttons as hints.
- In server components, use `CardHeader`/`CardBody` rather than `Card.Header`. Never import constants from `"use client"` files into server code.
- Restart `npm run dev` after bumping `SCHEMA_VERSION`.
- Keep scope small: core rules, seed and backend validation come before UI polish.

## Forbidden Actions
- Do not add real authentication, external APIs, real financial operations, an ORM or a generic workflow engine.
- Do not modify or remove the preserved demo scenarios without being asked.
- Do not commit `data/*.db`, screenshots or smoke failure images.
- Do not build tools outside the requested scope (e.g. Risk Review during the Refunds session).
