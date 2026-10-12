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

async function decide(page, decision, note) {
  const feedback = page.locator(FEEDBACK);
  const before = (await feedback.count()) ? await feedback.textContent() : null;
  await page.fill("#decision-note", note);
  await page.click(`button[name=decision][value=${decision}]`);
  // Wait for a NEW result (the previous feedback alert stays rendered until replaced).
  await page.waitForFunction(
    ([sel, prev]) => {
      const el = document.querySelector(sel);
      return el && el.textContent && el.textContent !== prev;
    },
    [FEEDBACK, before],
  );
  return (await feedback.textContent()).trim();
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
      await page.waitForURL(/customer=cus_samira_patel/);
      assert.match(await page.textContent("[data-testid=case-reason]"), /Periodic refresh/);
    },
  },
  {
    name: "KYC: Maya needs a note, then approves and becomes read-only",
    async run(page) {
      await setRole(page, "kyc_reviewer");
      await page.goto(`${BASE}/kyc?customer=cus_maya_reed`);
      assert.equal(await page.locator("[data-testid=approval-blocked]").count(), 0);
      assert.match(await decide(page, "approve", " "), /validation/);
      assert.match(await decide(page, "approve", "Passport and utility bill verified."), /KYC approved for Maya Reed/);
      await page.reload();
      assert.match(await page.textContent("[data-testid=read-only]"), /read-only/);
    },
  },
  {
    name: "KYC: Samira approval blocked, request info succeeds",
    async run(page) {
      await setRole(page, "kyc_reviewer");
      await page.goto(`${BASE}/kyc?customer=cus_samira_patel`);
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
      await page.goto(`${BASE}/kyc?customer=cus_hannah_schmidt`);
      assert.match(await decide(page, "approve", "attempt"), /forbidden/);
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
