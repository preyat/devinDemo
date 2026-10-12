---
name: plan-internal-tool
description: Turn a business request for a new Ops Portal internal tool (e.g. Refunds, Feature Flags, Transaction Risk Review) into a short spec — roles, statuses, transitions, business rules, audit actions, data and seed scenarios — before writing code. Use at the start of any new workflow.
---

# Plan an internal tool

Produce a spec in `docs/workflows/<slug>.md` (and summarise it in the PR) **before** coding. Keep it to one page.
Map every item to an existing building block; only invent new ones if nothing fits.

## Steps

1. Read `AGENTS.md` ("Data model", "Conventions") and `docs/architecture.md` ("KYC rules") to see what exists.
2. Fill in this template (worked example: `src/server/kyc/service.ts`):

```md
# <Workflow> spec
## Purpose — one sentence: who uses it and what decision they make.
## Roles — which demo role(s) may act → permission `<key>.decide` in src/server/permissions.ts.
## Records — tables used (customers, transactions, refunds, feature_flags, risk_holds, audit_events, ...);
   new columns/tables need a SCHEMA_VERSION bump (see add-seed-data skill).
## Statuses & transitions — from → allowed decisions; which states are terminal/read-only.
## Business rules — each as "Cannot <decision>: <reason>" + data source.
   Reuse cross-workflow gates (e.g. isKycRestricted in src/server/kyc/eligibility.ts).
## Decision inputs — fields + Zod validation; note always required.
## Audit — action names `<key>.<verb>`, entity_type, success details.
## Queue — columns, filters, sort, summary cards.
## Case page — header (status, why it needs attention) and tabs: Overview (fields, checks, decision), Activity (related records), History (decisions, audit).
## Seed scenarios — named demo records that must exist, plus existing ones that must stay intact (README table).
## Tests — success+persistence, each forbidden role, invalid transition, each rule violation, validation, audit rows.
## Smoke — browser flows to add to scripts/smoke.mjs.
## Out of scope — what is deliberately not built.
```

3. Sanity-check: every rule is enforceable server-side; no rule depends on UI state; seed data obeys the realism
   invariants in `.agents/skills/add-seed-data/SKILL.md`.
4. Then follow `.agents/skills/build-internal-tool/SKILL.md` (start with `npm run new:workflow -- <slug>`).
