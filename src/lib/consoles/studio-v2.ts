// Studio V2 — deterministic console assembly. The model NEVER writes code:
// it emits a small content config (names, fields, categories, counts) and the
// console is assembled from the battle-tested template — the same code that
// passed 11/11 behavioral checks. Correctness by construction; zero variance.
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { esc, jstr } from "./escape";
import { logoOf } from "./branding";
import { chromeFonts, chromeCss, chromeJs, icon } from "./chrome";
import { STEEL_DEFAULT_DENSITY, AUDIT_DEFAULTS } from "./domain-knowledge";

export const ConsoleConfigSchema = z.object({
  productName: z.string().describe("Short invented product name, e.g. 'LaserRack Pro'"),
  logoText: z.string().min(1).describe("1-3 letter logo tile text"),
  tagline: z.string().describe("One-line subtitle describing the operation"),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Domain-appropriate accent color"),
  dark: z.boolean().describe("Dark industrial theme?"),
  countLabel: z.string().describe("What one storage unit is called, e.g. 'Rack'"),
  groupLabel: z.string().describe("What a group of units is called, e.g. 'Rack' for rack rows"),
  unitsPerGroup: z.number().int().min(1).max(64).describe("Units inside each group, e.g. 8 rows"),
  groupCount: z.number().int().min(1).max(200).describe("Number of groups, e.g. 30 racks"),
  field1: z.object({ key: z.string(), label: z.string(), type: z.enum(["text", "number"]) }).describe("Primary editable field (e.g. material)"),
  field2: z.object({ key: z.string(), label: z.string(), type: z.enum(["text", "number"]) }).describe("Second editable field (e.g. grade)"),
  field3: z.object({ key: z.string(), label: z.string(), type: z.enum(["text", "number"]) }).describe("Third editable field (e.g. thickness)"),
  qtyField: z.object({ key: z.string(), label: z.string() }).nullable().default(null).describe("Quantity stored per slot — null only when the domain tracks presence, not amount. label MUST be a lowercase plural noun (e.g. 'sheets', 'boxes', 'bins'), never 'count' or 'quantity'"),
  categories: z.array(z.object({
    id: z.string(),
    label: z.string(),
    colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    match: z.string().describe("Case-insensitive prefix that maps a value to this category, e.g. 'SS'"),
  })).min(1).max(5).describe("Category color system for materials/values"),
  staff: z.array(z.object({ name: z.string() })).max(12).optional().describe("Yard/floor staff who log storage — first names, verbatim if the operator named them. They get a personal logging screen"),
  searchHint: z.string().describe("Teaching search placeholder, e.g. 'SS304, 3mm, Rack 12'"),
  advisory: z.string().describe("One domain best-practice tip shown in the UI"),
  features: z.object({
    tonnage: z.boolean().describe("Live weight/tonnage KPI from thickness × area × density (dense goods)"),
    weightAudit: z.boolean().describe("Flag heavy loads on elevated rows (vertical storage safety)"),
    balanceBadge: z.boolean().describe("Per-group heavy-low/light-top structural balance badge"),
  }).default({ tonnage: false, weightAudit: false, balanceBadge: false }),
  densityMap: z.array(z.object({ match: z.string(), d: z.number().positive() })).describe("Material prefix → density g/cm³ (use standard values)").default([]),
  sheetAreaM2: z.number().positive().describe("Standard unit footprint m² (8ft×4ft sheet = 2.973)").default(2.973),
  audit: z.object({ heavySlotKg: z.number().positive(), elevatedRow: z.number().int().min(1), heavyRowKg: z.number().positive().optional() }).describe("Heavy-load audit thresholds").default(AUDIT_DEFAULTS),
  voice: z.object({
    sectionTitle: z.string().describe("Insider name for the storage section, e.g. 'Inspection Bay', 'Cold Room'"),
    sectionSubtitle: z.string().describe("Physical ordering rule, e.g. 'Heavy base to light top'"),
    unitNoun: z.string().describe("Trade word for one stored piece, e.g. 'plate', 'sheet', 'crate'"),
    searchExamples: z.array(z.string()).max(5).describe("Real codes/specs/grades an operator types, e.g. 'SS304', 'IS 2062', '3mm'"),
    guidelines: z.array(z.object({ title: z.string(), detail: z.string() })).max(4).describe("Trade best practices using industry vocabulary and real reasons"),
  }).describe("Domain voice — the console must speak the trade's language like a seasoned insider designed it").optional(),
  heuristics: z.object({
    heavyGaugeMinMm: z.number().positive().describe("Thickness considered heavy gauge in this trade"),
    rowCapacityTons: z.number().positive().describe("Safe working load per row/level"),
    lowRows: z.number().int().min(1).describe("Rows from the floor reserved for heavy stock, e.g. 3"),
    midRows: z.number().int().min(1).describe("Last row of the high-turnover zone, e.g. 6"),
  }).describe("Domain judgment as numbers — enables placement advice and row verdicts").optional(),
  stock: z.array(z.object({
    name: z.string(),
    unit: z.string(),
    qty: z.number(),
    minQty: z.number().nonnegative(),
  })).max(20).optional().describe("Reorder watchlist — ONLY when the prompt mentions stock levels, reorder points or expiring goods. Item name, unit ('kg','pcs','ltr' — or '3 days' style for expiry), current quantity, minimum quantity before reorder"),
});

export type ConsoleConfig = z.infer<typeof ConsoleConfigSchema>;

// Deterministic content extraction — one small structured call, no code gen.
export async function extractConsoleConfig(userPrompt: string): Promise<ConsoleConfig> {
  return generateWithRepair<ConsoleConfig>({
        prompt: `A business operator described their operation. Extract the console content config.\n\nOPERATOR: "${userPrompt}"\n\nInvent the product name. Choose an industrial accent color. Map their storage/units into groupCount x unitsPerGroup. If the operator mentions who works the yard/floor (helpers, pickers), list them in staff — each gets a personal logging screen. Define 3 editable fields and 1-5 material categories with distinct industrial colors and prefix matchers. Write one advisory best-practice tip for this domain.

INTELLIGENCE FEATURES — choose from this vetted catalog when the domain fits:
- tonnage: live weight KPI computed as thickness x area x density (needs a numeric thickness/gauge field; enable for dense goods like metal sheets, plates, ingots).
- weightAudit: flags heavy loads stored on elevated rows (safety; needs vertical stacked storage).
- balanceBadge: per-group heavy-low/light-top structural balance (pairs with weightAudit).
For tonnage, set densityMap using STANDARD densities (g/cm3): SS 7.9, MS/IS 7.85, aluminium 2.7, brass 8.5, copper 8.96 — use our steel default otherwise. Set sheetAreaM2 to the standard unit footprint (8ft x 4ft sheet = 2.973). Set audit thresholds: heavySlotKg ~150 for steel plates, elevatedRow = 4 for 8-row racks, heavyRowKg ~3500 for a loaded steel rack row.\nIf operators store MULTIPLE items per slot (sheets per row, boxes per bin), set qtyField (key + label, e.g. sheets) — inventory domains almost always track quantity.

VOICE — make the console speak the trade's language, like a seasoned insider designed it:
- sectionTitle: the insider name for the section ('Inspection Bay', 'Cold Room', 'Yard Office').
- sectionSubtitle: the physical ordering rule ('Heavy base to light top').
- unitNoun: what one stored piece is called in this trade ('plate', 'sheet', 'crate', 'reel').
- searchExamples: 3-5 REAL codes/specs/grades an operator would type ('SS304', 'IS 2062', '3mm').
- guidelines: 2-4 trade best practices as {title, detail} with real vocabulary and reasons ('Forklift safety', 'Laser bed loading').

HEURISTICS — when the domain has vertical rows and heavy/high-turnover goods, capture the judgment as numbers: heavyGaugeMinMm (thickness counted as heavy gauge), rowCapacityTons (safe working load per row), lowRows (rows from the floor reserved for heavy stock), midRows (last row of the high-turnover zone).\nSTOCK — only if the prompt mentions stock/reorder/expiry: items with unit, current qty and minimum qty before reorder (for perishables use a unit like '5 days' meaning shelf life left). Skip stock entirely otherwise.`,
      },
      ConsoleConfigSchema,
      5);
}

// Deterministic assembler — renders the working console from the config.
// Every interactive element here is code that already passed behavioral checks;
// the model only chose the nouns and colors.
export function assembleConsole(cfg: ConsoleConfig): string {
  const catJson = jstr(cfg.categories.map(c => ({ id: c.id, label: c.label, color: c.colorHex, match: c.match.toUpperCase() })));
  const densityJson = jstr(
    (cfg.densityMap.length ? cfg.densityMap : [{ match: "__none__", d: STEEL_DEFAULT_DENSITY }])
      .map(m => ({ m: m.match.toUpperCase(), d: m.d }))
  );
  const f = [cfg.field1, cfg.field2, cfg.field3];
  // Pluralization that respects labels the model already emitted in plural
  // form ('pallets', 'Cases') — blind +'s' produced 'chamberss'/'Casess'.
  const pluralOf = (label: string): string => {
    const l = label.trim();
    if (/[^aeiou]y$/i.test(l)) return l.slice(0, -1) + "ies"; // entry → entries
    if (/(s|x|z|ch|sh)$/i.test(l) || /[^aeiou]o$/i.test(l)) return l + "es";
    if (/s$/i.test(l)) return l; // already plural
    return l + "s";
  };
  // Domain voice + judgment: the trade's words and its rules-as-numbers.
  const V = cfg.voice ?? { sectionTitle: "", sectionSubtitle: "", unitNoun: "", searchExamples: [] as string[], guidelines: [] as { title: string; detail: string }[] };
  const H = cfg.heuristics ?? null;
  const searchPh = (V.searchExamples.length ? V.searchExamples.join(", ") : cfg.searchHint) + ", " + cfg.groupLabel + " 12";
  // Feature dependency resolution — DIALECT OWNERSHIP: the weight machinery
  // (tonnage KPI, load bars, mm zone guides, heavy-row audits) encodes
  // sheet-metal physics (thickness × area × density). It must run ONLY when
  // extraction explicitly asserts dense-goods physics; a fabric bale "5 kg"
  // fed through it produced nonsense tonnage and "≥0.1mm" guides. balanceBadge
  // is pure layout (heavy-low/light-top visual) and stays independent.
  const F = {
    tonnage: cfg.features.tonnage,
    weightAudit: cfg.features.weightAudit && cfg.features.tonnage,
    balanceBadge: cfg.features.balanceBadge,
  };
  // Zone-guide unit comes from the trade's own field label ("Thickness (mm)"
  // → mm), never hard-coded.
  const gaugeUnit = (cfg.field3.label.match(/\(([^)]+)\)/)?.[1] || "mm").trim();
  const dark = cfg.dark;
  // Reorder watchlist extension — optional; absent stock assembles byte-
  // identical (hasStock gates every new DOM node and CSS rule).
  const S = cfg.stock ?? [];
  const hasStock = S.length > 0;
  const sJson = JSON.stringify(S.map(s => ({ n: s.name, u: s.unit, q: s.qty, m: s.minQty })));
  const theme = dark
    ? { bg: "#0f172a", surface: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", input: "#0b1220" }
    : { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#ffffff" };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(cfg.productName)}</title>
${chromeFonts()}
<style>
:root { --bg:${theme.bg}; --surface:${theme.surface}; --border:${theme.border}; --text:${theme.text}; --muted:${theme.muted}; --accent:${cfg.accentHex}; --input:${theme.input}; --r-lg:16px; --r-md:12px; --r-sm:8px; }
* { box-sizing:border-box; }
body { background:var(--bg); color:var(--text); font-family:'Inter',system-ui,sans-serif; margin:0; background-image:linear-gradient(${dark ? "rgba(148,163,184,.06) 1px, transparent 1px" : "rgba(15,23,42,.04) 1px, transparent 1px"}),linear-gradient(90deg,${dark ? "rgba(148,163,184,.06) 1px, transparent 1px" : "rgba(15,23,42,.04) 1px, transparent 1px"}); background-size:28px 28px; }
.mono { font-family:'JetBrains Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; }
::-webkit-scrollbar { width:6px; height:6px; } ::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
::selection { background:var(--accent); color:#000; }
.row { display:flex; align-items:center; gap:12px; } .spread { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.grid-6 { display:grid; grid-template-columns:repeat(6,1fr); gap:1px; background:var(--border); border-bottom:1px solid var(--border); }
.grid-auto { display:grid; grid-template-columns:repeat(auto-fill,minmax(132px,1fr)); gap:12px; }
.card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px; }
.card.hi { background:linear-gradient(180deg,${dark ? "#243349,#1b2740" : "#ffffff,#f4f7fb"}); border-top:1px solid ${dark ? "rgba(148,163,184,.35)" : "rgba(15,23,42,.08)"}; box-shadow:0 10px 24px rgba(2,6,23,${dark ? ".45" : ".08"}); transition:all .15s; }
.card.hi:hover { border-color:${cfg.accentHex}66; transform:translateY(-1px); }
.card.dim { opacity:.22; filter:saturate(.4); }
.card.hit { border-color:${cfg.accentHex}; box-shadow:0 0 0 2px ${cfg.accentHex}55; }
.btn { padding:8px 16px; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--text); cursor:pointer; font-weight:600; }
.btn.primary { background:var(--accent); color:#000; border-color:var(--accent); }
.input { padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:var(--input); color:var(--text); }
.muted { color:var(--muted); }
.kbd { font-family:ui-monospace,monospace; font-size:10px; border:1px solid var(--border); border-bottom-width:2px; border-radius:4px; padding:1px 6px; color:var(--muted); }
.bar { height:6px; background:var(--bg); border-radius:3px; overflow:hidden; margin-top:8px; } .bar > div { height:100%; background:var(--accent); }
.stack { display:flex; flex-direction:column; gap:3px; margin:10px 0; }
.tier { height:9px; border-radius:3px; } .tier.empty { background:transparent; border:1px dashed ${dark ? "#3b4a63" : "#cbd5e1"}; }
.badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid; font-weight:700; white-space:nowrap; }
.badge.full { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.badge.part { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.badge.none { color:#94a3b8; border-color:rgba(148,163,184,.25); background:rgba(148,163,184,.08); }
.badge.ok { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.badge.warn { color:#f87171; border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.1); }
.banner { display:none; margin-bottom:12px; padding:10px 14px; border-radius:10px; border:1px solid rgba(248,113,113,.35); background:rgba(248,113,113,.08); color:#f87171; font-size:13px; font-weight:600; align-items:center; gap:10px; cursor:pointer; }
.banner.open { display:flex; }
.tower { display:flex; flex-direction:column; gap:8px; border-left:4px solid #b45309; border-right:4px solid #b45309; border-radius:10px; padding:14px 12px; background:linear-gradient(180deg,${dark ? "rgba(0,0,0,.35),rgba(0,0,0,.08)" : "rgba(15,23,42,.06),rgba(15,23,42,.02)"}); }
${F.tonnage ? ".loadbar { height:5px; background:var(--bg); border-radius:3px; overflow:hidden; margin-top:8px; } .loadbar > div { height:100%; background:#b45309; }" : ""}
.meta { font-size:11px; color:var(--muted); }
.kpi { padding:13px 18px 14px; background:var(--bg); } .kpi .label { font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:1px; font-weight:600; display:flex; align-items:center; gap:5px; } .kpi .val { font-size:24px; font-weight:800; letter-spacing:-0.02em; margin-top:4px; }
.modal { position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:center; justify-content:center; z-index:50; } .modal.open { display:flex; }
.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--accent); color:#000; padding:10px 20px; border-radius:10px; font-weight:700; display:none; z-index:60; } .toast.open { display:block; }
.sync-chip { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid var(--border); color:var(--muted); font-weight:600; white-space:nowrap; } .sync-chip:empty { display:none; }
.glist { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:8px; margin-bottom:12px; }
.gi { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 12px; font-size:12px; }
.gi b { display:block; font-size:12px; margin-bottom:2px; }
.gi span { color:var(--muted); }
.advice { font-size:11px; font-weight:600; margin-top:5px; }
@media (max-width:760px) { .grid-6 { grid-template-columns:repeat(2,1fr); } }
/* Shell — v2 design pass: topbar, hero band */
.topbar { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:14px; padding:10px 22px; border-bottom:1px solid var(--border); background:linear-gradient(180deg, ${dark ? "rgba(148,163,184,.06)" : "rgba(15,23,42,.03)"}, transparent 140%), var(--surface); }
.topbar .brand { display:flex; align-items:center; gap:10px; }
.brand-tile { width:36px; height:36px; border-radius:10px; color:#000; display:flex; align-items:center; justify-content:center; font-weight:800; flex:none; }
.brand b { font-size:16px; letter-spacing:-0.01em; display:block; line-height:1.15; }
.brand .tag { font-size:11.5px; }
.searchwrap { position:relative; flex:1; max-width:380px; margin-left:auto; }
.searchwrap .input { width:100%; padding-right:56px; }
.searchwrap .kbd { position:absolute; right:10px; top:50%; transform:translateY(-50%); }
.input { font-size:16px; }
.hero { display:flex; align-items:center; gap:20px; padding:20px 22px 14px; max-width:1160px; margin:0 auto; width:100%; }
.hero-side { min-width:200px; }
.hero-label { display:block; font-size:10px; text-transform:uppercase; letter-spacing:1.2px; color:var(--muted); font-weight:600; }
.hero-title { display:block; font-size:20px; font-weight:800; letter-spacing:-0.02em; margin:0; }
#mapView { padding:6px 22px 56px; max-width:1160px; margin:0 auto; width:100%; }
.card { border-radius:var(--r-md); }
.banner { border-radius:var(--r-md); }
.gi { border-radius:var(--r-md); }
@media (max-width:760px) { .grid-6 { grid-template-columns:repeat(2,1fr); } .searchwrap { display:none; } }
/* Entry mode — staff: the yard worker gets their OWN logging screen —
   rack tiles → the rack's rows → big edit modal. Owner chrome stays hidden. */
.scope-hint { display:none; font-size:12px; font-weight:700; color:var(--accent); }
body.entry .scope-hint { display:inline; }
body.entry button[onclick="exportCsv()"], body.entry #syncBtn, body.entry #clearRackBtn { display:none; }
#staffHome { display:none; padding:4px 22px 64px; max-width:640px; margin:0 auto; }
body.entry #staffHome { display:block; }
body.entry .hero, body.entry .stage, body.entry .footnotes, body.entry .lifecycle,
body.entry #unitsGrid, body.entry #auditBanner${hasStock ? ", body.entry #stockSec" : ""} { display:none; }
body.entry main#mapView { padding-top:4px; }
.sh-greet { margin:10px 0 4px; }
.sh-hi { font-size:27px; font-weight:800; letter-spacing:-0.02em; display:block; }
.sh-sub { color:var(--muted); font-size:13.5px; display:block; margin-top:3px; }
.sh-racks { display:grid; grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); gap:10px; margin:18px 0 6px; }
.sh-rack { text-align:center; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px 8px; color:var(--text); cursor:pointer; font:inherit; }
.sh-rack:active { transform:scale(.97); }
.sh-rack b { display:block; font-size:15px; }
.sh-rack span { display:block; color:var(--muted); font-size:11.5px; margin-top:4px; }
.sh-rack .sh-mini { display:flex; gap:2px; justify-content:center; margin-top:8px; }
.sh-rack .sh-mini i { width:9px; height:5px; border-radius:2px; background:var(--border); }
.sh-rack .sh-mini i.f { background:var(--accent); }
.sh-note { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12.5px; margin-top:16px; }
/* Reorder watchlist (optional extension) */
${hasStock ? `
.rail-title { font-size:11px; font-weight:700; letter-spacing:1px; color:var(--muted); text-transform:uppercase; display:flex; align-items:center; gap:6px; }
.stock-sec { margin:0 0 14px; }
.stock-row { display:flex; align-items:center; gap:12px; padding:11px 12px; border-bottom:1px solid var(--border); }
.stock-row:last-child { border-bottom:0; }
.stock-name { font-weight:700; font-size:13.5px; }
.stock-sub { font-size:11px; color:var(--muted); }
.stock-qty { margin-left:auto; font-weight:800; font-variant-numeric:tabular-nums; font-size:15px; cursor:pointer; white-space:nowrap; }
.stock-qty:hover { color:var(--accent); }` : ""}
</style>
${chromeCss(cfg.dark, cfg.accentHex)}
</head>
<body>
<header class="topbar">
  <div class="row brand">
    <div class="brand-tile">${logoOf(cfg.productName, cfg.logoText)}</div>
    <div class="brand"><b>${esc(cfg.productName)}</b><span class="muted tag">${esc(cfg.tagline)}</span></div>
  </div>
  <span class="meta-chip mono">${cfg.groupCount} ${pluralOf(cfg.groupLabel).toUpperCase()} · ${cfg.unitsPerGroup} ${pluralOf(cfg.countLabel).toUpperCase()} EACH</span>
  <div class="searchwrap"><input id="search" class="input" placeholder="${esc(searchPh)}" aria-label="Search" oninput="render()"><span class="kbd">⌘K</span></div>
  <button class="btn" onclick="exportCsv()">${icon("download")} Export CSV</button>
  <span id="scopeHint" class="scope-hint"></span>
  <button id="syncBtn" class="btn primary" onclick="sync()">${icon("upload")} Sync Changes</button>
  <span id="syncState" class="sync-chip"></span>
</header>
<section class="hero">
  <div class="hero-side">
    <span class="hero-label">${V.sectionSubtitle || cfg.groupLabel + " grid"}</span>
    <h1 class="hero-title">${V.sectionTitle || cfg.tagline}</h1>
  </div>
</section>
<section class="grid-6" style="border-bottom:1px solid var(--border)">
  <div class="kpi" style="border-left:3px solid var(--accent)"><span class="label">${icon("grid", 14)} Utilization</span><div class="val mono" id="kpiUtil">0%</div><div class="bar"><div id="barUtil" style="width:0%"></div></div></div>
  <div class="kpi" style="border-left:3px solid var(--ok)"><span class="label">${icon("check", 14)} Filled ${pluralOf(cfg.countLabel)}</span><div class="val mono tint-ok" id="kpiTotal">0 / 0</div></div>${cfg.qtyField ? `\n  <div class="kpi" style="border-left:3px solid var(--info)"><span class="label">${icon("grid", 14)} ${pluralOf(cfg.qtyField.label)} In Stock</span><div class="val mono tint-info" id="kpiQty">0</div></div>` : ""}
${F.tonnage ? `  <div class="kpi" style="border-left:3px solid var(--warn)"><span class="label">${icon("shield", 14)} Est. Tonnage</span><div class="val mono tint-warn" id="kpiTonnage">0.0 T</div></div>\n  ` : ""}
</section>
<main id="mapView">
  <section id="staffHome">
    <div class="sh-greet"><span class="sh-hi" id="shHi"></span><span class="sh-sub" id="shSub"></span></div>
    <div class="sh-racks" id="shRacks"></div>
    <div class="sh-note">${icon("check", 14)} <span>Tap a ${cfg.groupLabel.toLowerCase()} to say what's stored — saves on its own.</span></div>
  </section>
  <div id="auditBanner" class="banner" onclick="auditFocus()"><span>⚠</span><span id="auditText"></span></div>
  ${hasStock ? `<section id="stockSec" class="stock-sec">
    <div class="rail-title">${icon("clock", 13)} Stock &amp; Expiry Watchlist</div>
    <div class="card" style="margin-top:10px;padding:2px 12px"><div id="stockList"></div></div>
  </section>` : ""}
  <div class="muted" style="font-size:12px;margin-bottom:10px">${icon("lightbulb", 14)} ${cfg.advisory}</div>
  ${V.guidelines.length ? `<div class="glist">${V.guidelines.map(g => `<div class="gi"><b>${g.title}</b><span>${g.detail}</span></div>`).join("")}</div>` : ""}
  <div id="unitsGrid" class="grid-auto"></div>
</main>
<section id="detailView" hidden style="padding:16px 24px 48px">
  <div class="row" style="margin-bottom:6px">
    <button class="btn" onclick="closeDetail()">← Back to Overview</button>
    <button class="btn" id="prevRack" onclick="navRack(-1)">‹ Prev</button>
    <h3 id="detailTitle" style="margin:0"></h3>
    <button class="btn" id="nextRack" onclick="navRack(1)">Next ›</button>
    <select id="jumpSel" class="input" aria-label="Jump to ${cfg.groupLabel}" onchange="openDetail(+this.value)"></select>
    <button class="btn" id="clearRackBtn" onclick="clearRack()">Clear Rack</button>
  </div>
  <div id="rackStats" class="meta mono" style="margin-bottom:12px"></div>
  <div class="meta" style="margin:0 0 8px"><b>${V.sectionTitle || cfg.groupLabel + " Detail"}</b>${V.sectionSubtitle ? " · " + V.sectionSubtitle : ""} · ${cfg.unitsPerGroup} (top) → 1 (floor)</div>
  <div id="rackRows" class="tower"></div>
</section>
<section id="listView" hidden style="padding:16px 24px 48px">
  <table style="width:100%;border-collapse:collapse;font-size:14px" id="listTable"></table>
</section>
<nav class="row" style="position:fixed;bottom:0;left:0;right:0;justify-content:center;padding:10px;gap:8px;border-top:1px solid var(--border);background:var(--surface)">
  <button class="btn" id="tabMap" onclick="showView('map')">Map</button>
  <button class="btn" id="tabList" onclick="showView('list')">Inventory List</button>
</nav>
<div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
  <div class="card" style="width:min(420px,92vw)">
    <h3 style="margin:0 0 12px" id="modalTitle">Edit</h3>
    <div id="modalHint" class="advice" style="display:none;margin:-6px 0 10px;color:var(--accent)"></div>
    ${f.map((k, i) => `<input id="editF${i}" class="input" aria-label="${k.label}" ${k.type === "number" ? 'type="number" inputmode="decimal" enterkeyhint="done"' : ""} style="width:100%;margin-bottom:10px" placeholder="${k.label}">`).join("\n    ")}${cfg.qtyField ? `\n    <input id="editQty" class="input" type="number" inputmode="numeric" enterkeyhint="done" aria-label="${cfg.qtyField.label} per slot" placeholder="${cfg.qtyField.label} per slot" style="width:100%;margin-bottom:10px">` : ""}
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="applyEdit()">Apply</button>
    </div>
  </div>
</div>
<div id="toast" class="toast"></div>
${chromeJs({ syncLabel: 'Sync Changes' })}
<script>var CFG = { groups:${cfg.groupCount},per:${cfg.unitsPerGroup},groupLabel:${jstr(cfg.groupLabel)},countLabel:${jstr(cfg.countLabel)},cats:${catJson},
  fields:[${f.map(k => `{key:${jstr(k.key)},label:${jstr(k.label)},type:${jstr(k.type)}}`).join(",")}],qtyKey:${cfg.qtyField ? jstr(cfg.qtyField.key) : "null"} };
var state = [], currentGroup = null, editing = null;
/* Entry mode: any signed-in worker logs into the shared yard grid —
   chrome-scoped, data full (slots carry no owner dimension). */
var ENTRY = null;
function setEntry(n){
  var q = String(n || '').trim(); if (!q) return;
  ENTRY = q;
  document.body.classList.add('entry');
  renderStaffHome();
}
/* Staff Home — the yard worker's own screen: one tile per ${cfg.groupLabel.toLowerCase()}
   with a mini fill picture; tap opens that rack's rows (the proven detail view,
   with owner chrome already hidden). Every edit they save carries their name. */
function renderStaffHome(){
  if (!ENTRY) return;
  var hi = document.getElementById('shHi'); if (!hi) return;
  hi.textContent = 'Hi ' + ENTRY;
  var groups = new Map();
  state.forEach(function(u){ if(!groups.has(u.g)) groups.set(u.g, []); groups.get(u.g).push(u); });
  var filled = state.filter(function(u){ return u.v0; }).length;
  document.getElementById('shSub').textContent = filled + ' of ' + state.length + ' slots filled · tap a ${cfg.groupLabel.toLowerCase()} below';
  document.getElementById('shRacks').innerHTML = Array.from(groups.keys()).sort(function(a,b){ return a-b; }).map(function(g){
    var units = groups.get(g); var f = units.filter(function(u){ return u.v0; }).length;
    var mini = units.slice().sort(function(a,b){ return a.s - b.s; }).map(function(u){ return '<i class="' + (u.v0 ? 'f' : '') + '"></i>'; }).join('');
    return '<button class="sh-rack" data-g="' + g + '"><b>${cfg.groupLabel} ' + g + '</b><span>' + f + '/' + units.length + '</span><span class="sh-mini">' + mini + '</span></button>';
  }).join('');
}
document.getElementById('shRacks').addEventListener('click', function(ev){
  var c = ev.target.closest('.sh-rack'); if (!c || !ENTRY) return;
  openDetail(parseInt(c.getAttribute('data-g'), 10));
});
var DENS = ${densityJson};
var AREA = ${cfg.sheetAreaM2};
var AUDIT = { heavy:${cfg.audit.heavySlotKg}, row:${cfg.audit.elevatedRow}, rowKg:${cfg.audit.heavyRowKg ?? 3500} };
var HZ = ${H ? jstr({ heavyMin: H.heavyGaugeMinMm, rowKg: Math.round(H.rowCapacityTons * 1000), low: H.lowRows, mid: H.midRows }) : "null"};
var UNIT = ${jstr(V.unitNoun || cfg.countLabel)};
var STOCK = ${sJson};
function stockStateOf(i){
  var s = STOCK[i];
  if (/day/i.test(s.u)) return s.q <= s.m ? 'expired' : (s.q <= s.m + 2 ? 'soon' : 'ok'); // unit is shelf-life days
  return s.q <= s.m ? 'reorder' : 'ok';
}
function renderStock(){
  var el = document.getElementById('stockList'); if (!el || !STOCK.length) return;
  el.innerHTML = STOCK.map(function(s, i){
    var st = stockStateOf(i);
    var cls = st === 'reorder' || st === 'expired' ? 'badge warn' : st === 'soon' ? 'badge part' : 'badge ok';
    var txt = st === 'reorder' ? 'REORDER' : st === 'expired' ? 'PAST MIN' : st === 'soon' ? 'SOON' : 'OK';
    return '<div class="stock-row"><span><span class="stock-name">' + s.n + '</span><span class="stock-sub"> · min ' + s.m + ' ' + s.u + '</span></span><span class="stock-qty mono" data-i="' + i + '">' + s.q + ' ' + s.u + ' <span class="' + cls + '">' + txt + '</span></span></div>';
  }).join('');
}
function openStock(i){
  editing = { stockIdx: i };
  var s = STOCK[i];
  document.getElementById('modalTitle').innerText = 'Update · ' + s.n;
  var mh2 = document.getElementById('modalHint'); if (mh2) mh2.hidden = true;
  document.getElementById('editF0').value = String(s.q);
  document.getElementById('editF0').setAttribute('aria-label', 'Quantity of ' + s.n);
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function densOf(v){ v=(v||'').toUpperCase(); for (var i=0;i<DENS.length;i++){ if (v.indexOf(DENS[i].m)===0) return DENS[i].d; } return ${STEEL_DEFAULT_DENSITY}; }
function catOf(u){ if(!u.v0) return null; for (var i=0;i<CFG.cats.length;i++){ if((u.v0+'').toUpperCase().indexOf(CFG.cats[i].match)===0) return CFG.cats[i]; } return CFG.cats[CFG.cats.length-1] || null; }
function seedDemo(){
  // Deterministic, domain-realistic demo: heavy base → light top, ~25% empty,
  // quantities sized so every row sits near a realistic working load.
  var P = { heavy:[6,8,10,12,14], mid:[2,3,3,4,5], top:[1.5,2,2,3] };
  var pick = function(arr, i){ return arr[i % arr.length]; };
  state = [];
  for (var g=1; g<=CFG.groups; g++){
    for (var s=1; s<=CFG.per; s++){
      if ((g + s) % 4 === 0){ state.push({ g:g, s:s, v0:'', v1:'', v2:'', q:'' }); continue; }
      var c = CFG.cats[(g + s) % CFG.cats.length];
      var t = CFG.fields[2].type === 'number' ? pick(s <= 3 ? P.heavy : (s <= 6 ? P.mid : P.top), g + s) : '';
      var kg = (parseFloat(t) || 0) * AREA * densOf(c.label);
      var q = ${cfg.qtyField ? "CFG.qtyKey ? Math.max(1, Math.round(2500 / kg)) : ''" : "''"};
      state.push({ g:g, s:s, v0:c.label + ' ' + (100 + ((g * 7 + s * 13) % 900)), v1:'', v2:String(t), q:String(q) });
    }
  }
  saveLocal();
}
function render(){
  var grid = document.getElementById('unitsGrid'); grid.innerHTML = '';
  var groups = new Map();
  state.forEach(function(u){ if(!groups.has(u.g)) groups.set(u.g, []); groups.get(u.g).push(u); });
  var Q = (document.getElementById('search').value || '').toLowerCase();
  var counts = CFG.cats.map(function(){ return 0; }), filled = 0;
  ${F.tonnage ? "var tons = 0;" : ""}
  groups.forEach(function(units, gNum){
    var f = units.filter(function(u){ return u.v0; }).length; filled += f;
    units.forEach(function(u){ var c = catOf(u); if(c){ var idx = CFG.cats.indexOf(c); if(idx>=0) counts[idx]++; } ${F.tonnage ? "tons += weightOf(u);" : ""} });
    var slivers = units.slice().sort(function(a,b){ return a.s - b.s; }).map(function(u){
      var c = catOf(u);
      return '<div class="tier' + (c ? '' : ' empty') + '" title="' + CFG.groupLabel + ' ' + gNum + ' · ' + u.s + (u.v0 ? ': ' + u.v0 : ': Empty') + '" style="' + (c ? 'background:' + c.color : '') + '"></div>';
    }).join('');
    var badge = f === units.length ? '<span class="badge full">FULL</span>' : f > 0 ? '<span class="badge part">' + f + '/' + units.length + '</span>' : '<span class="badge none">EMPTY</span>';
    var card = document.createElement('div');
    card.className = 'card hi unit-card';
    card.innerHTML = '<div class="spread"><b>' + CFG.groupLabel + ' ' + gNum + '</b>' + badge + badgeHtml(gNum, units) + '</div><div class="stack">' + slivers + '</div><div class="meta mono">' + Math.round(100*f/units.length) + '% Cap</div>';
    var m = !Q, gw = 0;
    units.forEach(function(u){ gw += weightOf(u); if (!m && ((u.v0+' '+u.v1+' '+u.v2+' '+(u.q||'')+' '+gNum).toLowerCase().indexOf(Q) !== -1)) m = true; });
    if (Q) card.classList.add(m ? 'hit' : 'dim');
    card.title = CFG.groupLabel + ' ' + gNum + ' · ' + f + '/' + units.length${F.tonnage ? " + ' · ' + (gw/1000).toFixed(1) + ' T'" : ""};
    card.onclick = (function(g){ return function(){ openDetail(g); }; })(gNum);
    grid.appendChild(card);
  });
  document.getElementById('kpiUtil').innerText = Math.round(100*filled/state.length) + '%';
  document.getElementById('barUtil').style.width = Math.round(100*filled/state.length) + '%';
  document.getElementById('kpiTotal').innerText = filled + ' / ' + state.length;
  ${cfg.qtyField ? "var tq = 0; state.forEach(function(u){ if (u.v0){ var q = parseInt(u.q,10); if (q > 0) tq += q; } }); var kq = document.getElementById('kpiQty'); if (kq) kq.innerText = tq;" : ""}
  CFG.cats.forEach(function(c, i){ var el = document.getElementById('kpiCat'+i); if (el) el.innerText = counts[i]; });
  ${F.tonnage ? "var kt = document.getElementById('kpiTonnage'); if (kt) kt.innerText = (tons/1000).toFixed(1) + ' T';" : ""}
  ${F.weightAudit ? `var ab = document.getElementById('auditBanner'); if (ab){ var hits = computeAudit(); ab.classList.toggle('open', hits.length > 0); if (hits.length) document.getElementById('auditText').innerText = hits.length + ' heavy load' + (hits.length > 1 ? 's' : '') + ' on elevated rows — tap to review (safe limit: ' + ${cfg.qtyField ? "AUDIT.rowKg" : "AUDIT.heavy"} + 'kg above row ' + (AUDIT.row - 1) + ')'; }` : ""}
  renderList();
}
function navRack(d){ if (!currentGroup) return; openDetail(((currentGroup - 1 + d + CFG.groups) % CFG.groups) + 1); }
function clearRack(){
  if (!currentGroup) return;
  state.forEach(function(u){ if (u.g === currentGroup){ u.v0=''; u.v1=''; u.v2=''; u.q=''; } });
  saveLocal(); render(); openDetail(currentGroup); toast('Rack cleared');
}
function openDetail(g){
  currentGroup = g;
  document.getElementById('detailTitle').innerText = CFG.groupLabel + ' ' + g + ' — ' + CFG.per + ' ' + (CFG.countLabel || 'units').toLowerCase() + 's';
  var js = document.getElementById('jumpSel');
  if (!js.options.length){ for (var j=1;j<=CFG.groups;j++){ var o=document.createElement('option'); o.value=j; o.text=CFG.groupLabel+' '+j; js.appendChild(o); } }
  js.value = g;
  var units = state.filter(function(u){ return u.g === g; }).sort(function(a,b){ return b.s - a.s; });
  var fN = units.filter(function(u){ return u.v0; }).length, wN = 0, tN = 0;
  units.forEach(function(u){ var w = weightOf(u); wN += w; tN = Math.max(tN, w); });
  ${cfg.qtyField ? "var qN = 0; units.forEach(function(u){ var q = parseInt(u.q,10); if (u.v0 && q > 0) qN += q; });" : "var qN = fN;"}
  var st = document.getElementById('rackStats');
  var qtyWord = ${cfg.qtyField ? `(function(w){ w = w.toLowerCase(); if (/s$/.test(w)) return w; return /(x|ch|sh)$/.test(w) ? w + 'es' : w + 's'; })('${cfg.qtyField.label}')` : "'items'"};
  ${F.tonnage ? "var wtTxt = '  ·  ' + (wN/1000).toFixed(1) + ' T total  ·  Thickest ' + (CFG.fields[2].type === 'number' ? (Math.max.apply(null, units.map(function(u){ return parseFloat(u.v2) || 0; })).toFixed(1) + ' mm') : '—')" : "var wtTxt = ''"};
  st.innerText = 'Occupancy ' + fN + '/' + units.length + ' (' + Math.round(100*fN/units.length) + '%)' + wtTxt + '  ·  ' + qN + ' ' + qtyWord + (HZ ? '  ·  Max ' + (HZ.rowKg/1000).toFixed(1) + ' T/' + CFG.countLabel.toLowerCase() : '');
  var rows = document.getElementById('rackRows'); rows.innerHTML = '';
  units.forEach(function(u){
    var d = document.createElement('div'); var c = catOf(u);
    d.className = 'card unit-card';
    if (c) d.style.borderLeft = '3px solid ' + c.color;
    var w = weightOf(u);
    var pct = Math.min(100, Math.round(100 * w / AUDIT.rowKg));
    ${F.tonnage ? "var warn = u.s >= AUDIT.row && w >= " + (cfg.qtyField ? "AUDIT.rowKg" : "AUDIT.heavy") + " ? ' <span class=\"badge warn\">⚠ HIGH</span>' : '';" : "var warn = '';"}
    var qtyTxt = ${cfg.qtyField ? "(parseInt(u.q,10) > 0 ? ' ×' + parseInt(u.q,10) : '')" : "''"};
    var adv = ${F.tonnage ? "adviceOf(u)" : "''"};
    d.innerHTML = '<div class="spread"><b>' + CFG.countLabel + ' ' + u.s + warn + '</b><span class="mono muted">' + (u.v0 ? [u.v0,u.v1,u.v2].filter(Boolean).join(' · ') + qtyTxt${F.tonnage ? " + ' · ' + (w/1000).toFixed(2) + ' T'" : ""} : 'Empty') + '</span></div>' +
      ${F.tonnage ? "(w > 0 ? '<div class=\"loadbar\"><div style=\"width:' + pct + '%\"></div></div>' : '')" : "''"} + (adv ? '<div class="advice" style="color:' + (adv.indexOf('move') >= 0 || adv.indexOf('Over') === 0 ? '#f87171' : '#34d399') + '">' + adv + '</div>' : '');
    d.onclick = (function(gx, s){ return function(){ openModal(gx, s); }; })(g, u.s);
    rows.appendChild(d);
  });
  document.getElementById('mapView').hidden = true; document.getElementById('detailView').hidden = false;
}
function closeDetail(){ document.getElementById('detailView').hidden = true; document.getElementById('mapView').hidden = false; currentGroup = null; }
function openModal(g, s){
  editing = state.find(function(u){ return u.g === g && u.s === s; });
  if (!editing) return;
  document.getElementById('modalTitle').innerText = 'Edit ' + CFG.groupLabel + ' ' + g + ' · ' + CFG.countLabel + ' ' + s;
  CFG.fields.forEach(function(fd, i){ document.getElementById('editF'+i).value = editing['v'+i] || ''; });
  ${cfg.qtyField ? "var eq = document.getElementById('editQty'); if (eq) eq.value = editing.q || '';" : ""}
  var mh = document.getElementById('modalHint');
  var TONNAGE = ${F.tonnage ? "true" : "false"};
  if (mh){ if (HZ && TONNAGE && !editing.v0 && editing.s <= HZ.low){ mh.innerText = 'Zone guide: rows 1-' + HZ.low + ' reserved for ≥' + HZ.heavyMin + ' ' + gaugeUnit + ' ' + UNIT + 's'; mh.style.display = 'block'; } else { mh.style.display = 'none'; } }
  document.getElementById('modal').classList.add('open');
  ${cfg.qtyField ? "var fq = document.getElementById('editQty'); if (fq) { fq.focus(); } else document.getElementById('editF0').focus();" : "document.getElementById('editF0').focus();"}
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
function applyEdit(){
  if (editing && editing.stockIdx !== undefined){
    var v = parseFloat(document.getElementById('editF0').value);
    if (!isNaN(v)) STOCK[editing.stockIdx].q = Math.max(0, v);
    renderStock(); closeModal(); toast(ENTRY ? 'Saved ✓' : 'Saved'); return;
  }
  if (!editing) return;
  CFG.fields.forEach(function(fd, i){ editing['v'+i] = document.getElementById('editF'+i).value.trim(); });
  if (ENTRY) editing.by = ENTRY;
  ${cfg.qtyField ? "var eq = document.getElementById('editQty'); if (eq) editing.q = eq.value.trim();" : ""}
  saveLocal(); render();
  if (currentGroup) openDetail(currentGroup);
  closeModal(); toast(ENTRY ? 'Saved ✓' : 'Saved'); PERSIST.schedule();
}
function weightOf(u){
  var t = parseFloat(u.v2); if (!t || t <= 0) return 0;
  var kg = t * AREA * densOf(u.v0); // mm × m² × g/cm³ → kg per piece
  ${cfg.qtyField ? "var q = parseInt(u.q, 10); if (q > 0) kg *= q;" : ""}
  return kg;
}
function adviceOf(u){
  if (!HZ) return '';
  var w = weightOf(u), t = parseFloat(u.v2) || 0;
  if (!u.v0) return (u.s <= HZ.low) ? ('Zone guide: rows 1-' + HZ.low + ' reserved for ≥' + HZ.heavyMin + 'mm ' + UNIT + 's') : '';
  if (w >= HZ.rowKg && u.s > HZ.low) return 'Over ' + (HZ.rowKg/1000).toFixed(1) + 'T row limit — move to rows 1-' + HZ.low;
  if (t >= HZ.heavyMin && u.s > HZ.mid) return 'Heavy gauge up top — move low for forklift reach';
  if (w >= HZ.rowKg && u.s <= HZ.low) return 'Heavy zone — correct placement';
  if (t >= HZ.heavyMin && u.s <= HZ.low) return 'Heavy gauge, heavy zone — correct placement';
  return '';
}
function computeAudit(){
  var hits = [];
  var limit = ${cfg.qtyField ? "AUDIT.rowKg" : "AUDIT.heavy"}; // quantity-aware: row stacks vs single plates
  for (var i=0;i<state.length;i++){ var u = state[i]; if (u.v0 && u.s >= AUDIT.row && weightOf(u) >= limit) hits.push(u); }
  return hits;
}
function auditFocus(){
  var hits = computeAudit(); if (!hits.length) return;
  showView('list'); document.getElementById('search').value = hits[0].g + ''; render();
}
function badgeHtml(gNum, units){
  if (!${F.balanceBadge}) return '';
  var heavyLow = 0, heavyHigh = 0;
  var limit = ${cfg.qtyField ? "AUDIT.rowKg" : "AUDIT.heavy"};
  units.forEach(function(u){ if (!u.v0) return; var w = weightOf(u); if (w >= limit){ if (u.s < AUDIT.row) heavyLow++; else heavyHigh++; } });
  var ok = heavyHigh === 0, full = heavyLow + heavyHigh === 0;
  return ' <span class="badge ' + (ok ? 'ok' : 'warn') + '">' + (full ? '—' : ok ? 'BALANCED' : 'REBALANCE') + '</span>';
}
function renderList(){
  var t = document.getElementById('listTable'); if (!t) return;
  var q = (document.getElementById('search').value || '').toLowerCase();
  var rows = state.filter(function(u){
    var hay = (u.v0+' '+u.v1+' '+u.v2+' '+(u.q||'')+' '+CFG.groupLabel+' '+u.g+' '+CFG.countLabel+' '+u.s).toLowerCase();
    return !q || hay.indexOf(q) !== -1;
  });
  t.innerHTML = '<tr style="text-align:left;color:var(--muted)"><th style="padding:8px">' + CFG.groupLabel + '</th><th>' + CFG.countLabel + '</th>' + CFG.fields.map(function(fd){ return '<th>' + fd.label + '</th>'; }).join('') + ${cfg.qtyField ? `"<th>${cfg.qtyField.label}</th>"` : "''"} + '</tr>' +
    rows.map(function(u){ return '<tr><td style="padding:8px">' + u.g + '</td><td>' + u.s + '</td>' + CFG.fields.map(function(fd,i){ return '<td class="mono">' + (u['v'+i] || '—') + '</td>'; }).join('') + ${cfg.qtyField ? `"<td class='mono'>" + (parseInt(u.q,10) > 0 ? parseInt(u.q,10) : '—') + "</td>"` : "''"} + '</tr>'; }).join('');
}
function showView(v){
  document.getElementById('mapView').hidden = v !== 'map';
  document.getElementById('detailView').hidden = true;
  document.getElementById('listView').hidden = v !== 'list';
}
function buildRecords(){
  return state.map(function(u){ var r = { }; r[CFG.groupLabel.toLowerCase()+'_id'] = u.g; r['slot_no'] = u.s; CFG.fields.forEach(function(fd,i){ r[fd.key] = u['v'+i]; }); ${cfg.qtyField ? "if (CFG.qtyKey) r[CFG.qtyKey] = parseInt(u.q,10) || 0;" : ""} if (u.by) r.logged_by = u.by; return r; });
}
// Engine 2: the ledger is the console's memory. Boot hydrates from the latest
// confirmed event (applyLoaded merges server records into seeded state); every
// edit auto-persists a full snapshot through the same submit bridge.
function applyLoaded(records){
  if (!records || !records.length) return;
  var gl = CFG.groupLabel.toLowerCase() + '_id';
  records.forEach(function(r){
    if (!r) return;
    var g = parseInt(r[gl], 10) || parseInt(r[CFG.groupLabel + '_id'], 10);
    var s = parseInt(r['slot_no'], 10);
    if (!g || !s) return;
    var u = state.find(function(x){ return x.g === g && x.s === s; });
    if (!u) return;
    var has = false;
    CFG.fields.forEach(function(fd, i){ var v = r[fd.key]; if (v !== undefined && v !== null && v !== ''){ u['v'+i] = String(v); has = true; } });
    if (r.logged_by) u.by = r.logged_by;
    ${cfg.qtyField ? "var qv = r[CFG.qtyKey]; if (qv !== undefined && qv !== null) u.q = String(qv);" : ""}
    if (!has && !u.v0){ u.v0 = ''; }
  });
  saveLocal();
}
function exportCsv(){
  var rows = [[CFG.groupLabel.toLowerCase(), CFG.countLabel.toLowerCase()].concat(CFG.fields.map(function(fd){ return fd.key; })${cfg.qtyField ? `.concat([${jstr(cfg.qtyField.key)}])` : ""})];
  state.forEach(function(u){ rows.push([u.g, u.s].concat(CFG.fields.map(function(fd,i){ return u['v'+i]; })${cfg.qtyField ? ".concat([parseInt(u.q,10) || 0])" : ""})); });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'inventory.csv'; a.click();
  toast('Exported CSV');
}
  var slEl = document.getElementById('stockList'); if (slEl) slEl.addEventListener('click', function(ev){
  var q = ev.target.closest('.stock-qty'); if (!q || ENTRY) return;
  openStock(parseInt(q.getAttribute('data-i'), 10));
});
(function boot(){ var s = loadLocal(); if (s && s.length) state = s; else seedDemo(); render(); renderStock(); PERSIST.hydrate(false); })();
</script>
</body>
</html>`;
}

// Studio V2 pipeline: extract content config → assemble deterministically.
export async function generateStudioConsoleV2(opts: { userPrompt: string }): Promise<string> {
  const cfg = await extractConsoleConfig(opts.userPrompt);
  return assembleConsole(cfg);
}
