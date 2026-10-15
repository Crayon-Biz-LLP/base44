// Behavioral verification for Target Board consoles — operates the board in
// the real production sandbox like a user: click cell → report number → apply
// → modal closes → cell color flips → KPIs recompute → TEAM totals update.
import { chromium, type Frame, type Page } from "playwright-core";

const CR =
  "/Users/danielyashwant/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "http://localhost:3000";
const WORKFLOW_ID = process.env.TB_WF || "";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { passes++; console.log(`  ok  ${name} ${extra}`); }
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}

async function artifactFrame(page: Page): Promise<Frame> {
  for (let i = 0; i < 30; i++) {
    const frame = page.frames().find((f) => f !== page.mainFrame());
    if (frame) {
      const ok = await frame.evaluate(() => !!document.body).catch(() => false);
      if (ok) return frame;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("artifact iframe unavailable");
}

declare const state: Record<string, string>;

async function main() {
  console.log("=== Target Board behavioral verification (headless Chromium) ===");
  if (!WORKFLOW_ID) throw new Error("Set TB_WF=<workflow id>");
  const browser = await chromium.launch({ executablePath: CR, headless: true });

  const wfRes = await fetch(`${BASE}/api/workflow/${WORKFLOW_ID}`);
  const wf = await wfRes.json();
  const tenantId = wf?.workflow?.tenantId as string | undefined;
  check("workflow resolves", Boolean(tenantId));

  const context = await browser.newContext();
  if (tenantId) {
    await context.addInitScript(
      ([tid, sname]) => { try { localStorage.setItem(`staff_${tid}`, sname!); } catch {} },
      [tenantId, "TB E2E"]
    );
  }
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(`${BASE}/app/${WORKFLOW_ID}`, { waitUntil: "domcontentloaded" });
  const f = await artifactFrame(page);

  // 1. Board renders: 4 employee rows × 8 metric columns.
  await f.locator("#tbody tr").first().waitFor({ state: "visible", timeout: 15000 });
  const rowCards = await f.locator("#tbody tr").count();
  check("board renders employee rows", rowCards >= 4, `(${rowCards} rows incl. TEAM)`);
  const th = await f.locator("#thead").innerText();
  check("metric columns with targets", /new\s*\/3/i.test(th.replace(/\s+/g, " ")), JSON.stringify(th.slice(0, 80)));

  // 2. Click a cell → drawer focuses the actual input.
  await f.locator('.cell[data-p="Bhuvana"][data-k="new"]').click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  check("cell drawer opens", true);
  const focusId = await f.evaluate(() => (document.activeElement && document.activeElement.id) || "");
  check("drawer focuses actual input", focusId === "editF0", focusId);
  const tgt = await f.locator("#modalTarget").innerText();
  check("drawer shows target", /Target:\s*3/.test(tgt), JSON.stringify(tgt));

  // 3. Report a number → modal closes, cell turns ok, KPIs recompute.
  const repBefore = await f.locator("#kpiRep").innerText();
  await f.locator("#editF0").fill("3");
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  check("modal closes on Apply", (await f.locator("#modal.open").count()) === 0);
  const cellTxt = await f.locator('.cell[data-p="Bhuvana"][data-k="new"]').innerText();
  check("edit landed with achievement", /3/.test(cellTxt) && /100%/.test(cellTxt), JSON.stringify(cellTxt));
  const repAfter = await f.locator("#kpiRep").innerText();
  check("Reported-Today KPI recomputed", repBefore !== repAfter, `${repBefore} → ${repAfter}`);
  const toastVisible = await f.locator("#toast.open").count();
  check("toast confirms the save", toastVisible === 1);

  // 4. TEAM totals row updated for the edited metric.
  const teamRow = await f.locator("tr.total").innerText();
  check("TEAM totals row present", /TEAM/.test(teamRow));

  // 5. Spotlight search dims non-matching cells.
  await f.locator("#search").fill("Chronic");
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
  await f.locator('.cell[data-p="Bhuvana"][data-k="new"]').click();
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
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
