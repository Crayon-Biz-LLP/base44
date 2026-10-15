// Behavioral verification for Temporal consoles — operates the slot grid in
// the real production sandbox like a user: click empty slot → book → apply →
// cell fills → utilization recomputes → double-book → conflict banner fires →
// resolve → banner closes → spotlight → persistence → sync.
import { chromium, type Frame, type Page } from "playwright-core";

const CR =
  "/Users/danielyashwant/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "http://localhost:3000";
const WORKFLOW_ID = process.env.TM_WF || "";

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

// Globals inside the sandboxed artifact iframe (declared for TS only).
declare const RESOURCES: string[];
declare const state: { bookings: { p: string; r: string; st: number }[] };

async function main() {
  console.log("=== Temporal behavioral verification (headless Chromium) ===");
  if (!WORKFLOW_ID) throw new Error("Set TM_WF=<workflow id>");
  const browser = await chromium.launch({ executablePath: CR, headless: true });

  const wfRes = await fetch(`${BASE}/api/workflow/${WORKFLOW_ID}`);
  const wf = await wfRes.json();
  const tenantId = wf?.workflow?.tenantId as string | undefined;
  check("workflow resolves", Boolean(tenantId));

  const context = await browser.newContext();
  if (tenantId) {
    await context.addInitScript(
      ([tid, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); } catch {} },
      [tenantId, JSON.stringify({ name: "E2E", role: "owner" })]
    );
  }
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(`${BASE}/app/${WORKFLOW_ID}`, { waitUntil: "domcontentloaded" });
  const f = await artifactFrame(page);

  // 1. Grid renders: resource rows × slot columns.
  await f.locator("#tbody tr").first().waitFor({ state: "visible", timeout: 15000 });
  const rows = await f.locator("#tbody tr").count();
  const cols = await f.locator("#thead th").count();
  check("slot grid renders (resources × slots)", rows >= 1 && cols >= 5, `(${rows} rows × ${cols - 1} slots)`);
  const filled = await f.locator(".bcell.filled").count();
  const empties = await f.locator(".empty").count();
  check("seed has bookings AND free slots", filled >= 4 && empties > 0, `(${filled} booked, ${empties} free)`);

  // 2. Utilization KPI matches the grid.
  const util = await f.locator("#kpiUtil").innerText();
  const book = await f.locator("#kpiBook").innerText();
  check("utilization KPI below 100% (gaps seeded)", /%$/.test(util) && parseInt(util) < 100, `${util}, ${book} bookings`);

  // 3. Click an empty slot → drawer focuses the purpose input.
  const emptyCell = f.locator("#tbody .empty").first();
  const ri = await emptyCell.getAttribute("data-ri");
  const si = await emptyCell.getAttribute("data-si");
  await emptyCell.click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  const focusId = await f.evaluate(() => (document.activeElement && document.activeElement.id) || "");
  check("booking drawer focuses purpose input", focusId === "editF0", focusId);

  // 4. Book it → cell fills, KPIs recompute.
  const utilBefore = await f.locator("#kpiUtil").innerText();
  await f.locator("#editF0").fill("E2E — test booking");
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  check("modal closes on Apply", (await f.locator("#modal.open").count()) === 0);
  const newCell = f.locator(`.bcell.filled[data-ri="${ri}"][data-si="${si}"]`);
  check("new booking fills the cell", (await newCell.count()) === 1, "E2E — test booking");
  const utilAfter = await f.locator("#kpiUtil").innerText();
  check("utilization recomputed", utilBefore !== utilAfter, `${utilBefore} → ${utilAfter}`);

  // 5. Double-book: edit an existing booking onto the same resource+slot →
  //    conflict badge + banner fire.
  const firstBooked = f.locator(".bcell.filled").first();
  await firstBooked.click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#resSel").selectOption(await f.evaluate(([r, s]) => {
    const b = state.bookings.find((x: { p: string }) => x.p === "E2E — test booking");
    return b ? b.r : RESOURCES[Number(r)];
  }, [ri, si] as (string | null)[]));
  await f.locator("#slotSel").selectOption(await f.evaluate(([r, s]) => {
    const b = state.bookings.find((x: { p: string }) => x.p === "E2E — test booking");
    return String(b ? b.st : Number(s));
  }, [ri, si] as (string | null)[]));
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  const conflicts = await f.locator("#kpiConf").innerText();
  check("double-booking detected", Number(conflicts) >= 1, `(KPI ${conflicts})`);
  const conflictCells = await f.locator(".bcell.conflict").count();
  check("conflict cell styled red", conflictCells >= 1, `(${conflictCells})`);
  const bannerOpen = await f.locator("#auditBanner.open").count();
  const bannerText = bannerOpen ? await f.locator("#auditText").innerText() : "";
  check("collision banner fires", bannerOpen === 1 && /double-booked/.test(bannerText), JSON.stringify(bannerText.slice(0, 60)));

  // 6. Resolve: move the edited booking elsewhere → banner closes.
  await firstBooked.click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#slotSel").selectOption({ index: (await f.locator("#slotSel option").count()) - 1 });
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  check("banner closes after resolution", (await f.locator("#auditBanner.open").count()) === 0 && (await f.locator("#kpiConf").innerText()) === "0");

  // 7. Spotlight: type a purpose fragment → non-matching cells dim, matching glows.
  await f.locator("#search").fill("E2E");
  await page.waitForTimeout(200);
  const hits = await f.locator(".bcell.hit").count();
  const dims = await f.locator(".bcell.dim, .empty.dim").count();
  check("spotlight dims non-matching cells", hits >= 1 && dims > 0, `(${hits} hit, ${dims} dimmed)`);
  await f.locator("#search").fill("");
  await page.waitForTimeout(200);

  // 8. Persistence + sync bridge.
  const persisted = await f.evaluate(() => {
    try {
      const raw = localStorage.getItem("opsdesk_console_state");
      return raw && raw.includes("E2E — test booking") ? raw : null;
    } catch { return null; }
  });
  check("state persists via storage shim", typeof persisted === "string");

  await f.locator("#syncBtn").click();
  await page.waitForTimeout(1500);
  const toastText = await f.locator("#toast").innerText().catch(() => "");
  check("sync path reaches the host bridge", /Synced to OpsDesk|Saved locally/i.test(toastText) && !/Sync failed/i.test(toastText), JSON.stringify(toastText));

  // ── Engine 2: reload persistence — fresh booking → autosave → reload → ledger restore.
  await f.locator("#tbody .empty").first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#editF0").fill("E2E — persist");
  await f.locator("#modal .btn.primary").click();
  let autosaved = true;
  try { await f.locator("#syncState", { hasText: "Synced" }).waitFor({ state: "visible", timeout: 8000 }); }
  catch { autosaved = false; }
  check("Engine 2: edit autosaves (chip shows Synced)", autosaved);
  const projFn = () => JSON.stringify(
    state.bookings.map((b) => [b.p, b.r, b.st]).sort()
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
  check("Engine 2: bookings restored from server ledger after reload", projAfter === projBefore, projAfter.slice(0, 90));
  check("Engine 2: sync-state chip present after reload", (await f2.locator("#syncState").count()) === 1);

  await browser.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
