# Demo guide

Step-by-step walkthroughs for reviewers, the seeded demo scenarios and how the demo reset works. To install and
run the app, see the [README](../README.md#install). Every walkthrough starts from a fresh `npm run demo:reset`.
Switch roles with the selector in the navbar.

## Walkthroughs

### Fraud Operations → Refunds (about 3 minutes)

This shows a fraud escalation blocking a refund, enforced on the server. Start from a fresh `npm run demo:reset`,
then switch roles with the navbar selector.

1. **Payments Operator** → open `/refunds/ref_alex_350` (Alex Kim, $350, pending). The eligibility checklist passes
   and there is no hold banner. Don't process it yet.
2. **Risk Admin** → open `/fraud`, then click the HIGH alert `alert_alex_4500` (Alex Kim, $4,500 wire). The signals
   are *New device*, *Unusual location* and *High-value outbound wire*, and the hold status is "No active account risk hold".
3. Enter a note (e.g. "Customer confirmed they did not send the wire.") and click **Escalate & Hold**. You should see
   a success message naming hold `hold_alex_4500`. The hold status becomes *Active hold*, and the alert is now read-only.
4. **Payments Operator** → open `/refunds`. Alex's row now shows `ACCOUNT_RISK_HOLD`. Open `/refunds/ref_alex_350`:
   it shows the banner "Account under risk review — refund processing paused."
5. Enter a note and click **Process refund**. The server rejects it with `ACCOUNT_RISK_HOLD` and the same message, naming
   the hold and alert. Reload the page: the refund
   is still *Pending*, and the denied attempt is recorded in the audit trail.
6. Optional contrast: as Risk Admin, enter a note and click **Dismiss alert** on `alert_sam_device`. No hold is created, so refunds are unaffected.
7. Run `npm run demo:reset` to start over. `alert_priya_2750` shows the end state from step 4 already seeded.

The same flow is automated in `npm run smoke` (the "Fraud Operations" checks).

### Refund eligibility with feature flags (Maya)

1. **Risk Admin** → `/feature-flags`: turn `block_refunds_unverified_kyc` ON (reason required).
2. **Payments Operator** → `/refunds/ref_maya_750`: blocked with `KYC_NOT_APPROVED` (Maya's KYC is still pending).
3. **KYC Reviewer** → `/kyc/cus_maya_reed`: enter a note and **Approve** (all checks pass).
4. **Payments Operator** → `/refunds/ref_maya_750`: enter a note and click **Process refund**. It succeeds and the
   page becomes read-only. A stale second submit (e.g. from a second tab opened before processing) is rejected by the
   server with `ALREADY_REFUNDED`; `npm run smoke` covers this.

Jordan's `ref_jordan_420` is already processed and read-only.

## Seed data

54 synthetic customers (50 KYC customers — 20 approved, 15 pending, 10 awaiting info, 5 rejected — plus 4 approved Fraud Operations customers),
118 transactions, 29 refunds (14 processed, each with one payout) and 5 fraud alerts, fully reproducible on every `npm run demo:reset`.

Each case has a review type explaining why it is in the queue: **Onboarding** (new applicant — no account
activity until approved), **Periodic refresh** or **Triggered** (existing customer being re-reviewed — keeps their
transaction/refund history). Demo scenarios:

| Customer       | KYC      | Risk   | Review           | Scenario |
| -------------- | -------- | ------ | ---------------- | -------- |
| Maya Reed      | pending  | medium | Triggered        | All checks passed → can be approved; $750 purchase + pending refund triggered the review |
| Samira Patel   | pending  | medium | Periodic refresh | Reported address change; proof of address missing → approval blocked; request info |
| Viktor Sokolov | pending  | high   | Onboarding       | Potential sanctions match → approval blocked |
| Lucas Moreau   | pending  | medium | Periodic refresh | Passport on file expired → approval blocked |
| Jordan Lee     | approved | low    | Onboarding       | $420 refund already processed |
| Alex Kim       | approved | low    | Onboarding       | $350 refund pending + separate $4,500 transaction; HIGH open fraud alert; no risk hold |
| Ben Carter     | approved | low    | Onboarding       | $180 refund processed, then customer re-submitted → pending `ref_ben_180_dup` is blocked `DUPLICATE_REFUND` |
| David Cohen    | approved | medium | Onboarding       | $2,400 pending refund → blocked `AMOUNT_OVER_LIMIT` while `block_high_value_refunds` is ON |

Fraud Operations cases (all signals simulated; `src/server/fraud/seed-data.ts`):

| Alert                  | Customer    | Severity | Status    | Scenario |
| ---------------------- | ----------- | -------- | --------- | -------- |
| `alert_alex_4500`      | Alex Kim    | HIGH     | OPEN      | Account takeover: new device + unusual location on the $4,500 wire. His $350 refund is pending and **eligible**; no hold. |
| `alert_jamie_velocity` | Jamie Patel | MEDIUM   | OPEN      | Six gift-card purchases ($1,450) in 36 minutes. |
| `alert_maya_chen_9800` | Maya Chen   | HIGH     | OPEN      | $9,800 transfer to a new beneficiary, ~70× her usual spend (one earlier processed $54 refund). |
| `alert_sam_device`     | Sam Taylor  | LOW      | OPEN      | Low-confidence browser fingerprint change on a $62 renewal. |
| `alert_priya_2750`     | Priya Shah  | HIGH     | ESCALATED | Escalated by Risk Admin (seeded through the real service): active hold `hold_priya_2750`, audit row, and her pending $120 refund is blocked `ACCOUNT_RISK_HOLD`. |

Flags: `block_refunds_unverified_kyc` OFF, `pause_refund_processing` OFF, `block_high_value_refunds` ON. One risk hold (Priya). The audit log holds only Priya's seeded escalation.

## Repeatable demo reset

`npm run demo:reset` restores the initial state (Alex's OPEN alert, no Alex hold, eligible pending $350 refund, Priya
escalated). It is guarded (`src/server/demo-guard.ts`) and refuses to run when:

- `PORTAL_ENV=production`;
- the target (`PORTAL_DB_PATH`, default `data/portal.db`) is not the designated demo file (`DEMO_DB_PATH`, default `data/portal.db`);
- the database exists but is not marked `portal_meta.environment = 'demo'` (written by the seed).

The same guard protects the automatic reset `getDb()` performs after a `SCHEMA_VERSION` bump.
