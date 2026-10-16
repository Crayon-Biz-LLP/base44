// Temporal tests: invariance across two scheduling domains + structural checks.
import { assembleTemporal, type TemporalConfig } from "../src/lib/consoles/temporal";

const CLINIC: TemporalConfig = {
  productName: "ChairFlow",
  logoText: "CF",
  tagline: "Dental chair scheduling",
  accentHex: "#38bdf8",
  dark: true,
  searchHint: "patient, treatment",
  advisory: "Leave a 10-minute turnaround buffer between chairs.",
  resources: [{ name: "Chair 1" }, { name: "Chair 2" }, { name: "Chair 3" }],
  slots: [
    { purpose: "Ravi — scaling", resource: "Chair 1" },
    { purpose: "Meena — filling", resource: "Chair 2" },
    { purpose: "Arun — extraction", resource: "Chair 1" },
    { purpose: "Priya — checkup", resource: "Chair 3" },
    { purpose: "Kiran — root canal", resource: "Chair 2" },
    { purpose: "Divya — braces", resource: "Chair 3" },
  ],
};

const DOCK: TemporalConfig = {
  productName: "DockWise",
  logoText: "DW",
  tagline: "Freight dock scheduling",
  accentHex: "#fbbf24",
  dark: false,
  searchHint: "truck, load",
  advisory: "Never book two heavy loads on the same dock without a 30-minute gap.",
  resources: [{ name: "Dock A" }, { name: "Dock B" }],
  slots: [
    { purpose: "Tata 407 — unload", resource: "Dock A" },
    { purpose: "Eicher — load", resource: "Dock B" },
    { purpose: "Container — unload", resource: "Dock A" },
    { purpose: "Tempo — parcel load", resource: "Dock B" },
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
    .replace(/var RESOURCES = [^;]+;/, "")
    .replace(/var SLOTS = [^;]+;/, "")
    .replace(/var state = \{ bookings: [\s\S]*?\} ?, /, "")
    .replace(/(['"])(?:\\.|[^\\])*?\1/g, "''")
    .replace(/\b\d+(\.\d+)?\b/g, "N")
    .replace(/\s+/g, "");
}

const a = assembleTemporal(CLINIC);
const b = assembleTemporal(DOCK);

check("control flow identical across schedules", surface(a) === surface(b));

check("resources verbatim", a.includes('"Chair 1"') && a.includes('"Chair 3"') && a.includes("Chair 2"));
check("bookings compiled with purposes", a.includes("Ravi — scaling") && a.includes("root canal"));
check("utilization KPI wired", a.includes("kpiUtil") && a.includes("/ total * 100"));
check("conflict detection wired", a.includes("conflictKeys") && a.includes("double-booked"));
check("collision banner gated on conflicts", a.includes("classList.toggle('open', conflicts > 0)"));
check("empty slots are clickable (+)", a.includes('.empty') && a.includes("data-ri") && a.includes("data-si"));
check("modal contract (focus, close, apply)", a.includes("editF0').focus()") && a.includes("classList.add('open')") && a.includes("classList.remove('open')"));
check("spotlight dim/hit on cells", a.includes(".bcell.dim") && a.includes(".bcell.hit"));
check("CSV + sync carry slot/resource/purpose", a.includes("purpose") && a.includes("schedule.csv"));
check("single-resource schedule still renders grid", b.includes("Dock A") && b.includes("Dock B"));

check("Engine 2: hydrate on boot + autosave on edit", a.includes("PERSIST.hydrate()") && a.includes("PERSIST.schedule()") && a.includes("function applyLoaded(records)"));
check("Engine 2: sync-state chip + shared buildRecords", a.includes('id="syncState"') && a.split("buildRecords()").length >= 3);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
