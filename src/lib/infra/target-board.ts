// Archetype #2: Target Board — people (rows) × metrics (columns, each with a
// target) × daily actuals (editable cells). Same doctrine as the spatial
// archetype: the model chooses nouns/targets/people; ALL behavior lives here
// as proven code. Contract parity: #modal/.open mechanics, #editF0 focus,
// __opsDeskSubmit__ bridge, storage-shim persistence, toast.
//
// v2 TEMPLATE (design pass): verdict-first composition — the pace projection
// is the hero, the board is the centerpiece, KPIs are a calm ledger strip.
// Structure/hierarchy/typography changed; ALL behavior anchors preserved
// (tests/target-board.mts invariance + greps, tests/entry-behavior.mts,
// tests/console-emission.mts emission gate).
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { esc, jstr } from "./escape";
import { logoOf } from "./branding";
import { chromeFonts, chromeCss, icon } from "./chrome";

export const TargetBoardSchema = z.object({
  productName: z.string().describe("Short invented product name, e.g. 'MetricFlow Pro'"),
  logoText: z.string().min(1),
  tagline: z.string(),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dark: z.boolean(),
  people: z.array(z.object({ name: z.string() })).min(1).max(60).describe("The people who report numbers, exactly as named"),
  metrics: z.array(z.object({ key: z.string(), label: z.string(), target: z.number().positive() })).min(1).max(12).describe("The reported metrics with their daily targets"),
  searchHint: z.string(),
  advisory: z.string().describe("One domain best-practice tip for hitting these targets"),
  voice: z.object({
    boardTitle: z.string().describe("Insider name for this board, e.g. 'Sales Floor Standup', 'Daily Huddle'"),
    unitNoun: z.string().describe("What one reported unit is called in this trade, e.g. 'activation', 'policie', 'order'"),
    searchExamples: z.array(z.string()).max(5).describe("Names/metrics an owner types, e.g. 'Bhuvana', 'New'"),
    guidelines: z.array(z.object({ title: z.string(), detail: z.string() })).max(3).describe("Trade coaching for hitting THESE targets, real vocabulary"),
  }).describe("Domain voice — the board must read like this industry's own scoreboard").optional(),
  heuristics: z.object({
    onTargetPct: z.number().min(50).max(100).describe("Overall achievement % below which the team is flagged 'needs push'"),
    paceHour: z.number().int().min(9).max(21).describe("Hour of day the pace projection targets, e.g. 18 for 6pm"),
    minPacePct: z.number().min(20).max(100).describe("Expected fraction of daily target done by paceHour"),
  }).describe("Judgment as numbers — drives pace projection and at-risk flags").optional(),
  stock: z.array(z.object({
    name: z.string(),
    unit: z.string(),
    qty: z.number(),
    minQty: z.number().nonnegative(),
  })).max(20).optional().describe("Reorder watchlist — ONLY when the prompt mentions stock/inventory/reorder levels/expiry. Item name, unit ('kg','pcs','ltr' — or '3 days' style for expiry), current quantity, minimum quantity before reorder"),
  priceList: z.array(z.object({
    item: z.string(),
    price: z.number().positive(),
  })).max(20).optional().describe("Rate card — ONLY when the prompt mentions a menu, rate card, price list, or quotation. Item name and price in rupees"),
});

export type TargetBoardConfig = z.infer<typeof TargetBoardSchema>;

export async function extractTargetBoardConfig(userPrompt: string): Promise<TargetBoardConfig> {
  return generateWithRepair<TargetBoardConfig>({
        prompt: `A manager described a team reporting operation. Extract the target-board config.\n\nMANAGER: \"${userPrompt}\"\n\nList every named person verbatim. List every metric with its stated target (invent a sensible target only if truly unstated). Invent the product name and pick an accent color. Write one advisory tip for this kind of team.\n\nSTOCK — only if the prompt mentions stock/inventory/reorder/expiry: items with unit, current qty and the minimum qty before reorder (for perishables use a unit like '5 days' meaning shelf life left). Skip stock entirely otherwise.\nPRICELIST — only if the prompt mentions a menu/rate card/price list: item names with prices in rupees. Skip entirely otherwise.\n\nVOICE — make the board speak this trade's language: boardTitle (insider name for the board), unitNoun (what one reported unit is called), searchExamples (real names/metrics typed here), guidelines (2-3 coaching tips with this trade's vocabulary and reasons).\n\nHEURISTICS — judgment as numbers: onTargetPct (achievement % below which the team needs a push, e.g. 70), paceHour (hour the day is measured against, e.g. 18), minPacePct (fraction of target expected done by that hour, e.g. 60).`,
      },
      TargetBoardSchema,
      5);
}

// Deterministic assembler for the people × metrics × actuals grid.
export function assembleTargetBoard(cfg: TargetBoardConfig): string {
  const theme = cfg.dark
    ? { bg: "#0f172a", surface: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", input: "#0b1220" }
    : { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#ffffff" };
  const mJson = jstr(cfg.metrics.map(m => ({ k: m.key, l: m.label, t: m.target })));
  const V = cfg.voice ?? { boardTitle: "", unitNoun: "", searchExamples: [] as string[], guidelines: [] as { title: string; detail: string }[] };
  const H = cfg.heuristics ?? null;
  const searchPh = (V.searchExamples.length ? V.searchExamples.join(", ") : cfg.searchHint);
  // Extensions: reorder watchlist (qty vs minQty, or shelf-life days in the
  // unit) + rate card. Both optional — pre-extension configs assemble byte-
  // identical (hasStock/hasPrice gate every new DOM node and CSS column).
  const S = cfg.stock ?? [];
  const P = cfg.priceList ?? [];
  const hasStock = S.length > 0;
  const hasPrice = P.length > 0;
  const kpiCols = 4 + (hasStock ? 2 : 0);
  const sJson = jstr(S.map(s => ({ n: s.name, u: s.unit, q: s.qty, m: s.minQty })));
  const pJson = jstr(P.map(p => ({ n: p.item, r: p.price })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(cfg.productName)}</title>
${chromeFonts()}
<style>
:root { --bg:${theme.bg}; --surface:${theme.surface}; --border:${theme.border}; --text:${theme.text}; --muted:${theme.muted}; --accent:${cfg.accentHex}; --r-lg:16px; --r-md:12px; --r-sm:8px; }
* { box-sizing:border-box; }
body { background:var(--bg); color:var(--text); font-family:'Inter',system-ui,sans-serif; margin:0; font-size:14px; line-height:1.45; background-image:linear-gradient(${cfg.dark ? "rgba(148,163,184,.055) 1px, transparent 1px" : "rgba(15,23,42,.035) 1px, transparent 1px"}),linear-gradient(90deg,${cfg.dark ? "rgba(148,163,184,.055) 1px, transparent 1px" : "rgba(15,23,42,.035) 1px, transparent 1px"}); background-size:28px 28px; }
.mono { font-family:'JetBrains Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; }
::-webkit-scrollbar { width:6px; height:6px; } ::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
::selection { background:var(--accent); color:#000; }
.row { display:flex; align-items:center; gap:12px; }
.muted { color:var(--muted); }

/* ---- Typographic scale ------------------------------------------------ */
/* display 34–40 · kpi 24 · name 13.5 · cell 15 · label 10 uppercase      */

/* ---- Topbar ------------------------------------------------------------ */
.topbar { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:14px; padding:10px 22px; border-bottom:1px solid var(--border); background:linear-gradient(180deg, ${cfg.dark ? "rgba(148,163,184,.06)" : "rgba(15,23,42,.03)"} , transparent 140%), var(--surface); }
.brand-tile { width:36px; height:36px; border-radius:10px; color:#000; display:flex; align-items:center; justify-content:center; font-weight:800; flex:none; }
.brand b { font-size:16px; letter-spacing:-0.01em; display:block; line-height:1.15; }
.brand .tag { font-size:11.5px; }
.meta-chip { font-size:10px; padding:3px 9px; border:1px solid var(--border); border-radius:999px; color:var(--muted); letter-spacing:.8px; font-weight:600; white-space:nowrap; }
.searchwrap { position:relative; flex:1; max-width:380px; margin-left:auto; }
.searchwrap .kbd { font-family:ui-monospace,monospace; font-size:10px; border:1px solid var(--border); border-bottom-width:2px; border-radius:4px; padding:1px 6px; color:var(--muted); position:absolute; right:10px; top:50%; transform:translateY(-50%); }
.btn { padding:8px 15px; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--text); cursor:pointer; font-weight:600; font-size:13px; }
.btn.primary { background:var(--accent); color:#000; border-color:var(--accent); }
.input { padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:var(--input); color:var(--text); font-size:16px; width:100%; }
.sync-chip { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid var(--border); color:var(--muted); font-weight:600; white-space:nowrap; } .sync-chip:empty { display:none; }

/* ---- Hero band: the verdict leads -------------------------------------- */
.hero { display:flex; align-items:center; gap:20px; padding:20px 22px 14px; max-width:1160px; margin:0 auto; width:100%; }
.hero-label { display:block; font-size:10px; text-transform:uppercase; letter-spacing:1.2px; color:var(--muted); font-weight:600; }
.hero-title { display:block; font-size:20px; font-weight:800; letter-spacing:-0.02em; margin:0; }
#verdict { flex:1; display:none; align-items:center; gap:16px; border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:var(--r-md); padding:12px 18px; background:var(--surface); min-height:64px; }
.vbig { font-family:'JetBrains Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; font-size:32px; font-weight:800; letter-spacing:-0.03em; flex:none; }
.vtxt { font-size:13px; color:var(--text); font-weight:500; }

/* ---- Day ledger strip (KPIs) ------------------------------------------- */
.grid-4 { display:grid; grid-template-columns:repeat(${kpiCols},1fr); gap:1px; background:var(--border); border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
${hasStock ? `
.kpi:nth-child(5) { border-left:3px solid #fbbf24; }
.kpi:nth-child(6) { border-left:3px solid #f87171; }
.stock-row { display:flex; align-items:center; gap:12px; padding:11px 12px; border-bottom:1px solid var(--border); }
.stock-row:last-child { border-bottom:0; }
.stock-name { font-weight:700; font-size:13.5px; }
.stock-sub { font-size:11px; color:var(--muted); }
.stock-qty { margin-left:auto; font-weight:800; font-variant-numeric:tabular-nums; font-size:15px; cursor:pointer; white-space:nowrap; }
.stock-qty:hover { color:var(--accent); }` : ""}
.kpi { padding:13px 18px 14px; background:var(--bg); }
.kpi:nth-child(1) { border-left:3px solid var(--accent); }
.kpi:nth-child(2) { border-left:3px solid var(--ok); }
.kpi:nth-child(3) { border-left:3px solid var(--info); }
.kpi:nth-child(4) { border-left:3px solid var(--danger); }
.kpi .label { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); font-weight:600; display:flex; align-items:center; gap:5px; }
.kpi .val { font-size:24px; font-weight:800; letter-spacing:-0.02em; margin-top:5px; }
.bar { height:5px; background:color-mix(in srgb, var(--border) 55%, transparent); border-radius:999px; overflow:hidden; margin-top:9px; }
.bar > div { height:100%; background:var(--accent); border-radius:999px; }

/* ---- Leaders rail ------------------------------------------------------- */
.podium { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:16px 22px 0; max-width:1160px; margin:0 auto; width:100%; }
.pod-card { display:flex; align-items:center; gap:11px; padding:11px 13px; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); position:relative; }
.pod-card.first { border-color:${cfg.accentHex}55; background-image:linear-gradient(135deg, ${cfg.accentHex}12, transparent 62%); }
.pod-card .rank { font-size:10px; font-weight:700; color:var(--muted); font-family:'JetBrains Mono',ui-monospace,monospace; }
.ava { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:8px; background:${cfg.accentHex}1c; color:${cfg.accentHex}; font-weight:800; font-size:11px; flex:none; }
.ava.big { width:34px; height:34px; border-radius:10px; font-size:13px; }
.pod-info { flex:1; display:flex; flex-direction:column; min-width:0; } .pod-info b { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:-0.01em; } .pod-info .t { font-size:10px; color:var(--muted); }
.pod-pct { font-size:20px; font-weight:800; letter-spacing:-0.02em; }
.chip-top { position:absolute; top:-9px; right:10px; font-size:9px; font-weight:800; letter-spacing:1px; color:#000; background:${cfg.accentHex}; border-radius:999px; padding:2px 8px; display:inline-flex; align-items:center; gap:3px; }

/* ---- The board ----------------------------------------------------------- */
.stage { padding:14px 22px 0; max-width:1160px; margin:0 auto; width:100%; }
.board-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); padding:4px 10px 10px; overflow-x:auto; }
table.grid { width:100%; border-collapse:separate; border-spacing:4px; font-size:13px; }
table.grid th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.8px; color:var(--muted); padding:10px 8px 6px; font-weight:700; background:var(--bg); }
/* thead is deliberately NOT sticky: inside the .board-panel scroll wrapper,
   a viewport-tuned sticky offset pins the header ONTO the first data row
   (staff entry mode's tap target). Short tables lose nothing. */
table.grid th .mt { color:var(--muted); font-weight:600; font-size:10px; }
th.h-person, td.pcol { min-width:150px; }
td.pcol { padding:4px 8px; font-weight:700; }
.pname { letter-spacing:-0.01em; }
tr.total td { padding:6px 4px 2px; }
.tsum { display:flex; align-items:center; justify-content:space-between; gap:6px; border:1px solid var(--border); border-radius:8px; padding:6px 10px; background:var(--bg); }
.tsum .a { font-weight:800; font-size:13px; } .tsum .t { font-size:10px; color:var(--muted); font-weight:600; }
.cell { display:flex; align-items:center; justify-content:space-between; gap:6px; background:var(--bg); border:1px solid var(--border); border-radius:var(--r-sm); padding:9px 10px; cursor:pointer; transition:all .12s; min-height:44px; }
.cell:hover { border-color:${cfg.accentHex}88; transform:translateY(-1px); }
.cell .a { font-weight:800; font-size:15px; letter-spacing:-0.02em; } .cell .t { font-size:10px; color:var(--muted); font-weight:600; }
.cell.ok { border-color:rgba(52,211,153,.45); background:rgba(52,211,153,.07); }
.cell.short { border-color:rgba(248,113,113,.4); background:rgba(248,113,113,.05); }
.cell.dim { opacity:.22; filter:saturate(.4); }
.cell.hit { border-color:${cfg.accentHex}; box-shadow:0 0 0 2px ${cfg.accentHex}55; }
.badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid; font-weight:700; white-space:nowrap; }
.badge.ok { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.badge.warn { color:#f87171; border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.1); }
.badge.part { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.dot { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:5px; vertical-align:1px; }

/* ---- Footnotes: advisory + coaching ------------------------------------- */
.footnotes { padding:12px 22px 56px; max-width:1160px; margin:0 auto; width:100%; }
.advisory { font-size:12px; margin-bottom:10px; display:flex; align-items:center; gap:6px; }
.glist { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:8px; }
.gi { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); padding:11px 13px; font-size:12px; }
.gi b { display:block; font-size:12px; margin-bottom:2px; letter-spacing:-0.01em; }
.gi span { color:var(--muted); }

/* ---- Modal + toast ------------------------------------------------------- */
.modal { position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:center; justify-content:center; z-index:50; } .modal.open { display:flex; }
.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--accent); color:#000; padding:10px 20px; border-radius:10px; font-weight:700; display:none; z-index:60; } .toast.open { display:block; }

/* ---- Entry mode (staff role): scoped to one person's row. Owner chrome
   hidden; cells get bigger tap targets. ---------------------------------- */
body.entry .grid-4, body.entry #podium, body.entry tr.total, body.entry #syncBtn,
body.entry button[onclick="exportCsv()"], body.entry #search, body.entry #stockSec, body.entry #priceSec { display:none; }
body.entry table.grid { font-size:15px; }
body.entry .cell { padding:14px 12px; }
body.entry .cell .a { font-size:18px; }
/* ---- Staff Home: the worker's OWN screen, not the manager's minus things.
   One obvious action per metric, no jargon, no targets table. ------------- */
#staffHome { display:none; padding:4px 22px 64px; max-width:640px; margin:0 auto; }
body.entry #staffHome { display:block; }
body.entry .hero, body.entry .stage, body.entry .footnotes { display:none; }
body.entry main#mapView { padding-top:4px; }
.sh-greet { margin:10px 0 4px; }
.sh-hi { font-size:27px; font-weight:800; letter-spacing:-0.02em; display:block; }
.sh-sub { color:var(--muted); font-size:13.5px; display:block; margin-top:3px; }
.sh-cards { display:grid; gap:12px; margin:18px 0 6px; }
.sh-card { display:flex; align-items:center; gap:14px; width:100%; text-align:left; background:var(--surface); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:14px; padding:18px; color:var(--text); cursor:pointer; font:inherit; }
.sh-card:active { transform:scale(.98); }
.sh-name { font-weight:700; font-size:16.5px; display:block; }
.sh-goal { color:var(--muted); font-size:12.5px; display:block; margin-top:3px; }
.sh-val { margin-left:auto; font-size:25px; font-weight:800; font-variant-numeric:tabular-nums; }
.sh-note { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12.5px; margin-top:16px; }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } .podium { grid-template-columns:1fr; } .searchwrap { display:none; } }
</style>
${chromeCss(cfg.dark, cfg.accentHex)}
</head>
<body>
<header class="topbar">
  <div class="row brand">
    <div class="brand-tile">${logoOf(cfg.productName, cfg.logoText)}</div>
    <div class="brand"><b>${esc(cfg.productName)}</b><span class="muted tag">${esc(cfg.tagline)}</span></div>
  </div>
  <span class="meta-chip mono">${cfg.people.length} STAFF · ${cfg.metrics.length} METRICS · DAILY</span>
  <div class="searchwrap"><input id="search" class="input" placeholder="${esc(searchPh)}" aria-label="Search" oninput="render()"><span class="kbd">⌘K</span></div>
  <button class="btn" onclick="exportCsv()">${icon("download")} Export CSV</button>
  <button id="syncBtn" class="btn primary" onclick="sync()">${icon("upload")} Sync Report</button>
  <span id="syncState" class="sync-chip"></span>
</header>
<section class="hero">
  <div class="hero-side">
    <span class="hero-label">Today · <span id="heroDate"></span></span>
    <h1 class="hero-title">${esc(V.boardTitle || cfg.tagline)}</h1>
  </div>
  <div id="verdict"></div>
</section>
<section class="grid-4">
  <div class="kpi"><span class="label">${icon("trend-up", 13)} Team achievement</span><div class="val mono tint-accent" id="kpiAch">0%</div><div class="bar"><div id="barAch" style="width:0%"></div></div></div>
  <div class="kpi"><span class="label">${icon("check", 13)} Metrics on target</span><div class="val mono tint-ok" id="kpiOn">0 / 0</div></div>
  <div class="kpi"><span class="label">${icon("users", 13)} Reported today</span><div class="val mono tint-info" id="kpiRep">0 / 0</div></div>
  <div class="kpi"><span class="label">${icon("alert", 13)} Needs attention</span><div class="val mono tint-danger" id="kpiWarn">0</div></div>
  ${hasStock ? `<div class="kpi"><span class="label">${icon("clock", 13)} Reorder now</span><div class="val mono tint-warn" id="kpiReorder">0</div></div>` : ""}
  ${hasStock ? `<div class="kpi"><span class="label">${icon("calendar", 13)} Expiring</span><div class="val mono tint-danger" id="kpiExpiry">0</div></div>` : ""}
</section>
<main id="mapView">
  ${hasStock ? `<section id="stockSec" class="stock-sec">
    <div class="rail-title">${icon("clock", 13)} Stock &amp; Expiry Watchlist</div>
    <div class="board-card" style="margin-top:10px;padding:2px 10px"><div id="stockList"></div></div>
  </section>` : ""}
  <section id="staffHome">
    <div class="sh-greet"><span class="sh-hi" id="shHi"></span><span class="sh-sub" id="shSub"></span></div>
    <div class="sh-cards" id="shCards"></div>
    <div class="sh-note">${icon("check", 14)} <span>Everything saves on its own — you don't have to.</span></div>
  </section>
  <div id="podium" class="podium"></div>
  <div class="stage">
    <div class="board-card">
      <table class="grid" id="board"><thead id="thead"></thead><tbody id="tbody"></tbody></table>
    </div>
  </div>
  <div class="footnotes">
    <div class="muted advisory">${icon("lightbulb", 13)} ${cfg.advisory}</div>
    ${V.guidelines.length ? `<div class="glist">${V.guidelines.map(g => `<div class="gi"><b>${g.title}</b><span>${g.detail}</span></div>`).join("")}</div>` : ""}
  </div>
  ${hasPrice ? `<section id="priceSec" class="footnotes" style="padding-top:0">
    <div class="rail-title">${icon("money", 13)} Rate Card</div>
    <div class="board-card" style="margin-top:10px;padding:6px 14px">
      ${P.map(p => `<div class="stock-row"><span class="stock-name">${p.item}</span><span class="stock-qty">₹${p.price.toLocaleString("en-IN")}</span></div>`).join("")}
    </div>
  </section>` : ""}
</main>
<div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
  <div class="card" style="width:min(420px,92vw);border-radius:14px">
    <h3 style="margin:0 0 6px" id="modalTitle">Report</h3>
    <div class="muted mono" style="font-size:12px;margin-bottom:12px" id="modalTarget"></div>
    <input id="editF0" class="input" type="number" inputmode="numeric" enterkeyhint="done" style="width:100%;margin-bottom:10px" placeholder="Actual number" aria-label="Actual number">
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="applyEdit()">Apply</button>
    </div>
  </div>
</div>
<div id="toast" class="toast"></div>
<script>
var METRICS = ${mJson};
var PEOPLE = ${jstr(cfg.people.map(p => p.name))};
var STOCK = ${sJson};
var state = {}, editing = null;
function stockStateOf(i){
  var s = STOCK[i];
  if (/day/i.test(s.u)) return s.q <= s.m ? 'expired' : (s.q <= s.m + 2 ? 'soon' : 'ok'); // unit is shelf-life days
  return s.q <= s.m ? 'reorder' : 'ok';
}
function renderStock(){
  var el = document.getElementById('stockList'); if (!el || !STOCK.length) return;
  var reorder = 0, expiring = 0;
  el.innerHTML = STOCK.map(function(s, i){
    var st = stockStateOf(i);
    if (st === 'reorder') reorder++; if (st === 'expired' || st === 'soon') expiring++;
    var cls = st === 'reorder' ? 'badge warn' : st === 'expired' ? 'badge warn' : st === 'soon' ? 'badge part' : 'badge ok';
    var txt = st === 'reorder' ? 'REORDER' : st === 'expired' ? 'PAST MIN' : st === 'soon' ? 'SOON' : 'OK';
    return '<div class="stock-row"><span><span class="stock-name">' + s.n + '</span><span class="stock-sub"> · min ' + s.m + ' ' + s.u + '</span></span><span class="stock-qty mono" data-i="' + i + '">' + s.q + ' ' + s.u + ' <span class="' + cls + '">' + txt + '</span></span></div>';
  }).join('');
  var kr = document.getElementById('kpiReorder'); if (kr) kr.innerText = String(reorder);
  var ke = document.getElementById('kpiExpiry'); if (ke) ke.innerText = String(expiring);
}
function openStock(i){
  editing = { stock: i };
  var s = STOCK[i];
  document.getElementById('modalTitle').innerText = 'Update · ' + s.n;
  document.getElementById('modalTarget').innerText = 'Min: ' + s.m + ' ' + s.u + ' · Currently: ' + s.q + ' ' + s.u;
  var f = document.getElementById('editF0'); f.value = String(s.q); f.setAttribute('aria-label', 'Quantity of ' + s.n);
  document.getElementById('modal').classList.add('open'); f.focus();
}
var LS_KEY = 'opsdesk_console_state';
var IC_TOP = '${icon("zap", 11)}';
var HUE = {};
METRICS.forEach(function(m, i){ HUE[m.k] = Math.round((i * 137.5) % 360); });
var ENTRY = null; // staff role: this console is scoped to one person
function setEntry(n){ ENTRY = PEOPLE.find(function(p){ return p === n; }) || null; if (ENTRY) document.body.classList.add('entry'); }
function peopleNow(){ return ENTRY ? [ENTRY] : PEOPLE; }
var touched = {}; // cells edited locally this session — remote hydrate must not clobber them
var HZ = ${H ? jstr({ onPct: H.onTargetPct, paceHour: H.paceHour, minPace: H.minPacePct }) : "null"};
function initOf(n){ return n.split(/\\s+/).map(function(w){ return (w[0] || '').toUpperCase(); }).join('').slice(0, 2); }
function renderPodium(achMap, onMap){
  var ranked = PEOPLE.map(function(n){ return { n: n, a: Math.round(achMap[n] / Math.max(1, METRICS.length)), o: onMap[n] || 0 }; }).sort(function(x, y){ return y.a - x.a; });
  var pod = document.getElementById('podium');
  if (!pod) return;
  pod.innerHTML = ranked.slice(0, 3).map(function(t, i){
    return '<div class="pod-card' + (i === 0 ? ' first' : '') + '">' + (i === 0 ? '<span class="chip-top">' + IC_TOP + ' TOP</span>' : '') +
      '<span class="rank">' + (i + 1) + '</span><span class="ava big">' + initOf(t.n) + '</span>' +
      '<div class="pod-info"><b>' + t.n + '</b><span class="t mono">' + t.o + '/' + METRICS.length + ' on target</span></div>' +
      '<span class="pod-pct mono ' + (t.a >= 100 ? 'tint-ok' : (t.a >= 70 ? 'tint-warn' : 'tint-danger')) + '">' + t.a + '%</span></div>';
  }).join('');
}
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
function loadLocal(){ try{ var r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function cellKey(n, k){ return n + '|' + k; }
function markTouched(n, k){ touched[cellKey(n, k)] = 1; saveLocal(); }
function seedDemo(){
  PEOPLE.forEach(function(n, pi){
    METRICS.forEach(function(m, mi){
      var roll = ((pi * 7 + mi * 13) % 10);
      var v = roll === 0 ? '' : (roll <= 6 ? m.t : Math.max(0, m.t - 1 - (roll % 3)));
      state[cellKey(n, m.k)] = String(v);
    });
  });
  saveLocal();
}
function achOf(n, k){
  var v = parseFloat(state[cellKey(n, k)]); var m = METRICS.find(function(x){ return x.k === k; });
  if (!m || isNaN(v) || v <= 0) return 0;
  return Math.min(150, Math.round(100 * v / m.t));
}
function render(){
  var th = document.getElementById('thead');
  th.innerHTML = '<tr><th class="h-person">Employee</th>' + METRICS.map(function(m){ return '<th class="h-metric"><i class="dot" style="background:hsl(' + HUE[m.k] + ',70%,55%)"></i>' + m.l + ' <span class="mono mt">/' + m.t + '</span></th>'; }).join('') + '<th class="h-day">Day</th></tr>';
  var tb = document.getElementById('tbody'); tb.innerHTML = '';
  var Q = (document.getElementById('search').value || '').toLowerCase();  var on = 0, rep = 0, warn = 0, achSum = 0, cells = 0;
  var achMap = {}, onMap = {};
  peopleNow().forEach(function(n){
    var row = '<tr class="prow"><td class="pcol"><span class="ava">' + initOf(n) + '</span> <span class="pname">' + n + '</span></td>';
    var pAch = 0, pOn = 0;
    METRICS.forEach(function(m){
      var raw = state[cellKey(n, m.k)]; var a = achOf(n, m.k);
      if (raw !== '' && raw != null) rep++;
      var cls = a >= 100 ? 'ok' : (raw && a >= 70 ? 'part' : 'short');
      if (a >= 100) on++; else if (raw) warn++;
      if (raw) { achSum += a; cells++; pAch += a; if (a >= 100) pOn++; }
      row += '<td><div class="cell ' + cls + (Q && (n + ' ' + m.l).toLowerCase().indexOf(Q) === -1 ? ' dim' : '') + (Q && (n + ' ' + m.l).toLowerCase().indexOf(Q) !== -1 ? ' hit' : '') + '" data-p="' + n + '" data-k="' + m.k + '"><span class="a mono">' + (raw === '' || raw == null ? '—' : raw) + '</span><span class="t mono">' + a + '%</span></div></td>';
    });
    row += '<td class="pday"><span class="badge ' + (pAch >= METRICS.length * 100 ? 'ok' : pAch >= METRICS.length * 70 ? 'part' : 'warn') + '">' + Math.round(pAch / Math.max(1, METRICS.length)) + '%</span></td>';
    tb.insertAdjacentHTML('beforeend', row + '</tr>');
    achMap[n] = pAch; onMap[n] = pOn;
  });
  if (!ENTRY) renderPodium(achMap, onMap);
  var pctAch = cells ? Math.round(achSum / cells) : 0;
  if (!ENTRY) {
  var tot = '<tr class="total"><td class="pcol muted" style="font-weight:700">TEAM</td>';
  METRICS.forEach(function(m){
    var sum = 0, any = false;
    PEOPLE.forEach(function(n){ var v = parseFloat(state[cellKey(n, m.k)]); if (!isNaN(v) && v > 0){ sum += v; any = true; } });
    var pct = Math.round(100 * sum / (m.t * PEOPLE.length));
    tot += '<td><div class="tsum"><span class="a mono">' + (any ? sum : '—') + '</span><span class="t mono" style="color:' + (pct >= 100 ? '#34d399' : pct >= 70 ? '#fbbf24' : '#f87171') + '">' + pct + '%</span></div></td>';
  });
  tot += '<td></td></tr>';
  tb.insertAdjacentHTML('beforeend', tot);
  }
  document.getElementById('kpiAch').innerText = pctAch + '%';
  document.getElementById('barAch').style.width = Math.min(100, pctAch) + '%';
  document.getElementById('kpiOn').innerText = on + ' / ' + (METRICS.length * PEOPLE.length);
  document.getElementById('kpiRep').innerText = rep + ' / ' + (METRICS.length * PEOPLE.length);
  document.getElementById('kpiWarn').innerText = warn;
  var vd = document.getElementById('verdict');
  if (vd){
    if (ENTRY || !HZ){ vd.style.display = 'none'; }
    else {
      var hr = new Date().getHours();
      if (hr >= 9 && hr < HZ.paceHour){
        var dayFrac = (hr - 9) / (HZ.paceHour - 9) * (HZ.minPace / 100);
        if (dayFrac > 0.05){
          var proj = Math.round(pctAch / dayFrac);
          var tone = proj >= 100 ? '#34d399' : (proj >= HZ.onPct ? '#fbbf24' : '#f87171');
          var atRisk = peopleNow().filter(function(n){ return (achMap[n] || 0) / METRICS.length < Math.max(30, dayFrac * 100); });
          vd.innerHTML = '<span class="vbig" style="color:' + tone + '">' + proj + '%</span><span class="vtxt">projected by ' + HZ.paceHour + ':00 at this pace' + (atRisk.length ? ' · <span style="color:#f87171">Needs push: ' + atRisk.join(', ') + '</span>' : ' · everyone on pace') + '</span>';
          vd.style.display = 'flex'; vd.style.borderLeftColor = tone;
        } else { vd.style.display = 'none'; }
      } else { vd.style.display = 'none'; }
    }
  }
  if (ENTRY) renderStaffHome();
}
function renderStaffHome(){
  if (!ENTRY) return;
  var hi = document.getElementById('shHi'); if (!hi) return;
  hi.textContent = 'Hi ' + ENTRY;
  var done = 0;
  METRICS.forEach(function(m){ if (state[cellKey(ENTRY, m.k)]) done++; });
  document.getElementById('shSub').textContent = done ? done + ' of ' + METRICS.length + ' done today — nice pace' : 'Tap a card to report your first number';
  document.getElementById('shCards').innerHTML = METRICS.map(function(m){
    var v = state[cellKey(ENTRY, m.k)];
    var pct = Math.min(100, Math.round(100 * (parseFloat(v) || 0) / m.t));
    return '<button class="sh-card" data-k="' + m.k + '"><span><span class="sh-name">' + m.l + '</span><span class="sh-goal">Goal: ' + m.t + ' a day' + (pct ? ' · ' + pct + '%' : '') + '</span></span><span class="sh-val mono">' + (v || '—') + '</span></button>';
  }).join('');
}
document.getElementById('shCards').addEventListener('click', function(ev){
  var c = ev.target.closest('.sh-card'); if (!c || !ENTRY) return;
  openModal(ENTRY, c.getAttribute('data-k'));
});
function openModal(n, k){
  if (ENTRY && n !== ENTRY) return; // staff touch only their own row
  editing = { n: n, k: k };
  var m = METRICS.find(function(x){ return x.k === k; });
  document.getElementById('modalTitle').innerText = n + ' · ' + m.l;
  document.getElementById('modalTarget').innerText = 'Target: ' + m.t + ' / day · Currently: ' + (state[cellKey(n, k)] || 'not reported');
  document.getElementById('editF0').value = state[cellKey(n, k)] || '';
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
function applyEdit(){
  if (!editing) return;
  if (editing.stock !== undefined){
    var v = parseFloat(document.getElementById('editF0').value);
    if (!isNaN(v)) STOCK[editing.stock].q = Math.max(0, v);
    renderStock(); closeModal(); toast(ENTRY ? 'Saved ✓' : 'Saved'); return;
  }
  state[cellKey(editing.n, editing.k)] = document.getElementById('editF0').value.trim();
  markTouched(editing.n, editing.k);
  render(); closeModal(); toast(ENTRY ? 'Saved ✓' : 'Saved'); PERSIST.schedule();
}
function toast(m){ var t = document.getElementById('toast'); t.innerText = m; t.classList.add('open'); setTimeout(function(){ t.classList.remove('open'); }, 2000); }
document.getElementById('tbody').addEventListener('click', function(ev){
  var c = ev.target.closest('.cell'); if (!c) return;
  openModal(c.getAttribute('data-p'), c.getAttribute('data-k'));
});
(function(){ var sl = document.getElementById('stockList'); if (!sl) return; sl.addEventListener('click', function(ev){
  var q = ev.target.closest('.stock-qty'); if (!q || ENTRY) return; // staff view hides this section
  openStock(parseInt(q.getAttribute('data-i'), 10));
}); })();
function buildRecords(){
  // Full snapshot, always — entry mode scopes the VIEW, never the ledger.
  return PEOPLE.map(function(n){
    var r = { employee: n, report_date: new Date().toISOString().slice(0, 10) };
    METRICS.forEach(function(m){ r[m.k] = parseFloat(state[cellKey(n, m.k)]) || 0; });
    return r;
  });
}
async function sync(){
  var btn = document.getElementById('syncBtn'); btn.innerText = 'Syncing…';
  try {
    if (typeof window.__opsDeskSubmit__ === 'function') {
      await window.__opsDeskSubmit__({ records: buildRecords() });
      toast('Synced to OpsDesk');
    } else { toast('Saved locally'); }
  } catch (e) { toast('Sync failed'); }
  btn.innerText = 'Sync Report';
}
// Engine 2: the ledger is the console's memory. Boot hydrates from the latest
// confirmed event (applyLoaded merges server records into seeded state); every
// edit auto-persists a full snapshot through the same submit bridge.
function applyLoaded(records){
  if (!records || !records.length) return;
  records.forEach(function(r){
    if (!r || !r.employee) return;
    var name = PEOPLE.find(function(p){ return p === r.employee; });
    if (!name) return;
    METRICS.forEach(function(m){ if (touched[cellKey(name, m.k)]) return; if (r[m.k] !== undefined && r[m.k] !== null) state[cellKey(name, m.k)] = String(r[m.k]); });
  });
  saveLocal();
}
var PERSIST = (function(){
  var timer = null;
  var dirty = false;
  function say(msg){ var e = document.getElementById('syncState'); if (e) e.innerText = msg || ''; }
  function schedule(){
    dirty = true;
    if (timer) clearTimeout(timer);
    say('Saving…');
    timer = setTimeout(push, 1200);
  }
  async function push(){
    if (typeof window.__opsDeskSubmit__ !== 'function') { say(''); return; }
    try { await window.__opsDeskSubmit__({ records: buildRecords() }); say(ENTRY ? 'Sent to boss ✓' : 'Synced'); setTimeout(function(){ say(''); }, 2500); }
    catch (e) { say('Save failed'); }
  }
  async function hydrate(boot){
    if (dirty) return; // local edits win; the pending autosave lands shortly
    if (typeof window.__opsDeskLoad__ !== 'function') return;
    try {
      var res = await window.__opsDeskLoad__();
      if (dirty) return; // edit landed while fetching — local state wins
      if (res && res.ok){
        if (res.role === 'staff' && (res.staffName || res.filledBy)) setEntry(res.staffName || res.filledBy); // entry mode before first paint
        if (res.records && res.records.length){
          applyLoaded(res.records);
          if (!boot){ render(); say('Loaded'); setTimeout(function(){ say(''); }, 2500); }
        }
      }
    } catch (e) { /* first boot / offline: keep seed */ }
  }
  return { schedule: schedule, hydrate: hydrate, push: push };
})();
function exportCsv(){
  var rows = [['employee'].concat(METRICS.map(function(m){ return m.k; }))];
  PEOPLE.forEach(function(n){ rows.push([n].concat(METRICS.map(function(m){ return state[cellKey(n, m.k)] || 0; }))); });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'daily-report.csv'; a.click();
  toast('Exported CSV');
}
(function boot(){
  var s = loadLocal(); if (s && Object.keys(s).length) state = s; else seedDemo();
  var hd = document.getElementById('heroDate');
  if (hd) hd.textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  PERSIST.hydrate(true).then(render);
  renderStock();
})();
</script>
</body>
</html>`;
}
