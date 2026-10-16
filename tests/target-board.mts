// Target Board tests: invariance across two organizations — same archetype +
// different nouns/people/metrics → byte-identical control flow once content
// is normalized out. Plus structural checks on assembler output.
import { assembleTargetBoard, type TargetBoardConfig } from "../src/lib/consoles/target-board";

const ORG_A: TargetBoardConfig = {
  productName: "MetricFlow Pro",
  logoText: "MF",
  tagline: "Daily team performance",
  accentHex: "#38bdf8",
  dark: true,
  people: [{ name: "Bhuvana" }, { name: "Srimathi" }, { name: "Shamla" }, { name: "Niharshana" }],
  metrics: [
    { key: "new", label: "New", target: 3 },
    { key: "dd10", label: "10DDay", target: 20 },
    { key: "dd20", label: "20Days", target: 18 },
    { key: "chronic", label: "Chronic", target: 6 },
  ],
  searchHint: "Bhuvana, New, 10DDay",
  advisory: "Report numbers before the last hour so gaps can be recovered same-day.",
};

const ORG_B: TargetBoardConfig = {
  productName: "SalesPulse",
  logoText: "SP",
  tagline: "Collections crew",
  accentHex: "#34d399",
  dark: false,
  people: [{ name: "Arun" }, { name: "Divya" }, { name: "Kiran" }],
  metrics: [
    { key: "calls", label: "Calls", target: 40 },
    { key: "visits", label: "Visits", target: 8 },
  ],
  searchHint: "Arun, Calls",
  advisory: "Log visits immediately after each meeting to keep data honest.",
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
    .replace(/var METRICS = [\s\S]*?;\n/, "")
    .replace(/var PEOPLE = [^;]+;/, "")
    .replace(/(['"])(?:\\.|[^\\])*?\1/g, "''")
    .replace(/\b\d+(\.\d+)?\b/g, "N")
    .replace(/\s+/g, "");
}

const a = assembleTargetBoard(ORG_A);
const b = assembleTargetBoard(ORG_B);

check("control flow identical across orgs", surface(a) === surface(b));

check("people verbatim in board", a.includes("Bhuvana") && a.includes("Niharshana"));
check("metrics with targets in board", a.includes('"l":"New"') && a.includes('"t":3') && a.includes('"l":"Chronic"'));
check("cell states compiled", a.includes(".cell.ok") && a.includes(".cell.short") && a.includes(".cell.dim") && a.includes(".cell.hit"));
check("team totals row computed", a.includes("TEAM"));
check("achievement KPIs compiled", a.includes("kpiAch") && a.includes("kpiOn") && a.includes("kpiWarn"));
check("modal focuses actual input", a.includes("editF0').focus()"));
check("sync emits per-employee records", a.includes("employee: n"));

check("Engine 2: hydrate on boot + autosave on edit", a.includes("PERSIST.hydrate(true)") && a.includes("PERSIST.schedule()") && a.includes("function applyLoaded(records)") && a.includes("window.__opsDeskLoad__"));
check("Engine 2: sync-state chip + shared buildRecords", a.includes('id="syncState"') && a.includes("function buildRecords()") && a.split("buildRecords()").length >= 3);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
