// Browser smoke test for the running app (`npm run dev` must be up). Run via `npm run smoke`,
// which resets the DB before and after. Add a check per workflow; keep them independent.
//
// Env: SMOKE_BASE_URL (default http://localhost:3000)
//      SMOKE_CDP_URL  (connect to an existing Chrome, e.g. http://localhost:29229 on the Devin VM;
//                      otherwise launches local Chrome via playwright-core channel "chrome")
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const FEEDBACK = "[data-testid=operation-feedback]";

async function setRole(page, role) {
  await page.goto(`${BASE}/kyc`);
  await page.selectOption("#demo-role", role);
  await page.waitForLoadState("networkidle");
}

// Submits the DecisionForm that owns the given decision button (several forms can share a page). The form is
// pinned as an element handle because its buttons change after success (e.g. "enable" becomes "disable").
async function decide(page, decision, note, fill = {}) {
  const form = await page.locator(`form:has(button[name=decision][value=${decision}])`).elementHandle();
  const read = async () => {
    const el = await form.$(FEEDBACK);
    return el ? (await el.textContent()).trim() : null;
  };
  const before = await read();
  await (await form.$("textarea[name=note]")).fill(note);
  for (const [name, value] of Object.entries(fill)) await (await form.$(`[name=${name}]`)).fill(value);
  await (await form.$(`button[name=decision][value=${decision}]`)).click();
  // Wait for a NEW result (the previous feedback alert stays rendered until replaced).
  for (let i = 0; i < 150; i++) {
    const now = await read();
    if (now && now !== before) return now;
    await page.waitForTimeout(200);
  }
  throw new Error(`No new feedback after "${decision}"`);
}

const checks = [
  {
    name: "KYC queue: summary cards, filters, search, row click",
    async run(page) {
      await page.goto(`${BASE}/kyc`);
      assert.equal(await page.textContent('[data-testid="summary-Pending review"]'), "15");
      assert.equal(await page.textContent('[data-testid="summary-Awaiting information"]'), "10");
      await page.selectOption("#filter-status", "pending");
      await page.waitForURL(/status=pending/);
      assert.match(await page.textContent("[data-testid=queue-range]"), /of 15/);
      await page.fill("#queue-search", "samira");
      await page.click("button[aria-label=Search]");
      await page.waitForURL(/q=samira/);
      await page.locator("[data-testid=row-cus_samira_patel] td").nth(3).click();
      await page.waitForURL(/\/kyc\/cus_samira_patel\?.*q=samira/);
      assert.match(await page.textContent("[data-testid=case-reason]"), /Periodic refresh/);
      assert.match(await page.getAttribute("[data-testid=back-to-queue]", "href"), /status=pending.*q=samira|q=samira.*status=pending/);
    },
  },
  {
    name: "Feature Flags: Payments Operator rejected, Risk Admin turns block_refunds_unverified_kyc ON",
    async run(page) {
      await setRole(page, "payments_operator");
      await page.goto(`${BASE}/feature-flags?flag=block_refunds_unverified_kyc`);
      assert.match(await page.textContent("[data-testid=role-notice]"), /Risk Admin/);
      assert.match(await decide(page, "enable", "attempt"), /forbidden/);
      await setRole(page, "risk_admin");
      await page.goto(`${BASE}/feature-flags?flag=block_refunds_unverified_kyc`);
      assert.match(await decide(page, "enable", "Enforce KYC before refunds."), /turned ON/);
      await page.reload();
      assert.match(await page.textContent("[data-testid=flag-impact]"), /ref_maya_750/);
    },
  },
  {
    name: "Refunds: flag ON blocks Maya (KYC_NOT_APPROVED); flag OFF lifts it; flag back ON",
    async run(page) {
      await setRole(page, "payments_operator");
      await page.goto(`${BASE}/refunds`);
      assert.match(await page.textContent("[data-testid=blocked-ref_maya_750]"), /KYC_NOT_APPROVED/);
      await page.locator("[data-testid=row-ref_maya_750] td").first().click();
      await page.waitForURL(/\/refunds\/ref_maya_750/);
      assert.match(await page.textContent("[data-testid=eligibility]"), /refunds are blocked for unverified customers/);
      assert.match(await decide(page, "process", "Trying anyway"), /rule_violation.*KYC_NOT_APPROVED/);
      await page.reload();
      assert.equal(await page.locator("[data-testid=read-only]").count(), 0);

      await setRole(page, "risk_admin");
      await page.goto(`${BASE}/feature-flags?flag=block_refunds_unverified_kyc`);
      assert.match(await decide(page, "disable", "Temporarily lift for testing."), /turned OFF/);
      await page.goto(`${BASE}/refunds`);
      assert.equal(await page.locator("[data-testid=blocked-ref_maya_750]").count(), 0);
      await page.goto(`${BASE}/feature-flags?flag=block_refunds_unverified_kyc`);
      assert.match(await decide(page, "enable", "Re-enable."), /turned ON/);
    },
  },
  {
    name: "KYC: Maya needs a note, approves, becomes read-only, Next case opens",
    async run(page) {
      await setRole(page, "kyc_reviewer");
      await page.goto(`${BASE}/kyc/cus_maya_reed?status=pending`);
      assert.equal(await page.locator("[data-testid=approval-blocked]").count(), 0);
      assert.match(await decide(page, "approve", " "), /validation/);
      assert.match(await decide(page, "approve", "Passport and utility bill verified."), /KYC approved for Maya Reed/);
      assert.match(await page.textContent("[data-testid=read-only]"), /read-only/);
      await page.click("[data-testid=next-case-after-decision]");
      await page.waitForURL((url) => /\/kyc\/cus_/.test(url.pathname) && !url.pathname.endsWith("cus_maya_reed"));
      assert.match(page.url(), /status=pending/);
    },
  },
  {
    name: "KYC: Samira approval blocked, request info succeeds",
    async run(page) {
      await setRole(page, "kyc_reviewer");
      await page.goto(`${BASE}/kyc/cus_samira_patel`);
      assert.match(await page.textContent("[data-testid=approval-blocked]"), /proof of address is missing/);
      assert.match(await decide(page, "approve", "Trying to approve"), /rule_violation/);
      assert.match(await decide(page, "request_info", "Provide a bank statement dated within 3 months."), /More information requested/);
      await page.reload();
      assert.match(await page.textContent("[data-testid=info-requested]"), /bank statement/);
    },
  },
  {
    name: "KYC: Payments Operator is forbidden by the backend",
    async run(page) {
      await setRole(page, "payments_operator");
      await page.goto(`${BASE}/kyc/cus_hannah_schmidt`);
      assert.match(await decide(page, "approve", "attempt"), /forbidden/);
      await setRole(page, "kyc_reviewer");
    },
  },
  {
    name: "Refunds: approved Maya is eligible, processes once; a stale second submit gets ALREADY_REFUNDED",
    async run(page) {
      await setRole(page, "payments_operator");
      const url = `${BASE}/refunds/ref_maya_750`;
      await page.goto(url);
      assert.equal(await page.locator("[data-testid=blocked-notice]").count(), 0);
      const stale = await page.context().newPage();
      await stale.goto(url);
      assert.match(await decide(page, "process", "Refund to original card."), /Refund ref_maya_750 of \$750\.00 processed/);
      assert.match(await decide(stale, "process", "Double submit"), /invalid_transition.*ALREADY_REFUNDED/);
      await stale.close();
      await page.goto(`${BASE}/refunds/ref_maya_750?status=processed`);
      assert.match(await page.textContent("[data-testid=read-only]"), /read-only/);
      await page.click("[data-testid=back-to-queue]");
      await page.waitForURL(/\/refunds\?status=processed/);
      assert.equal(await page.locator("[data-testid=row-ref_maya_750]").count(), 1);
    },
  },
  {
    name: "Refunds: Jordan's processed refund is read-only; KYC Reviewer is forbidden by the backend",
    async run(page) {
      await setRole(page, "payments_operator");
      await page.goto(`${BASE}/refunds?status=processed`);
      await page.locator("[data-testid=row-ref_jordan_420] td").first().click();
      await page.waitForURL(/\/refunds\/ref_jordan_420/);
      assert.match(await page.textContent("[data-testid=eligibility]"), /already processed/);
      assert.match(await page.textContent("[data-testid=read-only]"), /read-only/);
      await setRole(page, "kyc_reviewer");
      await page.goto(`${BASE}/refunds/ref_alex_350`);
      assert.match(await page.textContent("[data-testid=role-notice]"), /refund\.process/);
      assert.match(await decide(page, "process", "attempt"), /forbidden.*ROLE_NOT_PERMITTED/);
      await setRole(page, "kyc_reviewer");
    },
  },
  {
    name: "Fraud Operations: queue + filters; Alex's refund eligible before escalation; Payments Operator forbidden",
    async run(page) {
      await setRole(page, "payments_operator");
      await page.goto(`${BASE}/fraud`);
      for (const id of ["alert_alex_4500", "alert_jamie_velocity", "alert_maya_chen_9800", "alert_sam_device", "alert_priya_2750"]) {
        assert.equal(await page.locator(`[data-testid=row-${id}]`).count(), 1, `${id} in queue`);
      }
      await page.goto(`${BASE}/fraud?severity=high&status=open`);
      assert.equal(await page.locator("[data-testid^=row-alert_]").count(), 2);
      await page.goto(`${BASE}/fraud?status=escalated`);
      assert.equal(await page.locator("[data-testid^=row-alert_]").count(), 1);
      assert.equal(await page.locator("[data-testid=row-alert_priya_2750]").count(), 1);
      await page.goto(`${BASE}/refunds`);
      assert.equal(await page.locator("[data-testid=blocked-ref_alex_350]").count(), 0, "Alex eligible before escalation");
      assert.match(await page.textContent("[data-testid=blocked-ref_priya_shah_120]"), /ACCOUNT_RISK_HOLD/);
      await page.goto(`${BASE}/fraud`);
      await page.locator("[data-testid=row-alert_alex_4500] td").first().click();
      await page.waitForURL(/\/fraud\/alert_alex_4500/);
      assert.match(await page.textContent("[data-testid=alert-reason]"), /new device|never seen/i);
      assert.match(await page.textContent("[data-testid=fraud-signals]"), /New device[\s\S]*Unusual location/);
      assert.match(await page.textContent("[data-testid=hold-status]"), /No active account risk hold/);
      assert.match(await page.textContent("[data-testid=role-notice]"), /Only Risk Admins/);
      assert.match(await decide(page, "escalate", "attempt"), /forbidden.*ROLE_NOT_PERMITTED/);
      await setRole(page, "kyc_reviewer");
    },
  },
  {
    name: "Fraud Operations: Risk Admin dismisses Sam (no hold), escalates Alex; Alex's refund blocked with ACCOUNT_RISK_HOLD",
    async run(page) {
      await setRole(page, "risk_admin");
      await page.goto(`${BASE}/fraud/alert_sam_device`);
      assert.match(await decide(page, "dismiss", "Browser update; matches customer's usual IP and city."), /dismissed.*No account hold created/);
      await page.reload();
      assert.match(await page.textContent("[data-testid=hold-status]"), /No active account risk hold/);
      await page.goto(`${BASE}/fraud/alert_alex_4500`);
      assert.match(await decide(page, "escalate", "Customer confirmed they did not send the wire."), /escalated.*risk hold hold_alex_4500/);
      await page.reload();
      assert.match(await page.textContent("[data-testid=hold-status]"), /Active hold/);
      assert.match(await page.textContent("[data-testid=fraud-audit]"), /fraud_alert\.escalate[\s\S]*fraud_alert\.escalate/); // success + earlier forbidden attempt
      assert.match(await page.textContent("[data-testid=read-only]"), /read-only/);
      await setRole(page, "payments_operator");
      await page.goto(`${BASE}/refunds`);
      assert.match(await page.textContent("[data-testid=blocked-ref_alex_350]"), /ACCOUNT_RISK_HOLD/);
      await page.goto(`${BASE}/refunds/ref_alex_350`);
      assert.match(await page.textContent("[data-testid=risk-hold-banner]"), /Account under risk review — refund processing paused\./);
      assert.match(await decide(page, "process", "Duplicate confirmed"), /Account under risk review — refund processing paused\./);
      await page.reload();
      assert.match(await page.textContent("[data-testid=refund-details]"), /Pending/);
      await setRole(page, "kyc_reviewer");
    },
  },
  {
    name: "Refunds queue actions: partial refund, claim + reject, bulk process",
    async run(page) {
      await setRole(page, "payments_operator");
      await page.goto(`${BASE}/refunds/ref_elena_popescu_3`);
      assert.match(await decide(page, "process", "Goodwill partial", { amount: "120.50" }), /partial refund of \$120\.50 \(of \$472\.00 requested\)/);
      await page.goto(`${BASE}/refunds/ref_ben_180_dup`);
      assert.match(await decide(page, "claim", "Looking into it", { assignee: "Sam R." }), /claimed by Sam R\./);
      await page.goto(`${BASE}/refunds?assigned=claimed`);
      assert.equal(await page.locator("[data-testid=row-ref_ben_180_dup]").count(), 1);
      await page.goto(`${BASE}/refunds/ref_ben_180_dup`);
      assert.match(await decide(page, "reject", "Duplicate of ref_ben_180"), /rejected for Ben Carter\. No money moved/);
      await page.goto(`${BASE}/refunds`);
      const selected = await page.locator("[data-testid=bulk-list] input:checked").count();
      assert.ok(selected > 0, "bulk list has eligible refunds");
      assert.match(await decide(page, "bulk", "Daily run"), new RegExp(`Bulk process: ${selected} of ${selected} refunds processed`));
      await setRole(page, "kyc_reviewer");
    },
  },
];

const browser = process.env.SMOKE_CDP_URL
  ? await chromium.connectOverCDP(process.env.SMOKE_CDP_URL)
  : await chromium.launch({ channel: "chrome" });
const context = browser.contexts()[0] ?? (await browser.newContext());
let failed = 0;
for (const check of checks) {
  const page = await context.newPage();
  try {
    await check.run(page);
    console.log(`PASS  ${check.name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${check.name}\n      ${err.message.split("\n")[0]}`);
    await page.screenshot({ path: `smoke-failure-${failed}.png`, fullPage: true }).catch(() => {});
  } finally {
    await page.close();
  }
}
await browser.close();
console.log(failed ? `${failed} smoke check(s) failed` : `All ${checks.length} smoke checks passed`);
process.exit(failed ? 1 : 0);
