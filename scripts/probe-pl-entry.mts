// Staff-flow probe for pipeline entry mode — captures iframe console errors
// and modal state after Apply. Usage: npx tsx scripts/probe-pl-entry.mts
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const CR = process.env.PLAYWRIGHT_CHROMIUM || "/Users/danielyashwant/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "http://localhost:3000";
const WF = process.env.PL_WF || "";

const browser = await chromium.launch({ executablePath: CR, headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on("console", (msg) => { if (msg.type() === "error") console.log("PAGE-CONSOLE:", msg.text().slice(0, 160)); });
page.on("pageerror", (err) => console.log("PAGE-ERROR:", String(err).slice(0, 200)));

const res = await fetch(`${BASE}/api/workflow/${WF}`);
const tenantId = (await res.json())?.workflow?.tenantId;
const worker = "Sarah";
await ctx.addInitScript(([tid, sess]) => { try { localStorage.setItem(`staff_${tid}`, sess!); } catch {} }, [tenantId, JSON.stringify({ name: worker, role: "staff" })]);

await page.goto(`${BASE}/app/${WF}?as=staff`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 30; i++) {
  const f = page.frames().find((fr) => fr !== page.mainFrame());
  if (f && await f.evaluate(() => !!document.body).catch(() => false)) {
    await f.locator(".pcard").first().waitFor({ state: "visible", timeout: 15000 });
    console.log("cards:", await f.locator(".pcard").count(), "| entry:", await f.evaluate(() => document.body.classList.contains("entry")));
    await f.locator(".pcard").first().click();
    await f.locator("#modal.open").waitFor({ state: "visible" });
    console.log("modal open, LIFECYCLE:", await f.evaluate(() => (window as unknown as { LIFECYCLE?: unknown }).LIFECYCLE));
    await f.locator("#editF0").fill("Priority order");
    await f.locator("#modal .btn.primary").click();
    await page.waitForTimeout(600);
    console.log("after apply — modal:", await f.evaluate(() => document.getElementById("modal")!.className),
      "| err:", await f.evaluate(() => (window as unknown as { __lastErr?: string }).__lastErr || "none"));
    // Decisive: call applyEdit directly and capture any synchronous throw.
    console.log("direct applyEdit():", await f.evaluate(() => {
      try { (window as unknown as { applyEdit: () => void }).applyEdit(); return "no-throw"; }
      catch (e) { return "THREW: " + String((e as { message?: string })?.message || e) + " :: " + String((e as { stack?: string })?.stack || "").split("\n")[1]; }
    }));
    console.log("item0 title:", await f.evaluate(() => ((window as unknown as { state: { items: { t?: unknown }[] } }).state.items[0] || {}).t));
    break;
  }
  await new Promise((r) => setTimeout(r, 400));
}
await browser.close();
process.exit(0);
