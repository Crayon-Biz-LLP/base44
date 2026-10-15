// Behavioral verification for Ledger consoles — operates the running-balance
// table in the real production sandbox like a user: open entry → edit → apply
// → balances recompute → banner logic follows threshold → spotlight →
// persistence → sync. Content-agnostic across domains.
import { chromium, type Frame, type Page } from "playwright-core";

const CR =
  "/Users/danielyashwant/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "http://localhost:3000";
const WORKFLOW_ID = process.env.LG_WF || "";

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
declare const OPENING: number;
declare const THRESHOLD: number;
declare const TYPES: { l: string; s: number }[];
declare const state: { entries: { l: string; a: number; t: string; d: number; ac: string }[] };

async function main() {
  console.log("=== Ledger behavioral verification (headless Chromium) ===");
  if (!WORKFLOW_ID) throw new Error("Set LG_WF=<workflow id>");
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

  // 1. Table renders with entries; KPI count matches.
  await f.locator("#tbody tr").first().waitFor({ state: "visible", timeout: 15000 });
  const rows = await f.locator("#tbody tr").count();
  const kpiN = await f.locator("#kpiN").innerText();
  check("ledger renders entry rows", rows >= 4 && Number(kpiN) === rows, `(${rows} rows, KPI ${kpiN})`);

  // 2. Balance engine: recomputed independently from live state, compared to KPI.
  const expected = await f.evaluate(() => {
    const open = (typeof OPENING === "number") ? OPENING : 0;
    return state.entries.reduce((b: number, e: { a: number; t: string }) => {
      const t = TYPES.find((x: { l: string }) => x.l === e.t);
      return b + (t ? t.s : -1) * e.a;
    }, open);
  });
  const kpiBal = (await f.locator("#kpiBal").innerText()).replace(/[^0-9.\-]/g, "");
  check("running-balance engine matches independent recompute", Math.abs(Number(kpiBal) - expected) < 0.01, `(KPI ${kpiBal} vs ${expected})`);

  // 3. Banner logic follows the threshold on the computed chain.
  const dipped = await f.evaluate(() => {
    let b = OPENING;
    for (let i = 0; i < state.entries.length; i++) {
      const t = TYPES.find((x: { l: string }) => x.l === state.entries[i].t);
      b += (t ? t.s : -1) * state.entries[i].a;
      if (b < THRESHOLD) return true;
    }
    return false;
  });
  const bannerOpen = await f.locator("#auditBanner.open").count();
  check("threshold banner tracks computed dips", bannerOpen === (dipped ? 1 : 0), `(dipped=${dipped})`);

  // 4. Open the first entry → drawer focuses the label input.
  const firstLabel = (await f.locator("#tbody tr").first().locator("td").nth(2).innerText()).trim();
  await f.locator("#tbody tr").first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  const focusId = await f.evaluate(() => (document.activeElement && document.activeElement.id) || "");
  check("drawer opens focused on label input", focusId === "editF0", focusId);
  const modalTitle = (await f.locator("#modalTitle").innerText()).trim();
  check("drawer shows the right entry", modalTitle === firstLabel, JSON.stringify(modalTitle));

  // 5. Edit amount to 999999 → balance recomputes, edit persists.
  const balBefore = await f.locator("#kpiBal").innerText();
  await f.locator("#editF1").fill("999999");
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  check("modal closes on Apply", (await f.locator("#modal.open").count()) === 0);
  const balAfter = await f.locator("#kpiBal").innerText();
  check("balance recomputed after edit", balBefore !== balAfter, `${balBefore} → ${balAfter}`);
  const persistedAmount = await f.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("opsdesk_console_state") || "null")?.entries?.[0]?.a ?? null; }
    catch { return null; }
  });
  check("edited amount persisted via storage shim", persistedAmount === 999999, String(persistedAmount));

  // 6. Flip the entry's type to the opposite sign → badge and amount class flip.
  await f.locator("#tbody tr").first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  const curType = await f.locator("#typeSel").inputValue();
  const opts = await f.locator("#typeSel option").evaluateAll(os =>
    os.map(o => ({ v: (o as HTMLOptionElement).value, t: (o as HTMLOptionElement).textContent || "" }))
  );
  const curIsIn = await f.evaluate((ct: string) => {
    const t = (typeof TYPES !== "undefined" ? TYPES : []).find((x: { l: string }) => x.l === ct);
    return t ? t.s > 0 : false;
  }, curType);
  const flip = opts.find(o => curIsIn ? o.t.includes("(out)") : o.t.includes("(in)"));
  if (flip) {
    await f.locator("#typeSel").selectOption(flip.v);
    await f.locator("#modal .btn.primary").click();
    await page.waitForTimeout(300);
    const badgeTxt = (await f.locator("#tbody tr").first().locator(".badge").innerText()).trim();
    check("type flip lands in the row badge", badgeTxt === flip.v, `${curType} → ${badgeTxt}`);
    const amtClass = (await f.locator("#tbody tr").first().locator(".amt").getAttribute("class")) || "";
    check("amount class follows sign", amtClass.includes(curIsIn ? "out" : "in"), amtClass);
  } else {
    check("type flip lands in the row badge", false, "(no opposite-sign type available)");
    check("amount class follows sign", false, "(skipped)");
  }

  // 7. Spotlight search dims non-matching rows.
  const hay = firstLabel.slice(0, Math.min(5, firstLabel.length)).toLowerCase();
  await f.locator("#search").fill(hay);
  await page.waitForTimeout(200);
  const hits = await f.locator(".erow.hit").count();
  const dims = await f.locator(".erow.dim").count();
  check("spotlight dims non-matching rows", hits > 0 && dims > 0, `(${hits} hit, ${dims} dimmed)`);
  await f.locator("#search").fill("");
  await page.waitForTimeout(200);

  // 8. Sync bridge.
  await f.locator("#syncBtn").click();
  await page.waitForTimeout(1500);
  const toastText = await f.locator("#toast").innerText().catch(() => "");
  check("sync path reaches the host bridge", /Synced to OpsDesk|Saved locally/i.test(toastText) && !/Sync failed/i.test(toastText), JSON.stringify(toastText));

  // ── Engine 2: reload persistence — fresh edit → autosave → reload → ledger restore.
  await f.locator("#tbody tr").first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#editF1").fill("888888");
  await f.locator("#modal .btn.primary").click();
  let autosaved = true;
  try { await f.locator("#syncState", { hasText: "Synced" }).waitFor({ state: "visible", timeout: 8000 }); }
  catch { autosaved = false; }
  check("Engine 2: edit autosaves (chip shows Synced)", autosaved);
  const projFn = () => JSON.stringify(
    state.entries.map((e) => [e.d, e.l, e.t, e.ac, e.a]).sort()
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
  check("Engine 2: ledger restored from server ledger after reload", projAfter === projBefore, projAfter.slice(0, 90));
  check("Engine 2: sync-state chip present after reload", (await f2.locator("#syncState").count()) === 1);

  await browser.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
