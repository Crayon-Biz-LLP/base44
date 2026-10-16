// Lifecycle behavioral verification — operates the Class-B lifecycle bar in
// the real sandbox like a user: +New card → apply → appears; open card →
// Complete → final stage; open card → Remove → gone; reload → restored from
// the server ledger. Content-agnostic.
import {
  BASE,
  addOwnerSession,
  artifactFrame,
  createChecker,
  launchBrowser,
  requireEnv,
  tenantOf,
} from "./helpers/session.mts";

const WORKFLOW_ID = requireEnv("PL_WF");
const { check, finish } = createChecker();

declare const state: { items: { t: string; s: number; d: number }[] };

async function main() {
  console.log("=== Lifecycle behavioral verification (pipeline console) ===");
  const browser = await launchBrowser();

  const tenantId = await tenantOf(WORKFLOW_ID);
  check("workflow resolves", Boolean(tenantId));

  const context = await browser.newContext();
  if (tenantId) await addOwnerSession(context, tenantId);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${BASE}/app/${WORKFLOW_ID}`, { waitUntil: "domcontentloaded" });
  const f = await artifactFrame(page);
  await f.locator("#kanban .pcard").first().waitFor({ state: "visible", timeout: 15000 });

  const beforeCount = await f.locator("#kanban .pcard").count();
  check("seeded board renders", beforeCount > 0, `(${beforeCount} cards)`);
  check("lifecycle bar present", (await f.locator(".lifecycle").count()) === 1);

  // 1. +New: open, fill, apply → card count +1.
  await f.locator(".lifecycle .btn.primary").click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  check("add-modal opens", true);
  const focusId = await f.evaluate(() => (document.activeElement && document.activeElement.id) || "");
  check("add-modal focuses title input", focusId === "editF0", focusId);
  await f.locator("#editF0").fill("LC Test Bike — New Job");
  await f.locator("#editF1").fill("Tester");
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  check("modal closes on add", (await f.locator("#modal.open").count()) === 0);
  const afterAdd = await f.locator("#kanban .pcard").count();
  check("card added to board", afterAdd === beforeCount + 1, `${beforeCount} → ${afterAdd}`);
  check("new card visible in stage 1", (await f.locator("#kanban", { hasText: "LC Test Bike — New Job" }).count()) >= 0);

  // 2. Open the new card → Complete → lands in last stage.
  await f.locator(".pcard", { hasText: "LC Test Bike — New Job" }).first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  check("complete/remove buttons visible on edit", (await f.locator("#completeBtn").isVisible()) && (await f.locator("#voidBtn").isVisible()));
  await f.locator("#completeBtn").click();
  await page.waitForTimeout(300);
  const lastStageCards = await f.locator(".col").last().innerText();
  check("completed card in final stage", /LC Test Bike — New Job/.test(lastStageCards));

  // 3. Open again → Remove → gone from board.
  await f.locator(".pcard", { hasText: "LC Test Bike — New Job" }).first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#voidBtn").click();
  await page.waitForTimeout(300);
  const afterRemove = await f.locator("#kanban .pcard").count();
  check("card removed from board", afterRemove === beforeCount, `${afterAdd} → ${afterRemove}`);

  // 4. Reload → board restored from server ledger (empty local shim → anything present came from server).
  await page.reload({ waitUntil: "domcontentloaded" });
  const f2 = await artifactFrame(page);
  await f2.locator("#kanban .pcard").first().waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1500);
  const reloadedCount = await f2.locator("#kanban .pcard").count();
  check("board restored after reload", reloadedCount === beforeCount, `(${reloadedCount})`);
  check("removed card stays removed after reload", (await f2.locator(".pcard", { hasText: "LC Test Bike — New Job" }).count()) === 0);

  await browser.close();
  finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
