// Before/after gallery — Chassis Craft Pass slice (Section B), all SIX
// archetypes the router can generate today. ONE fixed fixture per archetype
// (no LLM anywhere), assembled ONCE; "before" is that console as-is, "after"
// is the same bytes with the chassis design layer spliced in. Identical
// <script> in every pair by construction — the only variable is the design
// system. Fixtures live in ./demo-fixtures.mts (shared with the validator
// suite). Usage: npx tsx scripts/demo-before-after.mts
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { assembleConsole } from "../src/lib/consoles/studio-v2";
import { assembleTargetBoard } from "../src/lib/consoles/target-board";
import { assemblePipeline } from "../src/lib/consoles/pipeline";
import { assembleLedger } from "../src/lib/consoles/ledger";
import { assembleTemporal } from "../src/lib/consoles/temporal";
import { assembleFleet } from "../src/lib/consoles/fleet";
import { assembleQueue } from "../src/lib/consoles/queue";
import { assembleChecklist } from "../src/lib/consoles/checklist";
import { assembleRoster } from "../src/lib/consoles/roster";
import { assembleCalendar } from "../src/lib/consoles/calendar";
import { withChassis, type ChassisArchetype } from "../src/lib/pipeline/artifact-design";
import { spatial, targetBoard, pipeline, ledger, temporal, fleet, queue, checklist, roster, calendar } from "./demo-fixtures";

type Pair = { id: ChassisArchetype; label: string; before: string; after: string };

// ---- Assemble + layer -----------------------------------------------------
const bases: { id: ChassisArchetype; label: string; before: string }[] = [
  { id: "spatial", label: "Spatial · dense grid", before: assembleConsole(spatial) },
  { id: "target-board", label: "Target Board · hero numerals", before: assembleTargetBoard(targetBoard) },
  { id: "pipeline", label: "Pipeline · lane rhythm", before: assemblePipeline(pipeline) },
  { id: "ledger", label: "Ledger · table rhythm", before: assembleLedger(ledger) },
  { id: "temporal", label: "Temporal · timeline slots", before: assembleTemporal(temporal) },
  { id: "fleet", label: "Fleet · gauge readouts", before: assembleFleet(fleet) },
  { id: "queue", label: "Queue · ticker numerals", before: assembleQueue(queue) },
  { id: "checklist", label: "Checklist · form identity", before: assembleChecklist(checklist) },
  { id: "roster", label: "Roster · pill attendance", before: assembleRoster(roster) },
  { id: "calendar", label: "Calendar · week grid", before: assembleCalendar(calendar) },
];
const pairs: Pair[] = bases.map(p => ({ ...p, after: withChassis(p.before, { dark: true, accent: "#000000", archetype: p.id }) }));

// ---- Per-pair invariants + syntax gate ------------------------------------
// Perceptibility gate: each archetype's identity must actually land. These
// markers are the high-impact at-rest overrides (numeral scale, pill gauges,
// sheen) — their absence is exactly how the v2 chassis ended up invisible.
const IDENTITY_MARKERS: Record<ChassisArchetype, string> = {
  spatial: ".unit-card { border-radius: 16px",
  "target-board": ".pod-pct { font-size: 26px",
  pipeline: ".rail-bubble { border-radius",
  ledger: ".amt { font-weight: 800",
  temporal: ".bcell, .empty { border-radius",
  fleet: ".svcbar { height: 8px",
  queue: ".now-num { font-size: 40px",
  checklist: ".ck-item { border-radius: 14px",
  roster: ".att-cell { border-radius",
  calendar: ".ev-block, .cal-cell { border-radius",
};
let failures = 0;
for (const p of pairs) {
  const tag = p.id.padEnd(13);
  if (p.before === p.after) { console.error(`FAIL ${tag}: chassis did not change the console`); failures++; continue; }
  const stripped = p.after.replace(/<style id="ops-chassis">[\s\S]*?<\/style>/, "");
  if (stripped !== p.before) { console.error(`FAIL ${tag}: delta is not exactly the chassis layer`); failures++; continue; }
  const nBefore = (p.before.match(/<script>/g) || []).length;
  const nAfter = (p.after.match(/<script>/g) || []).length;
  if (nBefore !== nAfter) { console.error(`FAIL ${tag}: script count changed`); failures++; continue; }
  if (!p.after.includes("prefers-reduced-motion")) { console.error(`FAIL ${tag}: reduced-motion handling missing`); failures++; continue; }
  if (!p.after.includes("/* chassis:v4 */")) { console.error(`FAIL ${tag}: chassis v4 sentinel missing`); failures++; continue; }
  if (!p.after.includes("font-size: 26px")) { console.error(`FAIL ${tag}: numeral scale jump missing`); failures++; continue; }
  if (!p.after.includes("border-radius: 18px")) { console.error(`FAIL ${tag}: card radius language missing`); failures++; continue; }
  if (!p.after.includes("color-mix(in srgb, var(--accent) 24%, var(--border))")) { console.error(`FAIL ${tag}: accent-tinted borders missing`); failures++; continue; }
  if (!p.after.includes(IDENTITY_MARKERS[p.id])) { console.error(`FAIL ${tag}: identity override absent (${IDENTITY_MARKERS[p.id]})`); failures++; continue; }
  const script = p.after.slice(p.after.indexOf("<script>") + 8, p.after.lastIndexOf("</script>"));
  writeFileSync("/tmp/console-syntax-check.js", script);
  try { execSync("node --check /tmp/console-syntax-check.js", { stdio: "pipe" }); }
  catch (e) { console.error(`FAIL ${tag}: syntax gate\n`, (e as { stderr?: { toString(): string } }).stderr?.toString()); failures++; continue; }
  console.log(`  PASS ${tag} (script identical ×${nBefore}, reduced-motion on, syntax OK)`);
}
if (failures) { console.error(`\n${failures} pair(s) failed — no gallery written`); process.exit(1); }

// ---- Write consoles + compare pages (fresh dir, localhost-served) ---------
const OUT = "/tmp/chassis-demo";
try { execSync(`mkdir -p ${OUT}`); } catch { /* exists */ }
for (const p of pairs) {
  writeFileSync(`${OUT}/demo-${p.id}-before.html`, p.before);
  writeFileSync(`${OUT}/demo-${p.id}-after.html`, p.after);
  // A/B flip page: the AFTER console itself + a fixed toggle that live-
  // enables/disables the chassis <style> element. Same DOM, zero iframes,
  // zero servers, works from file:// — the difference is one click away.
  writeFileSync(`${OUT}/flip-${p.id}.html`, p.after.replace("</body>",
    `<div style="position:fixed;bottom:16px;right:16px;z-index:99999"><button onclick="var s=document.getElementById('ops-chassis');s.disabled=!s.disabled;this.textContent='CHASSIS: '+(s.disabled?'OFF':'ON')" style="padding:12px 18px;border-radius:999px;border:0;background:#f59e0b;color:#0b1220;font-weight:800;font-size:13px;letter-spacing:.5px;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.5)">CHASSIS: ON</button></div></body>`));
  // Side-by-side compare: BEFORE | AFTER visible at once — no tab switching.
  writeFileSync(`${OUT}/compare-${p.id}.html`, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${p.label} — before | after</title>
<style>body{margin:0;background:#0b1220;color:#e2e8f0;font-family:ui-sans-serif,system-ui,sans-serif}header{padding:10px 16px;border-bottom:1px solid #334155;font-size:13px;font-weight:700}
header span{color:#f59e0b}.wrap{display:flex;height:calc(100vh - 41px)}.half{flex:1;display:flex;flex-direction:column;border-right:1px solid #334155}
.half b{padding:6px 12px;font-size:11px;letter-spacing:1px;color:#94a3b8}.half:first-child b{color:#64748b}iframe{border:0;flex:1;width:100%}</style></head><body>
<header>${p.label} — <span>AFTER carries chassis v4 (26px numerals, 18px cards, accent-tinted borders, pill gauges, header accent line)</span></header>
<div class="wrap"><div class="half"><b>BEFORE (current chassis)</b><iframe src="./demo-${p.id}-before.html"></iframe></div>
<div class="half"><b>AFTER (+ design layer)</b><iframe src="./demo-${p.id}-after.html"></iframe></div></div></body></html>`);
}
writeFileSync(`${OUT}/index.html`, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Chassis v3 — compare</title>
<style>body{margin:0;background:#0b1220;color:#e2e8f0;font-family:ui-sans-serif,system-ui,sans-serif;padding:28px}h1{font-size:18px;margin:0 0 4px}p.sub{margin:0 0 22px;color:#94a3b8;font-size:12.5px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;max-width:1200px}.tile{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:14px 16px}.tile h2{font-size:13.5px;margin:0 0 10px}
a.link{display:block;text-align:center;padding:10px 8px;border-radius:8px;text-decoration:none;font-weight:700;font-size:12.5px;background:#f59e0b;color:#0b1220;border:1px solid #f59e0b}a.alt{background:#0b1220;color:#94a3b8;border:1px solid #334155;margin-top:6px}</style></head><body>
<h1>Chassis v3 — side-by-side compare</h1><p class="sub">Each page shows BEFORE and AFTER simultaneously in split view.</p><div class="grid">
${pairs.map(p => `<div class="tile"><h2>${p.label}</h2><a class="link" href="./flip-${p.id}.html">OPEN A/B FLIP — one click toggles the chassis</a><a class="link alt" href="./compare-${p.id}.html">side-by-side split view</a></div>`).join("\n")}
</div></body></html>`);

console.log("\nA/B flip pages ready (no server needed):");
console.log("  open /tmp/chassis-demo/flip-fleet.html");
console.log("\nToggle the amber CHASSIS button (bottom-right) — the same page restyles live.");
process.exit(0);
