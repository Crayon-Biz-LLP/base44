// Step 4 E2E: publish a fresh (archetype-stamped) console → push records into
// the ledger through the real submit-form route → run the nightly digest →
// assert the WhatsApp message carries translator-derived console verdicts.
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

let failures = 0, passes = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { passes++; console.log(`  ok  ${name} ${extra}`); }
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}

const BASE = "http://localhost:3000";
const prompt = process.argv[2] || "I have 4 employees: Bhuvana, Srimathi, Shamla, and Niharshana. Every day I need them to report their actual numbers for 'New' (target 3), '10DDay' (target 20). Please build my app..";

// 1. Publish a fresh console through the real router (now stamps archetype+config).
const { generateConsoleForPrompt } = await import("../src/lib/infra/console-router");
const { db } = await import("../src/db/index");
const { tenants, workflows } = await import("../src/db/schema");
const gen = await generateConsoleForPrompt(prompt);
console.log(`published archetype: ${gen.archetype} (${gen.productName})`);

const existing = await db.select({ id: tenants.id }).from(tenants).limit(1);
const tenantId = existing[0].id;
const inserted = await db.insert(workflows).values({
  tenantId,
  primitiveType: "grid",
  config: {
    title: `${gen.productName} — Studio`,
    archetype: gen.archetype,
    archetypeConfig: gen.config,
    schema: { layout_type: "grid", rows: [], columns: [] },
    userPrompt: prompt,
    artifactHtml: gen.html,
  },
  schemaVersion: 5,
  isActive: false,
  status: "draft",
}).returning();
const wfId = inserted[0].id;
check("workflow stamped with archetype", (inserted[0].config as any)?.archetype === gen.archetype);

// 2. Build records that mirror the console's buildRecords() using real extracted keys.
const cfg = gen.config as any;
let records: Record<string, unknown>[] = [];
if (gen.archetype === "target-board") {
  const keys = cfg.metrics.map((m: any) => m.key);
  const people = cfg.people.map((p: any) => p.name);
  records = people.map((who: string, i: number) => {
    const r: Record<string, unknown> = { employee: who, report_date: new Date().toISOString().slice(0, 10) };
    keys.forEach((k: string, j: number) => { r[k] = (i + j) % 3 === 0 ? cfg.metrics[j].target : Math.max(0, cfg.metrics[j].target - 1); });
    return r;
  });
} else if (gen.archetype === "ledger") {
  records = [
    { day: 1, label: "Morning Sales", type: "Receipt", account: "Cash", amount: 6000, balance_after: 6000 },
    { day: 2, label: "Stock Purchase", type: "Payment", account: "Cash", amount: -7000, balance_after: -1000 },
  ];
} else {
  throw new Error(`no fixture path for ${gen.archetype} in this E2E`);
}
console.log(`records fixture: ${records.length} rows`);

// 3. Push through the REAL submit-form route (what __opsDeskSubmit__ does).
const sub = await fetch(`${BASE}/api/submit-form`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ workflowId: wfId, layout_type: "grid", actuals: {}, filledBy: "E2E Bridge", payload: { records } }),
});
check("submit-form accepted records", sub.ok, `${sub.status}`);
if (!sub.ok) console.log(await sub.text());

// 4. Run the nightly digest.
const dig = await fetch(`${BASE}/api/cron/digest`, { method: "POST" });
const digJson = await dig.json();
check("digest ran", dig.ok && digJson.success, `${dig.status}`);
const digest = (digJson.digests ?? []).find((d: any) => d.message?.includes("Console Verdicts"));
check("digest contains console verdicts", Boolean(digest));
if (digest) {
  const msg: string = digest.message;
  const block = msg.slice(msg.indexOf("🖥"), msg.indexOf("⚠️ *Missed"));
  console.log("\n──── WhatsApp console block ────\n" + block.trim() + "\n────────────────────────────────");
  check("verdict block names the archetype", block.includes(`(${gen.archetype})`));
  check("verdict carries translator facts", block.includes("•"));
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
process.exit(0);
