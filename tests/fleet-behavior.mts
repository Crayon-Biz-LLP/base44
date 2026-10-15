// Behavioral verification for Fleet consoles — operates the asset grid in the
// real production sandbox like a user: open asset → log reading → apply →
// service state recomputes → set reading into the due window → banner fires →
// status change via drawer → chips filter → spotlight → persistence → sync.
import { chromium, type Frame, type Page } from "playwright-core";

const CR =
  "/Users/danielyashwant/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "http://localhost:3000";
const WORKFLOW_ID = process.env.FL_WF || "";

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
declare const STATUSES: string[];
declare const SERVICE_EVERY: number;
declare const state: { assets: { n: string; s: string; o: string; r: number }[] };

async function main() {
  console.log("=== Fleet behavioral verification (headless Chromium) ===");
  if (!WORKFLOW_ID) throw new Error("Set FL_WF=<workflow id>");
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

  // 1. Grid renders; KPIs match.
  await f.locator("#agrid .acard").first().waitFor({ state: "visible", timeout: 15000 });
  const cards = await f.locator("#agrid .acard").count();
  const kpiN = await f.locator("#kpiN").innerText();
  check("fleet grid renders assets", cards >= 3 && Number(kpiN) === cards, `(${cards} assets)`);

  // 2. Status chips present; filter works (counts match the clicked label).
  const chipLabels = await f.locator("#chips .chip").evaluateAll(cs => cs.map(c => (c.textContent || "").trim()));
  check("status chips rendered", chipLabels.length >= 3, `(${chipLabels.join(" / ")})`);
  const target = chipLabels[1]; // first real status, whatever the model named it
  await f.locator("#chips .chip").nth(1).click();
  await page.waitForTimeout(200);
  const visDuring = await f.locator("#agrid .acard:not(.dim)").count();
  const targetCards = await f.evaluate((lbl: string) => state.assets.filter((a: { s: string }) => a.s === lbl).length, target);
  check("status chip filters grid", visDuring === targetCards, `(${visDuring} visible vs ${targetCards} "${target}")`);
  await f.locator("#chips .chip").first().click();
  await page.waitForTimeout(200);

  // 3. Open first asset → drawer focuses name input.
  const firstName = (await f.locator("#agrid .acard .t").first().innerText()).trim();
  await f.locator("#agrid .acard").first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  const focusId = await f.evaluate(() => (document.activeElement && document.activeElement.id) || "");
  check("drawer focuses name input", focusId === "editF0", focusId);
  const modalTitle = (await f.locator("#modalTitle").innerText()).trim();
  check("drawer shows the right asset", modalTitle === firstName, JSON.stringify(modalTitle));

  // 4. Log a reading into the DUE window (interval - 5%) → badge flips to due.
  const interval = await f.evaluate(() => SERVICE_EVERY);
  const dueReading = Math.ceil(interval * 0.97);
  const dueBefore = await f.locator("#kpiDue").innerText();
  await f.locator("#editF2").fill(String(dueReading));
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  check("modal closes on Apply", (await f.locator("#modal.open").count()) === 0);
  const dueAfter = await f.locator("#kpiDue").innerText();
  check("service-due KPI recomputed", Number(dueAfter) === Number(dueBefore) + 1, `(${dueBefore} → ${dueAfter})`);
  const dueBadge = await f.locator("#agrid .badge.svc-due").count();
  check("due badge styled red", dueBadge >= 1, `(${dueBadge})`);
  const bannerOpen = await f.locator("#auditBanner.open").count();
  const bannerText = bannerOpen ? await f.locator("#auditText").innerText() : "";
  check("service banner fires", bannerOpen === 1 && /service-due threshold/.test(bannerText), JSON.stringify(bannerText.slice(0, 60)));

  // 5. Reset the reading to safe zone → due count drops, banner stays only if others still due.
  await f.locator("#agrid .acard").first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#editF2").fill(String(Math.ceil(interval * 0.5)));
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  const dueFinal = await f.locator("#kpiDue").innerText();
  check("due KPI drops after safe reading", Number(dueFinal) === Number(dueAfter) - 1, `(${dueAfter} → ${dueFinal})`);
  const bannerFinal = await f.locator("#auditBanner.open").count();
  check("banner state consistent with remaining dues", bannerFinal === (Number(dueFinal) > 0 ? 1 : 0), `(banner=${bannerFinal}, due=${dueFinal})`);

  // 6. Spotlight dims non-matching cards (full name = unique needle).
  await f.locator("#search").fill(firstName);
  await page.waitForTimeout(200);
  const hits = await f.locator(".acard.hit").count();
  const dims = await f.locator(".acard.dim").count();
  check("spotlight dims non-matching cards", hits >= 1 && dims > 0, `(${hits} hit, ${dims} dimmed)`);
  await f.locator("#search").fill("");
  await page.waitForTimeout(200);

  // 7. Persistence + sync bridge.
  const persisted = await f.evaluate(() => {
    try {
      const raw = localStorage.getItem("opsdesk_console_state");
      return raw && raw.length > 50 ? raw : null;
    } catch { return null; }
  });
  check("state persists via storage shim", typeof persisted === "string");

  await f.locator("#syncBtn").click();
  await page.waitForTimeout(1500);
  const toastText = await f.locator("#toast").innerText().catch(() => "");
  check("sync path reaches the host bridge", /Synced to OpsDesk|Saved locally/i.test(toastText) && !/Sync failed/i.test(toastText), JSON.stringify(toastText));

  // ── Engine 2: reload persistence — fresh reading → autosave → reload → ledger restore.
  await f.locator("#agrid .acard").first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#editF2").fill("4242");
  await f.locator("#modal .btn.primary").click();
  let autosaved = true;
  try { await f.locator("#syncState", { hasText: "Synced" }).waitFor({ state: "visible", timeout: 8000 }); }
  catch { autosaved = false; }
  check("Engine 2: edit autosaves (chip shows Synced)", autosaved);
  const projFn = () => JSON.stringify(
    state.assets.map((a) => [a.n, a.s, a.o || "", a.r || 0]).sort()
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
  check("Engine 2: fleet restored from server ledger after reload", projAfter === projBefore, projAfter.slice(0, 90));
  check("Engine 2: sync-state chip present after reload", (await f2.locator("#syncState").count()) === 1);

  await browser.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
