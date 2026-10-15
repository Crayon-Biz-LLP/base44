import { chromium, type Frame, type Page } from "playwright-core";

const CR =
  "/Users/danielyashwant/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "http://localhost:3000";
const T_SALES = "68694f04-2be0-477e-a145-695e0adef927";
const T_DEMO = "f0df4a1e-52dd-4327-8b43-1c3ec7925f99";

let failures = 0;
let passes = 0;

function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    passes++;
    console.log(`  ok  ${name} ${extra}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
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

async function main() {
  console.log("=== E2E V5 (headless Chromium, UI click-through) ===");
  const browser = await chromium.launch({ executablePath: CR, headless: true });
  try {
    // ---- 1. List + HERO workflow: artifact-first default, bidirectional
    //      switch, native hero submission ----
    {
      const context = await browser.newContext();
      await context.addInitScript(
        ([tid, sname]) => {
          try {
            localStorage.setItem(`staff_${tid}`, sname);
          } catch {}
        },
        [T_SALES, "E2E Tester"]
      );
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      console.log("--- Daily Sales Entry (list, hero) — artifact + native switch ---");
      await page.goto(`${BASE}/submit/c26e5625-750f-4554-9a29-74f0c878c013`, { waitUntil: "domcontentloaded" });

      const iframeEl = page.locator("iframe").first();
      await iframeEl.waitFor({ state: "attached" });
      const artifact = await artifactFrame(page);
      await artifact.locator('input[type="date"]').waitFor({ state: "visible" });
      check("regenerated artifact (quick form) is the default surface", true);
      check("artifact number input earns inputmode=decimal (backfill/prompt)", (await artifact.evaluate(() => document.querySelector('input[type="number"]')?.getAttribute("inputmode"))) === "decimal");

      // 1a. artifact -> native
      await page.getByRole("button", { name: /Use the typed form instead/i }).click();
      await page.locator('input[inputmode="decimal"]').waitFor({ state: "visible" });
      check("native hero form is reachable from the artifact (Fix #1)", true);

      // 1b. native -> artifact
      await page.getByRole("button", { name: /Use the quick form/i }).click();
      await iframeEl.waitFor({ state: "attached" });
      await artifactFrame(page);
      check("artifact is reachable back from native (Fix #1 bidirectional)", true);

      // 1c. native submission end-to-end (newly reachable path)
      await page.getByRole("button", { name: /Use the typed form instead/i }).click();
      await page.locator('input[inputmode="decimal"]').waitFor({ state: "visible" });
      await page.locator('input[type="date"]').fill("2026-09-18");
      await page.locator('input[inputmode="decimal"]').fill("12500");
      await page.locator("textarea").fill("e2e native list via fix #1");
      await page.getByRole("button", { name: /Review & Continue/i }).click();
      await page.getByRole("button", { name: /Submit|Confirm|Save/i }).first().click();
      await page.getByText("Submitted", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      check("native hero submission -> honest host success screen", true);
      await context.close();
    }

    // ---- 2. Grid workflow: artifact matrix + tappable row chips (Fix #2) ----
    {
      const ctx2 = await browser.newContext();
      await ctx2.addInitScript(
        ([tid]) => {
          try {
            localStorage.setItem(`staff_${tid}`, "Ramesh");
          } catch {}
        },
        [T_DEMO]
      );
      const p2 = await ctx2.newPage();
      p2.setDefaultTimeout(30000);
      console.log("--- Staff Daily Sales Target Monitoring (grid) — chips + artifact ---");
      await p2.goto(`${BASE}/submit/9a0a071f-ebe9-43c0-861d-048ef0b0da58`, { waitUntil: "domcontentloaded" });

      const el2 = p2.locator("iframe").first();
      await el2.waitFor({ state: "attached" });
      const art2 = await artifactFrame(p2);
      const tableText = await art2.evaluate(() => document.body?.innerText || "").catch(() => "");
      check("grid artifact renders staff-target matrix", /ramesh|Ramesh/i.test(tableText));
      const submitBtn = await art2.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /submit|save/i.test(x.textContent || ""));
        return b ? b.textContent?.trim().slice(0, 50) : null;
      });
      check("grid artifact has a submit control", !!submitBtn, `(${submitBtn})`);

      // native mode: row chips are tappable and fill the leading capture column
      await p2.getByRole("button", { name: /Use the typed form instead/i }).click();
      const rameshRow = p2.locator("tr", { hasText: "Ramesh" });
      await rameshRow.getByRole("button", { name: "+20" }).waitFor({ state: "visible" });
      check("row quickChips render as tappable pills in the Target cell (Fix #2)", true);
      await rameshRow.getByRole("button", { name: "+20" }).click();
      const morningVal = await rameshRow.locator('input[type="number"]').first().inputValue();
      check("tapping a row chip fills the row's leading capture column", morningVal === "20", `(Morning Units=${morningVal})`);
      await ctx2.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\nPassed: ${passes} | Failed: ${failures}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E crashed:", e.message);
  process.exit(1);
});