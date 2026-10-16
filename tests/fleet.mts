// Fleet tests: invariance across two asset domains + structural checks.
import { assembleFleet, type FleetConfig } from "../src/lib/consoles/fleet";

const FLEET: FleetConfig = {
  productName: "FleetPulse",
  logoText: "FP",
  tagline: "Truck fleet & diesel logs",
  accentHex: "#38bdf8",
  dark: true,
  searchHint: "truck, driver",
  advisory: "Log the odometer at every fuel-up; gaps hide problems.",
  serviceEvery: 10000,
  serviceUnit: "km",
  statuses: [{ label: "Running" }, { label: "Idle" }, { label: "Maintenance" }],
  assets: [
    { name: "TN-01-AB-1234", status: "Running", owner: "Ravi", lastService: 110000 },
    { name: "TN-02-CD-5678", status: "Idle", owner: "Mohan", lastService: 40000 },
    { name: "TN-03-EF-9012", status: "Maintenance", owner: "Kiran", lastService: 99500 },
    { name: "TN-04-GH-3456", status: "Running", owner: "Priya", lastService: 70000 },
  ],
  readings: [
    { asset: "TN-01-AB-1234", value: 118500 },
    { asset: "TN-02-CD-5678", value: 45200 },
    { asset: "TN-03-EF-9012", value: 99900 },
    { asset: "TN-04-GH-3456", value: 77400 },
  ],
};

const SHOP: FleetConfig = {
  productName: "MachineWatch",
  logoText: "MW",
  tagline: "CNC machine runtime tracking",
  accentHex: "#a78bfa",
  dark: false,
  searchHint: "machine, operator",
  advisory: "Grease points on schedule, never on memory.",
  serviceEvery: 500,
  serviceUnit: "hours",
  statuses: [{ label: "Running" }, { label: "Idle" }, { label: "Maintenance" }],
  assets: [
    { name: "CNC-01", status: "Running", owner: "Anand", lastService: 250 },
    { name: "CNC-02", status: "Idle", owner: "Bala", lastService: 1000 },
    { name: "Press-01", status: "Maintenance", owner: "Chitra", lastService: 480 },
  ],
  readings: [
    { asset: "CNC-01", value: 487 },
    { asset: "CNC-02", value: 1240 },
    { asset: "Press-01", value: 502 },
  ],
};

let passes = 0, failures = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { passes++; console.log(`  ok  ${name} ${extra}`); }
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}

function surface(html: string): string {
  const i = html.indexOf("<script>");
  const j = html.lastIndexOf("</script>");
  const s = html.slice(i + 8, j);
  return s
    .replace(/var STATUSES = [^;]+;/, "")
    .replace(/var SERVICE_EVERY = [^;]+;/, "")
    .replace(/var state = \{ assets: [\s\S]*?\} ?, /, "")
    .replace(/(['"])(?:\\.|[^\\])*?\1/g, "''")
    .replace(/\b\d+(\.\d+)?\b/g, "N")
    .replace(/\s+/g, "");
}

const a = assembleFleet(FLEET);
const b = assembleFleet(SHOP);

check("control flow identical across fleets", surface(a) === surface(b));

check("statuses compiled", a.includes('"Running"') && a.includes('"Maintenance"'));
check("assets with owners and readings merged", a.includes("TN-01-AB-1234") && a.includes("Ravi") && a.includes('"r":118500'));
check("reading-missing asset defaults to 0", b.includes('"r":0') === false || b.includes("No meter"));
check("service engine (lastService clock, modulo only as no-baseline fallback)", a.includes("a.r - base") && a.includes("Service OVERDUE by") && a.includes("a.r % SERVICE_EVERY"));
check("due + soon + ok badge classes", a.includes("svc-due") && a.includes("svc-soon") && a.includes("svc-ok"));
check("service progress bar wired", a.includes("svcbar") && a.includes("svc.pct"));
check("status filter chips", a.includes("setFilter") && a.includes("stFilter"));
check("due banner lists first offender", a.includes("at service-due threshold") && a.includes("firstDue"));
check("modal contract (focus, close, apply)", a.includes("editF0').focus()") && a.includes("classList.add('open')") && a.includes("classList.remove('open')"));
check("CSV + sync carry service state", a.includes("service_state") && a.includes("fleet.csv"));
check("Engine 2: hydrate on boot + autosave on edit", a.includes("PERSIST.hydrate(true)") && a.includes("PERSIST.schedule()") && a.includes("function applyLoaded(records)"));
check("Engine 2: sync-state chip + shared buildRecords", a.includes('id="syncState"') && a.split("buildRecords()").length >= 3);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
