// Behavioral verification for Pipeline consoles — operates the kanban board in
// the real production sandbox like a user: open breached card → move stage →
// apply → aging resets → breach count drops → banner logic holds → spotlight
// dims/hits → persistence → sync bridge. Content-agnostic: works against any
// LLM-extracted config (stages/titles/owners are never assumed).
import { chromium, type Frame, type Page } from "playwright-core";

const CR =
  "/Users/danielyashwant/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "http://localhost:3000";
const WORKFLOW_ID = process.env.PL_WF || "";

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

declare const state: { items: { t: string; s: number; o: string; d: number }[] };

async function main() {
  console.log("=== Pipeline behavioral verification (headless Chromium) ===");
  if (!WORKFLOW_ID) throw new Error("Set PL_WF=<workflow id>");
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

  // 1. Board renders: kanban columns with cards, KPI total matches.
  await f.locator("#kanban .col").first().waitFor({ state: "visible", timeout: 15000 });
  const cols = await f.locator("#kanban .col").count();
  const kpiTotal = await f.locator("#kpiTotal").innerText();
  check("kanban renders stages with cards", cols >= 2 && Number(kpiTotal) >= 4, `(${cols} cols, ${kpiTotal} cards)`);

  // 2. SLA intelligence live on load: breach seed fires the banner.
  const bannerOpen = await f.locator("#auditBanner.open").count();
  const bannerText = bannerOpen ? await f.locator("#auditText").innerText() : "";
  const breachBadges = await f.locator("#kanban .badge.breach").count();
  const kpiWarn = await f.locator("#kpiWarn").innerText();
  check("breach banner open with seed breach", bannerOpen === 1 && /breached SLA/.test(bannerText), JSON.stringify(bannerText.slice(0, 60)));
  check("breach count consistent (badges == KPI)", breachBadges === Number(kpiWarn) && breachBadges >= 1, `(${breachBadges} badges, KPI ${kpiWarn})`);

  // 3. Open the first breaching card → drawer focuses the title input.
  const breachCard = f.locator(".pcard", { has: f.locator(".badge.breach") }).first();
  const cardTitle = (await breachCard.locator(".t").innerText()).trim();
  await breachCard.click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  check("card drawer opens", true);
  const focusId = await f.evaluate(() => (document.activeElement && document.activeElement.id) || "");
  check("drawer focuses title input", focusId === "editF0", focusId);
  const modalTitle = (await f.locator("#modalTitle").innerText()).trim();
  check("drawer shows the right card", modalTitle === cardTitle, JSON.stringify(modalTitle));

  // 4. Move the card to the next stage → aging resets to 0d, breach clears.
  const stageCount = await f.locator("#stageSel option").count();
  const curStage = await f.locator("#stageSel").inputValue();
  const nextStage = String((Number(curStage) + 1) % Math.max(stageCount, 1));
  await f.locator("#stageSel").selectOption(nextStage);
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  check("modal closes on Apply", (await f.locator("#modal.open").count()) === 0);
  const movedCard = f.locator(".pcard", { hasText: cardTitle }).first();
  const movedAge = (await movedCard.locator(".badge").innerText()).trim();
  check("stage move resets aging to 0d", movedAge === "0d", movedAge);
  const breachAfter = await f.locator("#kanban .badge.breach").count();
  const kpiWarnAfter = await f.locator("#kpiWarn").innerText();
  check("breach count dropped after move", breachAfter === breachBadges - 1 && breachAfter === Number(kpiWarnAfter), `(${breachBadges} → ${breachAfter}, KPI ${kpiWarnAfter})`);

  // 5. Reopen the card, set an absurd age (99d) → breach returns, badge updates.
  await movedCard.click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#editF2").fill("99");
  await f.locator("#modal .btn.primary").click();
  await page.waitForTimeout(300);
  const age99 = (await movedCard.locator(".badge").innerText()).trim();
  check("manual age edit lands (99d)", age99 === "99d", age99);
  const breach99 = await f.locator("#kanban .badge.breach").count();
  check("banner logic holds after edit", breach99 === breachAfter + 1, `(${breach99})`);

  // 6. Spotlight search dims non-matching cards.
  const hay = cardTitle.slice(0, Math.min(6, cardTitle.length)).toLowerCase();
  await f.locator("#search").fill(hay);
  await page.waitForTimeout(200);
  const hits = await f.locator(".pcard.hit").count();
  const dims = await f.locator(".pcard.dim").count();
  check("spotlight dims non-matching cards", hits > 0 && dims > 0, `(${hits} hit, ${dims} dimmed)`);
  await f.locator("#search").fill("");
  await page.waitForTimeout(200);

  // 7. Persistence via storage shim (moved card's new stage survived).
  const persisted = await f.evaluate(([t]) => {
    try {
      const raw = localStorage.getItem("opsdesk_console_state");
      if (!raw) return null;
      const st = JSON.parse(raw);
      const it = (st.items || []).find((x: { t: string }) => x.t === t);
      return it ? JSON.stringify(it) : null;
    } catch { return null; }
  }, [cardTitle] as unknown as string[]);
  check("state persists via storage shim", typeof persisted === "string" && (persisted as string).includes('"d":99'), JSON.stringify(persisted));

  // 8. Sync bridge.
  await f.locator("#syncBtn").click();
  await page.waitForTimeout(1500);
  const toastText = await f.locator("#toast").innerText().catch(() => "");
  check("sync path reaches the host bridge", /Synced to OpsDesk|Saved locally/i.test(toastText) && !/Sync failed/i.test(toastText), JSON.stringify(toastText));

  // ── Engine 2: reload persistence — fresh edit → autosave → reload → ledger restore.
  await f.locator(".pcard").first().click();
  await f.locator("#modal.open").waitFor({ state: "visible" });
  await f.locator("#editF2").fill("42");
  await f.locator("#modal .btn.primary").click();
  let autosaved = true;
  try { await f.locator("#syncState", { hasText: "Synced" }).waitFor({ state: "visible", timeout: 8000 }); }
  catch { autosaved = false; }
  check("Engine 2: edit autosaves (chip shows Synced)", autosaved);
  const projFn = () => JSON.stringify(
    state.items.map((it) => [it.t, it.s, it.o || "", it.d]).sort()
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
  check("Engine 2: kanban restored from server ledger after reload", projAfter === projBefore, projAfter.slice(0, 90));
  check("Engine 2: sync-state chip present after reload", (await f2.locator("#syncState").count()) === 1);

  await browser.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
