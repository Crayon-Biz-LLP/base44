import { chromium } from "playwright-core";

const CR =
  process.env.PLAYWRIGHT_CHROMIUM ||
  "/Users/danielyashwant/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "http://localhost:3000";
const WF = "4f439d8e-c2ae-49e1-940c-f13e9aa1e139";
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

// DOM positions (td order): 1=row label, then one cell per metric column.
const CELL = { New: 2, D10Day: 3, D20Days: 4, D30Day: 5, D100Day: 6, MC: 7, Family: 8, Chronic: 9 };

const browser = await chromium.launch({ executablePath: CR, headless: true });
try {
  const context = await browser.newContext();
  await context.addInitScript(
    ([tid, name]) => {
      try {
        localStorage.setItem(`staff_${tid}`, name);
      } catch {}
    },
    [T_DEMO, "Bhuvana"]
  );
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  console.log("--- Daily Performance Tracker (grid, personal) as Bhuvana ---");

  await page.goto(`${BASE}/submit/${WF}`, { waitUntil: "domcontentloaded" });
  await page.locator("table").waitFor({ state: "visible" });

  // personal mode: only the employee's own row
  const rowCount = await page.locator("tbody tr").count();
  check("personal mode: exactly one row (their own)", rowCount === 1, `(rows=${rowCount})`);
  const rowText = await page.locator("tbody tr").first().innerText();
  check("the visible row is the employee's own (Bhuvana)", /Bhuvana/i.test(rowText));
  check("other employees are hidden", !/Shamla|Srimathi|Niharshana/i.test(rowText));

  // 8 metric columns with targets (rendered as "NEW 🎯 3", "10DDAY 🎯 20", ...)
  const headers = (await page.locator("thead th").allInnerTexts()).join("\n").toUpperCase();
  const metricTargets: Array<[string, number]> = [
    ["New", 3], ["10DDay", 20], ["20Days", 18], ["30DDay", 10],
    ["100DDay", 10], ["MC", 20], ["Family", 20], ["Chronic", 6],
  ];
  for (const [label, target] of metricTargets) {
    check(`column header ${label} (target ${target})`, headers.includes(label.toUpperCase()) && headers.includes(`🎯 ${target}`));
  }

  // per-cell chips: MC (target 20) renders +5/+10/+20 and tap fills its own cell
  await page.locator(`tbody tr td:nth-of-type(${CELL.MC}) button[type="button"]`).filter({ hasText: "+20" }).first().click();
  const mcVal = await page.locator(`tbody tr td:nth-of-type(${CELL.MC}) input[type="number"]`).inputValue();
  check("tapping +20 fills that metric's own cell", mcVal === "20", `(MC=${mcVal})`);

  // New + Chronic via keyboard (empire below/above target is allowed)
  await page.locator(`tbody tr td:nth-of-type(${CELL.New}) input[type="number"]`).fill("4");
  await page.locator(`tbody tr td:nth-of-type(${CELL.Chronic}) input[type="number"]`).fill("5");

  await page.getByRole("button", { name: /Review & Continue/i }).click();
  await page.getByRole("button", { name: /Submit|Confirm/i }).first().click();
  await page.getByText("Submitted", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  check("employee submission -> honest host success screen", true);

  await context.close();
} finally {
  await browser.close();
}

console.log(`\nPassed: ${passes} | Failed: ${failures}`);
process.exit(failures > 0 ? 1 : 0);