// Emission gate: assemble every archetype console from a fixture config and
// node --check the emitted <script> block. Catches template-level JS errors
// that tsc cannot see. Lifecycle ops made this gate mandatory.
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { assemblePipeline } from "../src/lib/infra/pipeline";
import { assembleLedger } from "../src/lib/infra/ledger";
import { assembleTemporal } from "../src/lib/infra/temporal";
import { assembleFleet } from "../src/lib/infra/fleet";
import { assembleTargetBoard } from "../src/lib/infra/target-board";
import { assembleConsole } from "../src/lib/infra/studio-v2";

let failures = 0, passes = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { passes++; console.log(`  ok  ${name} ${extra}`); }
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}
function scriptOf(html: string): string {
  const start = html.indexOf("<script>") + 8;
  return html.slice(start, html.lastIndexOf("</script>"));
}
function gate(name: string, html: string) {
  writeFileSync("/tmp/console-emission-check.js", scriptOf(html));
  try { execSync("node --check /tmp/console-emission-check.js", { stdio: "pipe" }); check(name, true); }
  catch (e: any) { check(name, false, (e.stderr?.toString() ?? String(e)).slice(0, 300)); }
}

gate("pipeline emits valid JS", assemblePipeline({
  productName: "JobFlow", logoText: "JF", tagline: "t", accentHex: "#38bdf8", dark: true, slaDays: 5,
  stages: [{ label: "Received" }, { label: "Diagnosis" }, { label: "Repair" }, { label: "Delivered" }],
  items: [{ title: "Bike A", stageIdx: 1, owner: "Ravi" }, { title: "Bike B", stageIdx: 0, owner: "" }],
  searchHint: "search", advisory: "tip",
} as any));

gate("ledger emits valid JS", assembleLedger({
  productName: "ShopLedger", logoText: "SL", tagline: "t", accentHex: "#34d399", dark: true,
  searchHint: "search", advisory: "tip",
  openingBalance: 1000, lowBalanceThreshold: 2500,
  accounts: [{ name: "Cash" }],
  entryTypes: [{ label: "Receipt", sign: "in" }, { label: "Payment", sign: "out" }],
  entries: [
    { label: "Morning Sales", amount: 800, type: "Receipt" },
    { label: "Tea", amount: 50, type: "Payment" },
    { label: "Wholesale", amount: 1200, type: "Receipt" },
    { label: "Transport", amount: 200, type: "Payment" },
  ],
} as any));

gate("temporal emits valid JS", assembleTemporal({
  productName: "DentFlow", logoText: "DF", tagline: "t", accentHex: "#38bdf8", dark: true,
  searchHint: "search", advisory: "tip",
  resources: [{ name: "Chair 1" }, { name: "Chair 2" }],
  slots: [
    { purpose: "Cleaning", resource: "Chair 1" },
    { purpose: "Filling", resource: "Chair 1" },
    { purpose: "Extraction", resource: "Chair 2" },
    { purpose: "Checkup", resource: "Chair 2" },
  ],
} as any));

gate("fleet emits valid JS", assembleFleet({
  productName: "FleetPulse", logoText: "FP", tagline: "t", accentHex: "#f97316", dark: true,
  searchHint: "search", advisory: "tip",
  serviceEvery: 15000,
  statuses: [{ label: "On Road" }, { label: "Idle" }, { label: "In Workshop" }],
  assets: [
    { name: "Truck-001", status: "On Road", owner: "Ravi" },
    { name: "Truck-002", status: "Idle", owner: "Sam" },
    { name: "Truck-003", status: "On Road", owner: "Ash" },
  ],
  readings: [{ asset: "Truck-001", value: 15400 }, { asset: "Truck-002", value: 9000 }],
  logs: [{ asset: "Truck-001", label: "Trip to Erode", delta: 320 }],
} as any));

gate("target-board emits valid JS", assembleTargetBoard({
  productName: "MetricPulse", logoText: "MP", tagline: "t", accentHex: "#38bdf8", dark: true,
  people: [{ name: "Bhuvana" }, { name: "Srimathi" }],
  metrics: [{ key: "new", label: "New", target: 3 }],
  searchHint: "search", advisory: "tip",
} as any));

gate("spatial emits valid JS", assembleConsole({
  productName: "LaserRack", logoText: "LR", tagline: "t", accentHex: "#38bdf8", dark: true,
  countLabel: "Row", groupLabel: "Rack", unitsPerGroup: 4, groupCount: 3,
  field1: { key: "material", label: "Material", type: "text" },
  field2: { key: "grade", label: "Grade", type: "text" },
  field3: { key: "thickness", label: "Thickness", type: "number" },
  qtyField: { key: "sheets", label: "sheets" },
  categories: [
    { id: "ss", label: "Stainless", colorHex: "#38bdf8", match: "SS" },
    { id: "ms", label: "Mild Steel", colorHex: "#f97316", match: "MS" },
  ],
  searchHint: "SS304, 3mm, Rack 12", advisory: "Heavy plates low, light sheets high.",
  densityMap: [{ match: "SS", d: 8.0 }, { match: "MS", d: 7.85 }],
  features: { tonnage: true },
  audit: { thresholdTons: 3.5 },
  balanceBadge: true,
} as any));

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
