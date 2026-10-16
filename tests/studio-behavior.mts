// Behavioral verification for Studio consoles — the piece Canvas has
// implicitly and grep can never replace: we RUN the console in the exact
// production sandbox (opaque-origin iframe) and operate it like a user.
// Asserts the full interaction loop: render → open rack → edit slot →
// apply → MODAL CLOSES (the regression that shipped) → data + KPIs update.
//
// Run: npx tsx tests/studio-behavior.mts   (dev server must be up)
import {
  BASE,
  addOwnerSession,
  artifactFrame,
  createChecker,
  launchBrowser,
  requireEnv,
  tenantOf,
} from "./helpers/session.mts";

// The published spatial console (scripts/seed-behavior.mts, SP_WF).
const WORKFLOW_ID = requireEnv("SP_WF");
const { check, finish } = createChecker();

declare const state: { g: number; s: number; v0?: string; v1?: string; v2?: string; q?: string }[];

async function main() {
  console.log("=== Studio behavioral verification (headless Chromium) ===");
  const browser = await launchBrowser();

  // Resolve the tenant so the staff gate is pre-authorized like a returning user.
  const tenantId = await tenantOf(WORKFLOW_ID);
  check("workflow resolves", Boolean(tenantId));

  const context = await browser.newContext();
  if (tenantId) await addOwnerSession(context, tenantId);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(`${BASE}/app/${WORKFLOW_ID}`, { waitUntil: "domcontentloaded" });
  const f = await artifactFrame(page);

  // 1. Boot: map view rendered — rack GROUP cards, not a flat unit wall.
  await f.locator("#unitsGrid .card").first().waitFor({ state: "visible", timeout: 15000 });
  const rackCards = await f.locator("#unitsGrid .card").count();
  check("map view renders rack group cards", rackCards > 0, `(${rackCards} cards)`);
  const kpiUtilBefore = await f.locator("#kpiUtil").innerText();

  // 2. Drill down: rack card → detail view with its rows.
  await f.locator("#unitsGrid .card").first().click();
  await f.locator("#detailView").waitFor({ state: "visible" });
  const rowCards = await f.locator("#rackRows .card").count();
  check("rack drill-down shows its rows", rowCards > 0, `(${rowCards} rows)`);
  await page.waitForTimeout(500); // let boot-hydrate re-render settle before interacting

  // 3. Edit a slot: row card → modal opens. V2 canonical contract: edit fields
  // are positional (#editF0..2) because fields come from the extracted config.
  await f.locator("#rackRows .card").first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  check("slot editor modal opens", true);
  const focusId = await f.evaluate(() => (document.activeElement && document.activeElement.id) || "");
  check("drawer focuses the primary input", focusId === "editQty" || focusId === "editF0", focusId);

  // 4. Apply an edit → modal must CLOSE (the shipped bug) and data must land.
  // V3.1: the modal now also captures QUANTITY per slot (sheets).
  await f.locator("#editF0").fill("SS304");
  await f.locator("#editF2").fill("3");
  const qtyBox = f.locator("#editQty");
  if (await qtyBox.count()) await qtyBox.fill("40");
  await f.locator("#editF2").press("Enter").catch(() => {});
  const applyBtn = f.locator("#modal .btn.primary");
  if (await applyBtn.count()) await applyBtn.click(); else await f.locator("#modal .btn", { hasText: "Apply" }).click();
  await page.waitForTimeout(300);
  const modalOpen = await f.locator("#modal.open").count();
  check("modal closes on Apply", modalOpen === 0);
  const rowText = await f.locator("#rackRows .card").first().innerText();
  check("edit landed in the slot row", /SS304/.test(rowText), JSON.stringify(rowText.slice(0, 60)));
  if (await qtyBox.count()) check("quantity captured (×40)", /×40/.test(rowText));
  const statsText = await f.locator("#rackStats").innerText().catch(() => "");
  check("rack stats card computes (occupancy/tonnage/thickest)", /Occupancy \d+\/.+T total.+Thickest/.test(statsText), JSON.stringify(statsText.slice(0, 90)));
  await f.locator("#nextRack").click();
  const nextTitle = await f.locator("#detailTitle").innerText();
  check("rack inspector navigates (next)", /2/.test(nextTitle), nextTitle);
  const toastVisible = await f.locator("#toast.open").count();
  check("toast confirms the save", toastVisible === 1);

  // 5. KPIs recompute.
  const kpiUtilAfter = await f.locator("#kpiUtil").innerText();
  check("KPI strip is live (utilization recomputed)", /\d+%/.test(kpiUtilAfter), `${kpiUtilBefore} → ${kpiUtilAfter}`);

  // 5b. V3 intelligence: plant a heavy plate on an elevated row → audit banner.
  // (Demo seed caps at 6mm ≈ 141kg < 150kg limit, so banner starts closed.)
  await f.locator("#rackRows .card").first().click();
  await f.locator("#editF2").fill("12"); // 12mm SS304 ≈ 282kg ≥ 150kg limit
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  const bannerOpen = await f.locator("#auditBanner.open").count();
  const bannerText = await f.locator("#auditText").innerText().catch(() => "");
  check("weight audit flags heavy plate on elevated row", bannerOpen === 1, JSON.stringify(bannerText));
  const ton = await f.locator("#kpiTonnage").innerText().catch(() => "");
  check("tonnage KPI is live", /^\d+(\.\d+)? T$/.test(ton.trim()), ton);

  // 5c. Downgrade the load → banner must clear. The banner is GLOBAL, and the
  // 12mm violation lives in THIS rack's Row 8 (5b edited it here), so simply
  // reopen the same row and downgrade it below the row limit.
  await f.locator("#rackRows .card").first().click();
  // Quantity-aware audit: thickness alone can't clear a ×53 stack — reduce both.
  await f.locator("#editF2").fill("3");
  const q2 = f.locator("#editQty");
  if (await q2.count()) await q2.fill("1");
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  check("audit clears when load is safe", (await f.locator("#auditBanner.open").count()) === 0);

  // 6. Search filters the console AND spotlights the map (dim non-matches, glow hits).
  await f.locator("#tabMap").click();
  await f.locator("#search").fill("SS304");
  await page.waitForTimeout(200);
  const dimmed = await f.locator("#unitsGrid .card.dim").count();
  const hits = await f.locator("#unitsGrid .card.hit").count();
  check("spotlight dims non-matching racks", dimmed > 0 && hits > 0, `(${hits} hit, ${dimmed} dimmed)`);
  const listHtml = await f.locator("#listTable").innerHTML();
  check("search + inventory list reflect the edit", /SS304/.test(listHtml));

  // 7. Storage shim: persistence works inside the opaque-origin sandbox.
  // Assert the CAPABILITY (some state key with real JSON), not a specific key —
  // models may brand the key (e.g. 'lazer_rack_state').
  const persisted = await f.evaluate(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (/state/i.test(k)) {
          const v = localStorage.getItem(k);
          if (v && v.length > 50) return v;
        }
      }
      return null;
    } catch { return null; }
  });
  check("state persists via storage shim", typeof persisted === "string" && (persisted as string).length > 50);

  // 8. Sync: the bridge path is wired (works fully once Engine 2 lands).
  await f.locator("#search").fill("");
  await f.locator("#syncBtn").click();
  let toastText = "";
  const syncDeadline = Date.now() + 8000;
  while (Date.now() < syncDeadline) {
    toastText = await f.locator("#toast").innerText().catch(() => "");
    if (/Synced to OpsDesk|Saved locally/i.test(toastText) || /Sync failed/i.test(toastText)) break;
    await page.waitForTimeout(250);
  }
  check("sync path reaches the host bridge", /Synced to OpsDesk|Saved locally/i.test(toastText) && !/Sync failed/i.test(toastText), JSON.stringify(toastText));

  // ── Engine 2: reload persistence — fresh edit → autosave → reload → ledger restore.
  if (!(await f.locator("#rackRows .card").first().isVisible().catch(() => false))) {
    await f.locator("#unitsGrid .card").first().click();
    await f.locator("#detailView").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
  }
  await f.locator("#rackRows .card").first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#editF0").fill("PERSIST-CHK");
  const ab = f.locator("#modal .btn.primary");
  if (await ab.count()) await ab.click(); else await f.locator("#modal .btn", { hasText: "Apply" }).click();
  let autosaved = true;
  try { await f.locator("#syncState", { hasText: "Synced" }).waitFor({ state: "visible", timeout: 8000 }); }
  catch { autosaved = false; }
  check("Engine 2: edit autosaves (chip shows Synced)", autosaved);
  const projFn = () => JSON.stringify(
    state.map((u) => {
      const fs: string[] = [];
      for (let i = 0; i < 3; i++) { const v = (u as Record<string, unknown>)["v" + i]; fs.push(v === undefined || v === null ? "" : String(v)); }
      return [u.g, u.s, fs.join("|"), String(parseInt(u.q || "0", 10) || 0)];
    }).sort()
  );
  const projBefore = await f.evaluate(projFn);
  await page.reload({ waitUntil: "domcontentloaded" });
  const f2 = await artifactFrame(page);
  let projAfter = "";
  for (let i = 0; i < 25; i++) {
    projAfter = await f2.evaluate(projFn).catch(() => "");
    if (projAfter === projBefore) break;
    await page.waitForTimeout(400);
  }
  check("Engine 2: rack state restored from server ledger after reload", projAfter === projBefore, projAfter.slice(0, 90));
  check("Engine 2: sync-state chip present after reload", (await f2.locator("#syncState").count()) === 1);

  await browser.close();
  finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
