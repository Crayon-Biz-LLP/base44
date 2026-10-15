import { chromium } from "playwright-core";

const CR =
  "/Users/danielyashwant/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const wf = process.env.TB_WF || process.argv[3] || "";
if (!wf) throw new Error("usage: node .chrome-proof.mjs <out.png> <workflowId>");
const out = process.argv[2] || "/tmp/chrome-proof/shot.png";

const browser = await chromium.launch({ executablePath: CR, headless: true });
const wfRes = await fetch(`http://localhost:3000/api/workflow/${wf}`);
const tenantId = (await wfRes.json())?.workflow?.tenantId;
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
if (tenantId) {
  await context.addInitScript(
    ([tid]) => { try { localStorage.setItem(`staff_${tid}`, "ChromeProof"); } catch {} },
    [tenantId]
  );
}
const page = await context.newPage();
await page.goto(`http://localhost:3000/app/${wf}`, { waitUntil: "domcontentloaded" });

// console lives in a sandboxed iframe; poll for it like the behavioral harness
let frame = null;
const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => consoleMsgs.push(`[pageerror] ${String(e).slice(0, 300)}`));
for (let i = 0; i < 30; i++) {
  frame = page.frames().find((f) => f !== page.mainFrame());
  if (frame && (await frame.evaluate(() => !!document.body).catch(() => false))) break;
  await new Promise((r) => setTimeout(r, 400));
}
if (!frame) {
  console.error("URL:", page.url());
  console.error("TITLE:", await page.title());
  console.error("FRAMES:", page.frames().length);
  console.error("BODY SNIPPET:", (await page.content()).slice(0, 600));
  console.error("CONSOLE:", consoleMsgs.slice(0, 10).join("\n"));
  throw new Error("no sandbox frame");
}
await frame.waitForSelector("#tbody tr, .cell, .pcard, .acard, #unitsGrid .card", { timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: out });

// objective chrome metrics from inside the console
const metrics = await frame.evaluate(() => {
  const el = document.querySelector("h1, b, .val, .cell");
  const f = el ? getComputedStyle(el).fontFamily : "";
  const interLoaded =
    f.toLowerCase().includes("inter") && document.fonts.check("12px Inter");
  let hoverRules = 0;
  for (const s of Array.from(document.styleSheets)) {
    try {
      for (const r of Array.from(s.cssRules)) {
        if (r.selectorText && r.selectorText.includes(":hover")) hoverRules++;
      }
    } catch {}
  }
  const all = Array.from(document.querySelectorAll("*"));
  return {
    interLoaded,
    fontFamily: f.slice(0, 60),
    svgCount: document.querySelectorAll("svg").length,
    hoverRules,
    gradients: all.filter((e) => getComputedStyle(e).backgroundImage.includes("gradient")).length,
    shadows: all.filter((e) => getComputedStyle(e).boxShadow !== "none").length,
    kpiColors: [...new Set(Array.from(document.querySelectorAll(".val")).map((e) => getComputedStyle(e).color))].length,
  };
});
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
