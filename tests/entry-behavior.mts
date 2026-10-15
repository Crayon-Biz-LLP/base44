// Entry-mode behavioral verification — the role flows gate → sandbox → console
// and the console scoping holds in the real sandbox: staff target-board shows
// exactly one row with owner chrome hidden; staff fleet shows exactly one
// vehicle. Same browser, same tenant, two roles.
import { chromium, type Frame, type Page } from "playwright-core";
import { readFileSync } from "node:fs";

// Live-data endpoints are tenant-private now: each seeded context must carry
// the SAME signed session cookie the gate would set. The signature is derived
// at test time with the same secret the dev server uses (APP_SECRET from
// .env.local, else the dev default).
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { signStaffValue } = await import("../src/lib/infra/app-auth");

const CR =
  "/Users/danielyashwant/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "http://localhost:3000";
const TB_WF = process.env.TB_WF || "";
const FL_WF = process.env.FL_WF || "";

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

async function tenantOf(id: string): Promise<string | undefined> {
  const res = await fetch(`${BASE}/api/workflow/${id}`);
  const wf = await res.json();
  return wf?.workflow?.tenantId as string | undefined;
}

async function main() {
  console.log("=== Entry-mode behavioral verification (Target Board + Fleet) ===");
  if (!TB_WF || !FL_WF) throw new Error("Set TB_WF=<id> and FL_WF=<id>");
  const browser = await chromium.launch({ executablePath: CR, headless: true });

  // ---------- Target Board ----------
  {
    const tenantId = await tenantOf(TB_WF);
    check("tb: workflow resolves", Boolean(tenantId));

    // Owner view: full board (pre-seeded owner session skips the gate)
    const oc = await browser.newContext();
    if (tenantId) {
      await oc.addInitScript(
        ([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} },
        [tenantId, JSON.stringify({ name: "__owner__", role: "owner" })]
      );
    }
    const op = await oc.newPage();
    op.setDefaultTimeout(30000);
    await op.goto(`${BASE}/app/${TB_WF}`, { waitUntil: "domcontentloaded" });
    const of = await artifactFrame(op);
    await of.locator("#tbody tr").first().waitFor({ state: "visible", timeout: 15000 });
    const ownerRows = await of.locator("#tbody tr").count();
    const ownerHasPodium = await of.locator("#podium .pod-card").count();
    const ownerKpi = await of.locator(".grid-4 .kpi").count();
    check("tb: owner sees full board", ownerRows >= 2 && ownerKpi === 4, `(${ownerRows} rows, ${ownerKpi} KPIs)`);
    check("tb: owner sees podium", ownerHasPodium >= 1, `(${ownerHasPodium} podium cards)`);
    await oc.close();

    // Staff view: entry mode. Staff names must come from the board's ACTUAL
    // roster (Gemini invents them per prompt — fixture-era hardcoded names
    // silently miss and entry mode never activates).
    const tbWfJson = await (await fetch(`${BASE}/api/workflow/${TB_WF}`)).json();
    const tbRoster: string[] = ((((tbWfJson?.workflow?.config?.archetypeConfig ?? {}).people ?? [])) as { name: string }[]).map(p => p.name);
    const [tbStaffA, tbStaffB] = [tbRoster[0], tbRoster[1] || tbRoster[0]];
    const sc = await browser.newContext();
    if (tenantId) {
      await sc.addInitScript(
        ([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} },
        [tenantId, signStaffValue(tenantId, tbStaffA), JSON.stringify({ name: tbStaffA, role: "staff" })]
      );
    }
    const sp = await sc.newPage();
    sp.setDefaultTimeout(30000);
    await sp.goto(`${BASE}/app/${TB_WF}?as=staff`, { waitUntil: "domcontentloaded" });
    const sf = await artifactFrame(sp);
    await sf.locator("#staffHome .sh-hi").waitFor({ state: "visible", timeout: 15000 }); // Staff Home replaces the board
    await sp.waitForTimeout(400); // allow entry-mode render to settle
    const staffRows = await sf.locator("#tbody tr").count();
    const staffPodium = await sf.locator("#podium .pod-card").count();
    const entryBody = await sf.evaluate(() => document.body.classList.contains("entry"));
    const tbKpiHidden = await sf.locator(".grid-4").isHidden();
    check("tb: staff sees exactly their row", staffRows === 1, `(${staffRows} row)`);
    check("tb: staff has no podium", staffPodium === 0);
    check("tb: entry mode active", entryBody);
    check("tb: owner chrome hidden", tbKpiHidden);

    // Staff Home: their metrics as big tappable cards → same proven modal.
    await sf.locator("#staffHome .sh-card").first().waitFor({ state: "visible", timeout: 15000 });
    const shCards = await sf.locator("#staffHome .sh-card").count();
    check("tb: staff home shows their metric cards", shCards === 4, `(${shCards} cards)`);
    await sf.locator("#staffHome .sh-card").first().click();
    await sf.locator("#modal.open").waitFor({ state: "visible" });
    const modalTitle = await sf.locator("#modalTitle").innerText();
    check("tb: staff modal scoped to their row", modalTitle.startsWith(tbStaffA), `("${modalTitle}")`);
    await sf.locator("#editF0").fill("3");
    await sf.locator("#modal .btn.primary").click();
    await sp.waitForTimeout(400);
    check("tb: staff edit applies", (await sf.locator("#modal.open").count()) === 0);
    await sc.close();

    // Multi-user coexistence: two staff, two browsers, sequential edits.
    // Entry consoles sync the FULL snapshot (view-scoped, ledger-whole), so
    // Srimathi's sync must carry Bhuvana's edit too — owner reload shows both.
    const mkStaff = async (name: string) => {
      const c2 = await browser.newContext();
      if (tenantId) {
        await c2.addInitScript(
          ([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} },
          [tenantId, signStaffValue(tenantId, name), JSON.stringify({ name, role: "staff" })]
        );
      }
      const p2 = await c2.newPage();
      p2.setDefaultTimeout(30000);
      await p2.goto(`${BASE}/app/${TB_WF}?as=staff`, { waitUntil: "domcontentloaded" });
      const f2 = await artifactFrame(p2);
      await f2.locator("#staffHome .sh-hi").waitFor({ state: "visible", timeout: 15000 }); // staff home, not the board
      return { c2, p2, f2 };
    };
    const A = await mkStaff(tbStaffA);
    await A.f2.locator("#staffHome .sh-card").first().click();
    await A.f2.locator("#modal.open").waitFor({ state: "visible" });
    await A.f2.locator("#editF0").fill("3");
    await A.f2.locator("#modal .btn.primary").click();
    await A.p2.waitForTimeout(1600); // autosave debounce

    const B = await mkStaff(tbStaffB); // boots AFTER A's sync → hydrates A's snapshot
    await B.f2.locator("#staffHome .sh-card").first().click();
    await B.f2.locator("#modal.open").waitFor({ state: "visible" });
    await B.f2.locator("#editF0").fill("20");
    await B.f2.locator("#modal .btn.primary").click();
    await B.p2.waitForTimeout(1600);

    const oc2 = await browser.newContext();
    if (tenantId) {
      await oc2.addInitScript(
        ([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} },
        [tenantId, JSON.stringify({ name: "__owner__", role: "owner" })]
      );
    }
    const op2 = await oc2.newPage();
    op2.setDefaultTimeout(30000);
    await op2.goto(`${BASE}/app/${TB_WF}`, { waitUntil: "domcontentloaded" });
    const of2 = await artifactFrame(op2);
    await of2.locator("#tbody .cell").first().waitFor({ state: "visible", timeout: 15000 });
    const aNew = await of2.locator("#tbody tr:nth-child(1) .cell .a").first().innerText();
    const sNew = await of2.locator("#tbody tr:nth-child(2) .cell .a").first().innerText();
    check(`multi-user: ${tbStaffA}'s edit survives ${tbStaffB}'s sync`, aNew === "3", `(New=${aNew})`);
    check(`multi-user: ${tbStaffB}'s edit landed`, sNew === "20", `(New=${sNew})`);
    await A.c2.close(); await B.c2.close(); await oc2.close();
  }

  // ---------- Fleet ----------
  {
    const tenantId = await tenantOf(FL_WF);
    check("fleet: workflow resolves", Boolean(tenantId));

    // Find a real driver name from the seed config
    const wfRes = await fetch(`${BASE}/api/workflow/${FL_WF}`);
    const wfJson = await wfRes.json();
    const archCfg = wfJson?.workflow?.config?.archetypeConfig;
    const driver = (archCfg?.assets?.[0]?.owner as string) || "";
    check("fleet: extracted driver exists", Boolean(driver), `(${driver})`);

    // Owner view (pre-seeded owner session skips the gate)
    const oc = await browser.newContext();
    if (tenantId) {
      await oc.addInitScript(
        ([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} },
        [tenantId, JSON.stringify({ name: "__owner__", role: "owner" })]
      );
    }
    const op = await oc.newPage();
    op.setDefaultTimeout(30000);
    await op.goto(`${BASE}/app/${FL_WF}`, { waitUntil: "domcontentloaded" });
    const of = await artifactFrame(op);
    await of.locator(".acard").first().waitFor({ state: "visible", timeout: 15000 });
    const ownerCards = await of.locator(".acard").count();
    const ownerKpi = await of.locator(".grid-4 .kpi").count();
    check("fleet: owner sees full fleet", ownerCards >= 3 && ownerKpi === 4, `(${ownerCards} cards, ${ownerKpi} KPIs)`);
    await oc.close();

    // Staff view: entry mode scoped to the first asset's owner
    const sc = await browser.newContext();
    if (tenantId) {
      await sc.addInitScript(
        ([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} },
        [tenantId, signStaffValue(tenantId, driver), JSON.stringify({ name: driver, role: "staff" })]
      );
    }
    const sp = await sc.newPage();
    sp.setDefaultTimeout(30000);
    await sp.goto(`${BASE}/app/${FL_WF}?as=staff`, { waitUntil: "domcontentloaded" });
    const sf = await artifactFrame(sp);
    await sf.locator("#shMeter").waitFor({ state: "visible", timeout: 15000 }); // Staff Home replaces the fleet grid
    await sp.waitForTimeout(400);
    const staffCards = await sf.locator(".acard").count();
    const entryBody = await sf.evaluate(() => document.body.classList.contains("entry"));
    const kpiHidden = await sf.locator(".grid-4").isHidden();
    check("fleet: staff sees exactly their vehicle", staffCards === 1, `(${staffCards} card)`);
    check("fleet: staff has no fleet-wide KPIs", kpiHidden);
    check("fleet: entry mode active", entryBody);

    // Staff Home: one big meter field, warm confirm. No modal needed.
    await sf.locator("#shMeter").waitFor({ state: "visible", timeout: 15000 });
    await sf.locator("#shMeter").fill("123456");
    await sf.locator("#shSave").click();
    await sp.waitForTimeout(500);
    const warmToast = await sf.locator("#toast.open").innerText().catch(() => "");
    check("fleet: staff reading sent (warm confirm)", warmToast.includes("Sent to boss"), `("${warmToast}")`);
    const shBadge = await sf.locator(".sh-vbadge").innerText().catch(() => "");
    check("fleet: staff home shows plain-language status", shBadge.length > 0, `("${shBadge}")`);
    await sc.close();
  }

  // ---------- Pipeline / Temporal / Ledger / Spatial entry modes ----------
  // Extended entry-mode coverage: pipeline+temporal scope ROWS (owner/resource),
  // ledger+spatial scope CHROME (shared money/floor knowledge, worker tools hidden).
  const PL_WF = process.env.PL_WF || "";
  const TM_WF = process.env.TM_WF || "";
  const LG_WF = process.env.LG_WF || "";
  const SP_WF = process.env.SP_WF || "";

  if (PL_WF) {
    const tenantId = await tenantOf(PL_WF);
    const cfg = ((await (await fetch(`${BASE}/api/workflow/${PL_WF}`)).json())?.workflow?.config?.archetypeConfig ?? {}) as { items?: { owner?: string }[] };
    const worker = (cfg.items ?? []).map(i => (i.owner || "").trim()).find(o => o.length > 0) || "";
    check("pl: extracted card owner exists", Boolean(worker), `(${worker})`);

    const oc = await browser.newContext();
    if (tenantId) await oc.addInitScript(([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} }, [tenantId, signStaffValue(tenantId, "__owner__"), JSON.stringify({ name: "__owner__", role: "owner" })]);
    const op = await oc.newPage(); op.setDefaultTimeout(30000);
    await op.goto(`${BASE}/app/${PL_WF}`, { waitUntil: "domcontentloaded" });
    const of = await artifactFrame(op);
    await of.locator(".pcard").first().waitFor({ state: "visible", timeout: 15000 });
    const ownerCards = await of.locator(".pcard").count();
    await oc.close();

    const sc = await browser.newContext();
    if (tenantId) await sc.addInitScript(([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} }, [tenantId, signStaffValue(tenantId, worker), JSON.stringify({ name: worker, role: "staff" })]);
    const sp = await sc.newPage(); sp.setDefaultTimeout(30000);
    await sp.goto(`${BASE}/app/${PL_WF}?as=staff`, { waitUntil: "domcontentloaded" });
    const sf = await artifactFrame(sp);
    await sf.locator("#staffHome .sh-hi").waitFor({ state: "visible", timeout: 15000 }); // Staff Home replaces the kanban
    await sp.waitForTimeout(400);
    const staffCards = await sf.locator("#staffHome .sh-card").count();
    const entryBody = await sf.evaluate(() => document.body.classList.contains("entry"));
    const kpiHidden = await sf.locator(".grid-4").isHidden();
    const kanbanHidden = await sf.locator("#kanban").isHidden();
    check("pl: entry mode active", entryBody);
    check("pl: staff home shows only their cards", staffCards >= 1 && staffCards < 20, `(${staffCards} of 20)`);
    check("pl: fleet-wide KPIs hidden", kpiHidden);
    check("pl: kanban hidden (own screen, not manager-minus)", kanbanHidden);
    await sf.locator("#staffHome .sh-card").first().click();
    await sp.waitForTimeout(400);
    const advToast = await sf.locator("#toast.open").innerText().catch(() => "");
    check("pl: one tap advances the card", advToast.includes("Moved to"), `("${advToast}")`);
    await sc.close();
  }

  if (TM_WF) {
    const tenantId = await tenantOf(TM_WF);
    const cfg = ((await (await fetch(`${BASE}/api/workflow/${TM_WF}`)).json())?.workflow?.config?.archetypeConfig ?? {}) as { resources?: { name: string }[] };
    const resource = (cfg.resources ?? [])[0]?.name || "";
    check("tm: extracted resource exists", Boolean(resource), `(${resource})`);

    const oc = await browser.newContext();
    if (tenantId) await oc.addInitScript(([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} }, [tenantId, signStaffValue(tenantId, "__owner__"), JSON.stringify({ name: "__owner__", role: "owner" })]);
    const op = await oc.newPage(); op.setDefaultTimeout(30000);
    await op.goto(`${BASE}/app/${TM_WF}`, { waitUntil: "domcontentloaded" });
    const of = await artifactFrame(op);
    await of.locator("#tbody tr").first().waitFor({ state: "visible", timeout: 15000 });
    const ownerRows = await of.locator("#tbody tr").count();
    await oc.close();

    const sc = await browser.newContext();
    if (tenantId) await sc.addInitScript(([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} }, [tenantId, signStaffValue(tenantId, resource), JSON.stringify({ name: resource, role: "staff" })]);
    const sp = await sc.newPage(); sp.setDefaultTimeout(30000);
    await sp.goto(`${BASE}/app/${TM_WF}?as=staff`, { waitUntil: "domcontentloaded" });
    const sf = await artifactFrame(sp);
    await sf.locator("#staffHome .sh-hi").waitFor({ state: "visible", timeout: 15000 }); // Staff Home replaces the grid
    await sp.waitForTimeout(400);
    const staffSlots = await sf.locator("#staffHome .sh-slot").count();
    const entryBody = await sf.evaluate(() => document.body.classList.contains("entry"));
    const kpiHidden = await sf.locator(".grid-4").isHidden();
    const gridHidden = await sf.locator(".tgrid").isHidden();
    check("tm: entry mode active", entryBody);
    check("tm: staff home shows their chair's day", staffSlots >= 4, `(${staffSlots} slots)`);
    check("tm: fleet-wide KPIs hidden", kpiHidden);
    check("tm: owner grid hidden (own screen, not manager-minus)", gridHidden);
    const mineCount = await sf.locator("#staffHome .sh-slot.mine").count();
    await sf.locator(mineCount > 0 ? "#staffHome .sh-slot.mine" : "#staffHome .sh-slot").first().click();
    await sf.locator("#modal.open").waitFor({ state: "visible" });
    await sf.locator("#editF0").fill("Walk-in haircut");
    await sf.locator("#modal .btn.primary").click();
    await sp.waitForTimeout(300);
    check("tm: staff can book/change their slot", (await sf.locator("#modal.open").count()) === 0);
    await sc.close();
  }

  if (LG_WF) {
    const tenantId = await tenantOf(LG_WF);
    const sc = await browser.newContext();
    if (tenantId) await sc.addInitScript(([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} }, [tenantId, signStaffValue(tenantId, "Counter Staff"), JSON.stringify({ name: "Counter Staff", role: "staff" })]);
    const sp = await sc.newPage(); sp.setDefaultTimeout(30000);
    await sp.goto(`${BASE}/app/${LG_WF}?as=staff`, { waitUntil: "domcontentloaded" });
    const sf = await artifactFrame(sp);
    await sf.locator("#staffHome .sh-hi").waitFor({ state: "visible", timeout: 15000 }); // Staff Home replaces the khata
    await sp.waitForTimeout(400);
    const entryBody = await sf.evaluate(() => document.body.classList.contains("entry"));
    const balanceVisible = await sf.locator(".sh-balance").isVisible();
    const exportHidden = await sf.locator("button:has-text('Export CSV')").isHidden();
    check("lg: entry mode active", entryBody);
    check("lg: staff home shows the day's balance in plain words", balanceVisible);
    check("lg: export hidden", exportHidden);
    // Money-in flow: pre-selected type modal → fill → apply → stamped + warm toast
    await sf.locator("#shIn").click();
    await sf.locator("#modal.open").waitFor({ state: "visible" });
    await sf.locator("#editF0").fill("Morning cash sale");
    await sf.locator("#editF1").fill("250");
    await sf.locator("#modal .btn.primary").click();
    await sp.waitForTimeout(400);
    const stamped = await sf.evaluate((w) => (window as any).state.entries.some((e: any) => e.by === w), "Counter Staff");
    check("lg: staff can log money-in (stamped with their name)", stamped);
    await sc.close();
  }

  if (SP_WF) {
    const tenantId = await tenantOf(SP_WF);
    const sc = await browser.newContext();
    if (tenantId) await sc.addInitScript(([tid, sig, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); const s = JSON.parse(sess!); document.cookie = (s && s.role === "owner") ? `opsdesk_tenant_id=${tid}; path=/` : `opsdesk_staff_${tid}=${encodeURIComponent(sig!)}; path=/`; } catch {} }, [tenantId, signStaffValue(tenantId, "Yard Hand"), JSON.stringify({ name: "Yard Hand", role: "staff" })]);
    const sp = await sc.newPage(); sp.setDefaultTimeout(30000);
    await sp.goto(`${BASE}/app/${SP_WF}?as=staff`, { waitUntil: "domcontentloaded" });
    const sf = await artifactFrame(sp);
    await sf.locator("#staffHome .sh-hi").waitFor({ state: "visible", timeout: 15000 }); // Staff Home replaces the rack grid
    await sp.waitForTimeout(400);
    const entryBody = await sf.evaluate(() => document.body.classList.contains("entry"));
    const rackTiles = await sf.locator("#staffHome .sh-rack").count();
    const syncHidden = await sf.locator("#syncBtn").isHidden();
    const gridHidden = await sf.locator("#unitsGrid").isHidden();
    check("sp: entry mode active", entryBody);
    check("sp: staff home shows rack tiles", rackTiles === 30, `(${rackTiles} racks)`);
    check("sp: sync hidden", syncHidden);
    check("sp: owner grid hidden (own screen, not manager-minus)", gridHidden);
    await sf.locator("#staffHome .sh-rack").first().click();
    await sf.locator("#rackRows .card").first().waitFor({ state: "visible", timeout: 15000 });
    await sf.locator("#rackRows .card").first().click();
    await sf.locator("#modal.open").waitFor({ state: "visible" });
    await sf.locator("#editF0").fill("SS304");
    await sf.locator("#modal .btn.primary").click();
    await sp.waitForTimeout(400);
    const stamped = await sf.evaluate(() => (window as any).state.some((u: any) => u.by === "Yard Hand"));
    check("sp: staff can log a slot (stamped with their name)", stamped);
    await sc.close();
  }

  await browser.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
