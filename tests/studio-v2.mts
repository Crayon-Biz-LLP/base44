// V2 thesis test: the model only picks nouns/colors (config); the console is
// assembled deterministically from one template. Therefore ANY two configs —
// even from different industries — must produce consoles with IDENTICAL
// behavioral surface: same modal mechanics, same view switching, same boot
// order, same sync contract. Content varies; control flow cannot.
import { assembleConsole, type ConsoleConfig } from "../src/lib/consoles/studio-v2";
import { RACKS, KITCHEN } from "./fixtures/console-configs";

let passes = 0, failures = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { passes++; console.log(`  ok  ${name} ${extra}`); }
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}

// Strip string literals + number literals + whitespace → pure control flow.
// The CFG line is EXCLUDED deliberately: it is the content/config boundary —
// the thesis is that everything EXCEPT config is identical across consoles.
function behavioralSurface(html: string): string {
  const i = html.indexOf("<script>");
  const j = html.lastIndexOf("</script>");
  const script = i >= 0 && j > i ? html.slice(i + 8, j) : "";
  return script
    .replace(/var CFG = \{[\s\S]*?\};/, "")
    .replace(/(['"])(?:\\.|[^\\])*?\1/g, "''")
    .replace(/\b\d+(\.\d+)?\b/g, "N")
    .replace(/\s+/g, "");
}

const a = assembleConsole(RACKS);
const b = assembleConsole(KITCHEN);
// V3: control flow is a pure function of (content, FEATURE SET).
// Same features + different nouns → byte-identical flow.
const RACKS2: ConsoleConfig = {
  ...RACKS,
  productName: "SteelYard",
  logoText: "SY",
  accentHex: "#f97316",
  groupCount: 20,
  unitsPerGroup: 6,
  categories: RACKS.categories.slice(0, 3),
  searchHint: "MS, 5mm, Yard 7",
  tagline: "Steel yard storage",
};
const a2 = assembleConsole(RACKS2);

// ── 1. THE INVARIANCE: identical control flow across same feature set
check(
  "control flow identical across same feature set (racks vs steelyard)",
  behavioralSurface(a) === behavioralSurface(a2),
);
// Feature gating: the featureless kitchen must lack every intelligence wire.
check(
  "intelligence gated off cleanly (kitchen)",
  !b.includes('id="kpiTonnage"') &&
    !b.includes("if (ab){ var hits = computeAudit();") &&
    !b.includes("tons +="),
);
check(
  "intelligence wired when enabled (racks)",
  a.includes('id="kpiTonnage"') &&
    a.includes("if (ab){ var hits = computeAudit();") &&
    a.includes("tons +="),
);

// ── 2. Modal mechanics: exactly one mechanism, symmetric open/close (the V1 bug class)
for (const [name, html] of [["racks", a], ["kitchen", b]] as const) {
  check(`${name}: modal opens via class only`, /getElementById\('modal'\)\.classList\.add\('open'\)/.test(html));
  check(`${name}: modal closes symmetrically`, /getElementById\('modal'\)\.classList\.remove\('open'\)/.test(html));
  check(`${name}: no hidden-attr/style modal toggling`, !/modal['\)]\s*\.hidden/.test(html) && !/modal.{0,40}style\.display/.test(html));
  check(`${name}: backdrop click closes modal`, /if\(event\.target===this\)closeModal\(\)/.test(html));

  // ── 3. Views are exclusive (map/detail/list can't stack)
  check(`${name}: view switch is exclusive`, /getElementById\('mapView'\)\.hidden\s*=\s*v\s*!==\s*'map'/.test(html));

  // ── 4. Boot order: restore-or-seed, then render
  const s = behavioralSurface(html);
  check(`${name}: boot restores or seeds then renders`, /loadLocal\(\);if\(s&&s\.length\)state=s;elseseedDemo\(\);render\(\);/.test(s));

  // ── 5. Every config field is bound into edits + sync records
  check(`${name}: all 3 fields bound (edit/fill/apply/sync)`, (html.match(/\['v'\s*\+\s*i\]/g) || []).length >= 3);

  // ── 6. Decimal keyboard exactly when a numeric field exists
  check(`${name}: inputmode matches config`, html.includes('inputmode="decimal"') === ([RACKS, KITCHEN].find(c => html.includes(c.productName))!.field3.type === "number"));
}

// ── 7. Content actually adapts (sanity: config mattered, template didn't)
check("branding adapts per config", a.includes(RACKS.productName) && b.includes(KITCHEN.productName) && !a.includes(KITCHEN.productName));
check("geometry adapts per config", /groups:30,per:8/.test(a) && /groups:12,per:4/.test(b));
check("theme adapts per config", a.includes("#0f172a") && b.includes("#f8fafc"));
check("cross-section slivers present (Gemini critique #1)", (a.match(/class="tier/g) || []).length > 0 || /class="tier/.test(a));
check("status badges present (critique #3)", /badge full/.test(a) && /badge part/.test(a));

// ── V3 intelligence: compile-time feature resolution
check("tonnage KPI emitted for racks", a.includes('id="kpiTonnage"'));
check("audit scanner + banner emitted for racks", a.includes("function computeAudit") && a.includes('id="auditBanner"'));
check("balance badge guard compiles per feature", a.includes("if (!true) return '';") && b.includes("if (!false) return '';"));
check("weight engine + density lookup emitted", a.includes("function weightOf") && a.includes("function densOf"));

// ── V3.1 gating: weight semantics must NEVER leak into non-weight domains
check("weight display gated off for featureless console", !b.includes("T total") && !b.includes("⚠ HIGH") && !b.includes("loadbar"));
check("weight display present for metal console", a.includes("T total") && a.includes("⚠ HIGH"));
check("Engine 2: hydrate on boot + autosave on edit", a.includes("PERSIST.hydrate()") && a.includes("PERSIST.schedule()") && a.includes("function applyLoaded(records)"));
check("Engine 2: sync-state chip + shared buildRecords", a.includes('id="syncState"') && a.split("buildRecords()").length >= 3);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
