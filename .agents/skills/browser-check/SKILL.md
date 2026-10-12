---
name: browser-check
description: Verify Ops Portal flows in a real browser with the committed Playwright smoke script (npm run smoke) and extend it for new workflows. Use after UI or service changes and before every PR.
---

# Browser check

`scripts/smoke.mjs` drives the running app with playwright-core and asserts on stable hooks. `npm run smoke` resets
the DB before and after, so demo data is never left modified.

## Run

```bash
npm run dev                                          # shell 1 (restart after a SCHEMA_VERSION bump)
SMOKE_CDP_URL=http://localhost:29229 npm run smoke   # shell 2 on the Devin VM (reuses its Chrome)
npm run smoke                                        # locally: launches installed Chrome (channel "chrome")
```

Prints `PASS`/`FAIL` per check; failures save `smoke-failure-<n>.png` (git-ignored). `SMOKE_BASE_URL` overrides the URL.

## Stable hooks

`#demo-role`, `#queue-search`, `#filter-<name>`, `[data-testid=queue-range]`, `[data-testid="summary-<label>"]`,
`[data-testid=row-<id>]` (whole row clickable), `#decision-note`, `button[name=decision][value=<decision>]`,
`[data-testid=operation-feedback]` (`.alert-success`/`.alert-danger`), `[data-testid=approval-blocked]`,
`[data-testid=read-only]`, `[data-testid=case-reason]`, `[data-testid=info-requested]`, `[data-testid=check-<label>]`.
Add `data-testid`s to new components instead of relying on text or position.

## Extend for a new workflow

Append `{ name, run(page) }` to `checks` in `scripts/smoke.mjs`: allowed-role success, rule-blocked action with its
explanation, forbidden role (`setRole(page, "...")` then restore `kyc_reviewer`), and a queue row opening a record.
For PR screenshots, use the same playwright-core connection and embed full-page screenshots in the PR body.
