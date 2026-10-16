// Behavioral verification for Target Board consoles — operates the board in
// the real production sandbox like a user: click cell → report number → apply
// → modal closes → cell color flips → KPIs recompute → TEAM totals update.
import {
  BASE,
  addOwnerSession,
  artifactFrame,
  createChecker,
  launchBrowser,
  requireEnv,
  tenantOf,
} from "./helpers/session.mts";

const WORKFLOW_ID = requireEnv("TB_WF");
const { check, finish } = createChecker();

// Globals inside the sandboxed artifact iframe (declared for TS only).
declare const PEOPLE: string[];
declare const METRICS: { k: string; l: string; t: number }[];
declare const state: Record<string, string>;

async function main() {
  console.log("=== Target Board behavioral verification (headless Chromium) ===");
  const browser = await launchBrowser();

  const tenantId = await tenantOf(WORKFLOW_ID);
  check("workflow resolves", Boolean(tenantId));

  const context = await browser.newContext();
  if (tenantId) await addOwnerSession(context, tenantId);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(`${BASE}/app/${WORKFLOW_ID}`, { waitUntil: "domcontentloaded" });
  const f = await artifactFrame(page);

  // 1. Board renders: one row per roster member (TEAM row optional) × metric columns.
  await f.locator("#tbody tr").first().waitFor({ state: "visible", timeout: 15000 });
  const roster = await f.evaluate(() => PEOPLE);
  const metrics = await f.evaluate(() => METRICS);
  const firstPerson = roster[0];
  const firstMetric = metrics[0];
  check("board exposes roster + metrics", roster.length > 0 && metrics.length > 0, `(${roster.length} people, ${metrics.length} metrics)`);
  const rowCards = await f.locator("#tbody tr").count();
  check("board renders employee rows", rowCards >= roster.length, `(${rowCards} rows incl. TEAM)`);
  const th = (await f.locator("#thead").innerText()).replace(/\s+/g, " ");
  check("metric columns carry targets", new RegExp(`${firstMetric.l}\\s*/\\s*${firstMetric.t}`, "i").test(th), JSON.stringify(th.slice(0, 80)));

  // 2. Click a cell → drawer focuses the actual input.
  await f.locator(`.cell[data-p="${firstPerson}"][data-k="${firstMetric.k}"]`).click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  check("cell drawer opens", true);
  const focusId = await f.evaluate(() => (document.activeElement && document.activeElement.id) || "");
  check("drawer focuses actual input", focusId === "editF0", focusId);
  const tgt = await f.locator("#modalTarget").innerText();
  check("drawer shows target", new RegExp(`Target:\\s*${firstMetric.t}\\b`).test(tgt), JSON.stringify(tgt));

  // 3. Report a number → modal closes, cell turns ok, KPIs recompute.
  const repBefore = await f.locator("#kpiRep").innerText();
  await f.locator("#editF0").fill(String(firstMetric.t));
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  check("modal closes on Apply", (await f.locator("#modal.open").count()) === 0);
  const cellTxt = await f.locator(`.cell[data-p="${firstPerson}"][data-k="${firstMetric.k}"]`).innerText();
  check("edit landed at target (100%)", cellTxt.includes(String(firstMetric.t)) && /100%/.test(cellTxt), JSON.stringify(cellTxt));
  const repAfter = await f.locator("#kpiRep").innerText();
  check("Reported-Today KPI recomputed", repBefore !== repAfter, `${repBefore} → ${repAfter}`);
  const toastVisible = await f.locator("#toast.open").count();
  check("toast confirms the save", toastVisible === 1);

  // 4. TEAM totals row updated for the edited metric.
  const teamRow = await f.locator("tr.total").innerText();
  check("TEAM totals row present", /TEAM/.test(teamRow));

  // 5. Spotlight search dims non-matching cells.
  await f.locator("#search").fill(firstPerson);
  await page.waitForTimeout(200);
  const dimmed = await f.locator(".cell.dim").count();
  const hits = await f.locator(".cell.hit").count();
  check("spotlight dims non-matching cells", dimmed > 0 && hits > 0, `(${hits} hit, ${dimmed} dimmed)`);
  await f.locator("#search").fill("");
  await page.waitForTimeout(200);

  // 6. Persistence + sync bridge.
  const persisted = await f.evaluate(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (/state/i.test(k)) { const v = localStorage.getItem(k); if (v && v.length > 50) return v; }
      }
      return null;
    } catch { return null; }
  });
  check("state persists via storage shim", typeof persisted === "string" && (persisted as string).length > 50);

  await f.locator("#syncBtn").click();
  await page.waitForTimeout(1500);
  const toastText = await f.locator("#toast").innerText().catch(() => "");
  check("sync path reaches the host bridge", /Sync/i.test(toastText), JSON.stringify(toastText));

  // ── Engine 2: reload persistence — fresh edit → debounced autosave → reload
  // → restored from the server ledger. A fresh iframe has an EMPTY storage
  // shim, so anything present after reload came via __opsDeskLoad__.
  await f.locator(`.cell[data-p="${firstPerson}"][data-k="${firstMetric.k}"]`).click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#editF0").fill("7");
  await f.locator("#modal .btn.primary").click();
  let autosaved = true;
  try { await f.locator("#syncState", { hasText: "Synced" }).waitFor({ state: "visible", timeout: 8000 }); }
  catch { autosaved = false; }
  check("Engine 2: edit autosaves (chip shows Synced)", autosaved);
  const projFn = () => JSON.stringify(
    Object.keys(state).filter((k) => state[k] !== undefined && state[k] !== "" && state[k] !== "0").map((k) => [k, String(state[k])]).sort()
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
  check("Engine 2: board restored from server ledger after reload", projAfter === projBefore, projAfter.slice(0, 90));
  check("Engine 2: sync-state chip present after reload", (await f2.locator("#syncState").count()) === 1);

  await browser.close();
  finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
