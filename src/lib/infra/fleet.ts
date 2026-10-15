// Archetype #6: Fleet/Asset Tracker — assets × status × meter readings ×
// service-due intelligence. Same doctrine: the model chooses nouns (asset
// names, status labels, owners, readings); ALL behavior lives here as proven
// code. Contract parity: #modal/.open mechanics, #editF0 focus,
// __opsDeskSubmit__ bridge, storage-shim persistence, toast, spotlight dim/hit,
// #auditBanner.
//
// Schema doctrine: nested arrays ≤3 properties, everything required, no
// .default()/.optional(), scalars first / arrays last. The model proposes
// {name, status, owner, reading} (4 props exceeds the Gemini limit on nested
// arrays, so the platform splits the ask): reading comes from the separate
// flat-objects array; service thresholds are a platform concern.
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { esc, jstr } from "./escape";
import { logoOf } from "./branding";
import { chromeFonts, chromeCss, icon } from "./chrome";

export const FleetSchema = z.object({
  productName: z.string().describe("Short invented product name, e.g. 'FleetPulse'"),
  logoText: z.string().min(1),
  tagline: z.string(),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dark: z.boolean(),
  searchHint: z.string(),
  advisory: z.string(),
  serviceEvery: z.number().positive().describe("Service interval, in the same unit as readings (km or hours)"),
  serviceUnit: z.string().default("km").describe("Unit for the meter: 'km' for vehicles, 'hours' for machines/runtime"),
  statuses: z.array(z.object({ label: z.string() })).min(2).max(6).describe("Asset lifecycle statuses, e.g. Running, Idle, Maintenance"),
  assets: z.array(z.object({
    name: z.string(),
    status: z.string(),
    owner: z.string(),
    lastService: z.number().nonnegative().optional().describe("Meter value at last service. Invent a plausible value per machine; at least one should be near the interval boundary (service coming due)").default(0),
  })).min(3).max(40).describe("Assets; status must EXACTLY match a statuses label; owner is the person responsible"),
  readings: z.array(z.object({
    asset: z.string(),
    value: z.number().positive(),
  })).max(40).describe("Latest meter reading per asset; asset must EXACTLY match an assets name"),
  voice: z.object({
    boardTitle: z.string().describe("Insider name for the fleet view, e.g. 'Yard Status', 'Machine Hall', 'Bay Line-Up'"),
    assetNoun: z.string().describe("What one asset is called here, e.g. 'tractor', 'truck', 'machine'"),
    searchExamples: z.array(z.string()).max(5).describe("What an owner types, e.g. 'TK-101', 'hydraulic', 'Idle'"),
    guidelines: z.array(z.object({ title: z.string(), detail: z.string() })).max(3).describe("Trade coaching: servicing rhythm, downtime discipline, operator checks — in THIS trade's words"),
  }).describe("Domain voice — the fleet view must read like this industry's own yard board").optional(),
  heuristics: z.object({
    runTargetPct: z.number().min(20).max(100).describe("Share of fleet Running for a healthy operation (e.g. 70)"),
  }).describe("Judgment as numbers — drives the fleet health verdict").optional(),
});

export type FleetConfig = z.infer<typeof FleetSchema>;

export async function extractFleetConfig(userPrompt: string): Promise<FleetConfig> {
  return generateWithRepair<FleetConfig>({
        prompt: `A manager described equipment/vehicles they track. Extract the fleet config.

MANAGER: "${userPrompt}"

Rules:
- statuses: 3-4 lifecycle labels (e.g. Running, Idle, Maintenance).
- assets: verbatim if named, else invent 6-12 realistic for the domain. status must EXACTLY match a statuses label; make most Running, at least one Idle and one Maintenance. owner: responsible person ("" if unknown).
- readings: one per asset (asset must EXACTLY match an assets name). Values are odometer km for vehicles or runtime hours for machines — realistic and varied. Include at least one asset whose value is close to a multiple of serviceEvery (service coming due).
- serviceEvery: sensible interval for the domain (e.g. 10000 km for trucks, 500 hours for machines). serviceUnit: 'km' for vehicles, 'hours' for machines. lastService per asset: meter value when it was last serviced — the service clock is measured FROM here, not from zero.
- accentHex: a #rrggbb hex color suited to the domain. dark: true unless told otherwise.
- tagline: one short line. searchHint: what to search. advisory: one domain best-practice tip for keeping assets healthy. productName: invented, e.g. 'FleetPulse'.
- VOICE — make the console speak this trade's language: boardTitle (insider name for the fleet view), assetNoun (what one asset is called here), searchExamples (real ids/terms typed here), guidelines (2-3 coaching tips with this trade's vocabulary and reasons).
- HEURISTICS — judgment as numbers: runTargetPct (share of fleet that should be Running for a healthy operation in this trade, e.g. 70).`,
      },
      FleetSchema,
      5);
}

export function assembleFleet(cfg: FleetConfig): string {
  const theme = cfg.dark
    ? { bg: "#0f172a", surface: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", input: "#0b1220" }
    : { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#ffffff" };
  const stJson = jstr(cfg.statuses.map(s => s.label));
  // Assets: model gives {name, status, owner, lastService}; platform attaches
  // reading (flat-objects array, keyed by asset name). lastService seeds the
  // honest service clock: since = meter − lastService (clamped ≥ 0).
  const rMap: Record<string, number> = {};
  for (const r of cfg.readings) if (rMap[r.asset] === undefined) rMap[r.asset] = r.value;
  const aJson = jstr(cfg.assets.map(a => ({ n: a.name, s: a.status, o: a.owner || "", r: rMap[a.name] ?? 0, ls: Math.max(0, a.lastService ?? 0) })));
  // Voice + heuristics: the trade's words and judgment-as-numbers. Both
  // optional with generic fallbacks so pre-voice configs keep assembling.
  const V = cfg.voice ?? { boardTitle: "Fleet Status Mix", assetNoun: "asset", searchExamples: [] as string[], guidelines: [] as { title: string; detail: string }[] };
  const H = cfg.heuristics ?? null;
  const searchPh = (V.searchExamples.length ? V.searchExamples.join(", ") : cfg.searchHint);

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
body { background:var(--bg); color:var(--text); font-family:'Inter',system-ui,sans-serif; margin:0; font-size:14px; line-height:1.45; background-image:linear-gradient(${cfg.dark ? "rgba(148,163,184,.06) 1px, transparent 1px" : "rgba(15,23,42,.04) 1px, transparent 1px"}),linear-gradient(90deg,${cfg.dark ? "rgba(148,163,184,.06) 1px, transparent 1px" : "rgba(15,23,42,.04) 1px, transparent 1px"}); background-size:28px 28px; }
.mono { font-family:'JetBrains Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; }
::-webkit-scrollbar { width:6px; height:8px; } ::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
::selection { background:var(--accent); color:#000; }
.row { display:flex; align-items:center; gap:12px; } .spread { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--border); border-bottom:1px solid var(--border); }
.btn { padding:8px 16px; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--text); cursor:pointer; font-weight:600; }
.btn.primary { background:var(--accent); color:#000; border-color:var(--accent); }
.input { padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:var(--input); color:var(--text); }
.muted { color:var(--muted); }
.kbd { font-family:ui-monospace,monospace; font-size:10px; border:1px solid var(--border); border-bottom-width:2px; border-radius:4px; padding:1px 6px; color:var(--muted); }
.kpi { padding:13px 18px 14px; background:var(--bg); }
.kpi:nth-child(1) { border-left:3px solid var(--accent); }
.kpi:nth-child(2) { border-left:3px solid var(--ok); }
.kpi:nth-child(3) { border-left:3px solid var(--danger); }
.kpi:nth-child(4) { border-left:3px solid var(--info); }
.kpi .label { font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:1px; font-weight:600; display:flex; align-items:center; gap:5px; }
.kpi .val { font-size:24px; font-weight:800; letter-spacing:-0.02em; margin-top:4px; }
.badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid; font-weight:700; white-space:nowrap; }
.badge.st-0 { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.badge.st-1 { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.badge.st-2 { color:#38bdf8; border-color:rgba(56,189,248,.3); background:rgba(56,189,248,.1); }
.badge.st-3 { color:#a78bfa; border-color:rgba(167,139,250,.3); background:rgba(167,139,250,.1); }
.badge.st-4 { color:#f87171; border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.1); }
.badge.st-5 { color:#94a3b8; border-color:rgba(148,163,184,.3); background:rgba(148,163,184,.1); }
.badge.svc-due { color:#f87171; border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.1); }
.badge.svc-soon { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.badge.svc-ok { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.banner { display:none; margin-bottom:12px; padding:10px 14px; border-radius:10px; border:1px solid rgba(248,113,113,.35); background:rgba(248,113,113,.08); color:#f87171; font-size:13px; font-weight:600; align-items:center; gap:10px; }
.banner.open { display:flex; }
.chips { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
.chip { font-size:11px; padding:4px 10px; border-radius:999px; border:1px solid var(--border); background:var(--surface); cursor:pointer; font-weight:600; color:var(--muted); }
.chip.on { color:#000; background:var(--accent); border-color:var(--accent); }
.acard { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 14px; cursor:pointer; transition:all .12s; }
.acard:hover { border-color:${cfg.accentHex}88; transform:translateY(-1px); }
.acard.dim { opacity:.25; }
.acard.hit { border-color:${cfg.accentHex}; box-shadow:0 0 0 2px ${cfg.accentHex}55; }
.agrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px; }
.acard .t { font-weight:700; font-size:14px; margin-bottom:4px; }
.acard .m { font-size:11px; color:var(--muted); display:flex; justify-content:space-between; margin-top:6px; }
.svcbar { height:5px; border-radius:3px; background:var(--bg); border:1px solid var(--border); overflow:hidden; margin-top:8px; }
.svcbar div { height:100%; }
.modal { position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:center; justify-content:center; z-index:50; } .modal.open { display:flex; }
.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--accent); color:#000; padding:10px 20px; border-radius:10px; font-weight:700; display:none; z-index:60; } .toast.open { display:block; }
.sync-chip { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid var(--border); color:var(--muted); font-weight:600; white-space:nowrap; } .sync-chip:empty { display:none; }
.meta-chip { font-size:10px; padding:2px 8px; border:1px solid var(--border); border-radius:999px; color:var(--muted); letter-spacing:.8px; font-weight:600; white-space:nowrap; }
.glist { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:8px; margin-bottom:12px; }
.gi { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 12px; font-size:12px; }
.gi b { display:block; font-size:12px; margin-bottom:2px; }
.gi span { color:var(--muted); }
#verdict { flex:1; display:none; align-items:center; gap:14px; border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:var(--r-md); padding:12px 18px; background:var(--surface); min-height:64px; font-size:13.5px; font-weight:600; line-height:1.5; }
.vbig { font-family:'JetBrains Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; font-size:30px; font-weight:800; letter-spacing:-0.03em; flex:none; }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } }
/* Entry mode (staff role): the driver sees only their own vehicle. */
.acard { scroll-margin-top: 96px; }
body.entry .grid-4, body.entry #distCard, body.entry #chips, body.entry #syncBtn,
body.entry button[onclick="exportCsv()"], body.entry #search, body.entry #auditBanner { display:none; }
body.entry .acard { border-width:2px; }
/* ---- Staff Home: the driver's OWN screen. Vehicle card + one big number
   field, friendly statuses, no fleet jargon. ------------------------------ */
#staffHome { display:none; padding:4px 22px 64px; max-width:640px; margin:0 auto; }
body.entry #staffHome { display:block; }
body.entry .hero, body.entry .stage, body.entry .lifecycle { display:none; }
body.entry main#mapView { padding-top:4px; }
.sh-greet { margin:10px 0 4px; }
.sh-hi { font-size:27px; font-weight:800; letter-spacing:-0.02em; display:block; }
.sh-sub { color:var(--muted); font-size:13.5px; display:block; margin-top:3px; }
.sh-vehicle { background:var(--surface); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:14px; padding:18px; margin:18px 0 14px; }
.sh-vname { font-size:19px; font-weight:800; display:block; }
.sh-vmeta { display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:13px; }
.sh-vbadge { padding:3px 12px; border-radius:999px; font-weight:700; font-size:12px; }
.sh-field { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:18px; }
.sh-flabel { font-weight:700; font-size:15px; display:block; }
.sh-fhint { color:var(--muted); font-size:12.5px; display:block; margin-top:3px; }
.sh-meter { width:100%; font-size:30px; font-weight:800; text-align:center; padding:14px 10px; border-radius:12px; border:2px solid var(--border); background:var(--bg); color:var(--text); margin-top:12px; }
.sh-meter:focus { outline:none; border-color:var(--accent); }
.sh-save { width:100%; padding:16px; border-radius:14px; border:0; background:var(--accent); color:#000; font-size:17px; font-weight:800; margin-top:12px; cursor:pointer; }
.sh-save:active { transform:scale(.99); }
.sh-note { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12.5px; margin-top:16px; }
.dist-wrap { border:1px solid var(--border); border-radius:12px; background:var(--surface); padding:14px 16px 10px; margin-bottom:14px; }
.dist-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.rail-title { font-size:11px; font-weight:700; letter-spacing:1px; color:var(--muted); text-transform:uppercase; }
.dist { display:flex; height:16px; border-radius:8px; overflow:hidden; border:1px solid var(--border); }
.dist > div { height:100%; transition:width .35s ease; }
.dist-legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; font-size:10px; color:var(--muted); }
/* Shell — v2 design pass: topbar, verdict-first hero, stage, footnotes */
.topbar { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:14px; padding:10px 22px; border-bottom:1px solid var(--border); background:linear-gradient(180deg, ${cfg.dark ? "rgba(148,163,184,.06)" : "rgba(15,23,42,.03)"}, transparent 140%), var(--surface); }
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
.stage { margin-top:12px; }
.footnotes { margin-top:14px; }
.advisory { font-size:12px; margin-bottom:10px; display:flex; align-items:center; gap:6px; }
.acard { border-radius:var(--r-md); }
.dist-wrap { border-radius:var(--r-lg); }
.banner { border-radius:var(--r-md); }
.gi { border-radius:var(--r-md); }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } .searchwrap { display:none; } }
</style>
${chromeCss(cfg.dark, cfg.accentHex)}
</head>
<body>
<header class="topbar">
  <div class="row brand">
    <div class="brand-tile">${logoOf(cfg.productName, cfg.logoText)}</div>
    <div class="brand"><b>${esc(cfg.productName)}</b><span class="muted tag">${esc(cfg.tagline)}</span></div>
  </div>
  <span class="meta-chip mono">${cfg.assets.length} ASSETS · ${cfg.statuses.length} STATUSES</span>
  <div class="searchwrap"><input id="search" class="input" placeholder="${esc(searchPh)}" aria-label="Search" oninput="render()"><span class="kbd">⌘K</span></div>
  <button class="btn" onclick="exportCsv()">${icon("download")} Export CSV</button>
  <button id="syncBtn" class="btn primary" onclick="sync()">${icon("upload")} Sync Fleet</button>
  <span id="syncState" class="sync-chip"></span>
</header>
<section class="hero">
  <div class="hero-side">
    <span class="hero-label">Service every ${cfg.serviceEvery.toLocaleString()}</span>
    <h1 class="hero-title">${esc(V.boardTitle || cfg.tagline)}</h1>
  </div>
  <div id="verdict"></div>
</section>
<section class="grid-4">
  <div class="kpi"><span class="label">${icon("truck", 13)} Assets</span><div class="val mono" id="kpiN">0</div></div>
  <div class="kpi"><span class="label">${icon("zap", 13)} Running</span><div class="val mono tint-ok" id="kpiRun">0</div></div>
  <div class="kpi"><span class="label">${icon("wrench", 13)} Service due</span><div class="val mono tint-danger" id="kpiDue">0</div></div>
  <div class="kpi"><span class="label">${icon("chart", 13)} Avg meter</span><div class="val mono tint-info" id="kpiMeter">0</div></div>
</section>
<main id="mapView">
  <section id="staffHome">
    <div class="sh-greet"><span class="sh-hi" id="shHi"></span><span class="sh-sub" id="shSub"></span></div>
    <div class="sh-vehicle" id="shVehicle"></div>
    <div class="sh-field">
      <span class="sh-flabel">Today's meter reading</span>
      <span class="sh-fhint">Just the number on the dash — saves by itself</span>
      <input id="shMeter" class="sh-meter" type="number" inputmode="numeric" enterkeyhint="done" aria-label="Meter reading" placeholder="—">
      <button class="sh-save" id="shSave">Send to boss ✓</button>
      <button class="sh-save" id="shSvc" style="background:var(--surface);color:var(--text);border:1px solid var(--border);font-size:14px">Service done today — reset the clock</button>
    </div>
    <div class="sh-note">${icon("shield", 14)} <span>Don't worry about mistakes — the boss can fix anything.</span></div>
  </section>
  <div class="dist-wrap" id="distCard">
    <div class="dist-head"><span class="rail-title">${icon("truck", 13)} Fleet Status Mix</span><span class="mono muted" style="font-size:11px" id="distCount"></span></div>
    <div class="dist" id="distBar"></div>
    <div class="dist-legend" id="distLegend"></div>
  </div>
  <div class="lifecycle">
    <button class="btn primary" onclick="openAddAsset()">${icon("plus")} New Asset</button>
  </div>
  <div id="auditBanner" class="banner"><span>⚠</span><span id="auditText"></span></div>
  <div class="stage">
    <div id="chips" class="chips"></div>
    <div id="agrid" class="agrid"></div>
  </div>
  <div class="footnotes">
    <div class="muted advisory">${icon("lightbulb", 13)} ${cfg.advisory}</div>
    ${V.guidelines.length ? `<div class="glist">${V.guidelines.map(g => `<div class="gi"><b>${g.title}</b><span>${g.detail}</span></div>`).join("")}</div>` : ""}
  </div>
</main>
<div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
  <div class="card" style="width:min(440px,92vw);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px">
    <h3 style="margin:0 0 12px" id="modalTitle">Asset</h3>
    <input id="editF0" class="input" style="width:100%;margin-bottom:10px" placeholder="Name" aria-label="Name">
    <select id="stSel" class="input" aria-label="Status" style="width:100%;margin-bottom:10px"></select>
    <input id="editF1" class="input" style="width:100%;margin-bottom:10px" placeholder="Owner" aria-label="Owner">
    <input id="editF2" class="input" type="number" inputmode="numeric" enterkeyhint="done" style="width:100%;margin-bottom:10px" placeholder="Meter reading" aria-label="Meter reading">
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn danger-ghost" id="retireBtn" onclick="retireAsset()" style="display:none">${icon("archive")} Retire</button>
      <button class="btn danger-ghost" id="svcBtn" onclick="markServiced()">${icon("wrench")} Mark serviced</button>
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="applyEdit()">Apply</button>
    </div>
  </div>
</div>
<div id="toast" class="toast"></div>
<script>
var STATUSES = ${stJson};
var SERVICE_EVERY = ${cfg.serviceEvery};
var SERVICE_UNIT = ${jstr(cfg.serviceUnit || "km")};
var state = { assets: ${aJson} }, editing = null, stFilter = null;
var HZ = ${H ? jstr({ runTarget: H.runTargetPct }) : "null"};
var UNIT = ${jstr(V.assetNoun)};
var touched = {}; // asset fields edited locally this session — remote hydrate must not clobber them
var LS_KEY = 'opsdesk_console_state';
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
function loadLocal(){ try{ var r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function svcState(a){
  // HONEST SERVICE CLOCK (v2): since = meter − lastService, not meter % interval.
  // The old modulo math made a machine serviced yesterday look identical to one
  // 4,750 hours into its interval. lastService (seeded at extraction, updated by
  // the Mark-serviced action) is the real zero of the clock.
  if (!a.r) return { cls: 'svc-ok', txt: 'No meter', pct: 0, left: 0, since: 0 };
  // Baseline honesty ladder: a real lastService baseline is the clock's zero;
  // WITHOUT one (legacy rows, model omitted it) fall back to the modulo
  // heuristic — never report OVERDUE off a baseline we don't actually have.
  var base = (typeof a.ls === 'number' && a.ls > 0 && a.ls <= a.r) ? a.ls : (a.r % SERVICE_EVERY);
  var since = a.r - base;
  var left = SERVICE_EVERY - since;
  var pct = Math.max(0, Math.min(100, Math.round(since / SERVICE_EVERY * 100)));
  var u = ' ' + SERVICE_UNIT;
  if (since >= SERVICE_EVERY) return { cls: 'svc-due', txt: 'Service OVERDUE by ' + (since - SERVICE_EVERY).toLocaleString() + u, pct: pct, left: left, since: since };
  if (left <= SERVICE_EVERY * 0.1) return { cls: 'svc-due', txt: 'Service DUE in ' + left.toLocaleString() + u, pct: pct, left: left, since: since };
  if (left <= SERVICE_EVERY * 0.25) return { cls: 'svc-soon', txt: 'Service in ' + left.toLocaleString() + u, pct: pct, left: left, since: since };
  return { cls: 'svc-ok', txt: 'Service in ' + left.toLocaleString() + u, pct: pct, left: left, since: since };
}
function svcColor(cls){ return cls === 'svc-due' ? '#f87171' : (cls === 'svc-soon' ? '#fbbf24' : '#34d399'); }
/* Staff Home — the driver's own screen. Renders the assigned vehicle with
   plain-language status ('Service soon', friendly colors) and ONE big meter
   field. Writes through the same touched-guarded save path as the owner. */
function renderStaffHome(){
  if (!ENTRY) return;
  var a = ENTRY; if (!a) return;
  var hi = document.getElementById('shHi'); if (!hi) return;
  hi.textContent = 'Hi ' + (a.o || 'there');
  var svc = svcState(a);
  document.getElementById('shSub').textContent = a.n + (a.r ? ' · ' + a.r.toLocaleString() + ' on the meter' : ' · no reading yet today');
  document.getElementById('shVehicle').innerHTML = '<span class="sh-vname">' + a.n + '</span>'
    + '<div class="sh-vmeta"><span>' + (svc.txt.replace('Service ', '') || 'All good') + '</span><span class="sh-vbadge" style="background:' + svcColor(svc.cls) + '22;color:' + svcColor(svc.cls) + '">' + (svc.cls === 'svc-due' ? 'Service due' : (svc.cls === 'svc-soon' ? 'Service soon' : 'All good')) + ' </span></div>'
    + '<div class="svcbar" style="margin-top:12px"><div style="width:' + svc.pct + '%;background:' + svcColor(svc.cls) + '"></div></div>';
  var m = document.getElementById('shMeter');
  if (m && document.activeElement !== m && String(a.r || '') !== m.value) m.value = a.r || '';
}
function staffHomeSave(){
  if (!ENTRY) return;
  var v = parseFloat(document.getElementById('shMeter').value);
  if (isNaN(v) || v <= 0) { toast('Type the number on the dash first'); return; }
  ENTRY.r = v;
  touched['n|' + ENTRY.n] = 1; touched['s|' + ENTRY.n] = 1; touched['o|' + ENTRY.n] = 1; touched['r|' + ENTRY.n] = 1;
  saveLocal(); render(); toast('Sent to boss ✓'); PERSIST.schedule();
}
function render(){
  var Q = (document.getElementById('search').value || '').toLowerCase();
  var chips = document.getElementById('chips');
  chips.innerHTML = '<span class="chip' + (stFilter === null ? ' on' : '') + '" onclick="setFilter(null)">All</span>' + STATUSES.map(function(s){ return '<span class="chip' + (stFilter === s ? ' on' : '') + '" onclick="setFilter(\\'' + s.replace(/'/g, "\\\\'") + '\\')">' + s + '</span>'; }).join('');
  var grid = document.getElementById('agrid'); grid.innerHTML = '';
  var running = 0, due = 0, meterSum = 0, meterN = 0, firstDue = null;
  var stCounts = STATUSES.map(function(){ return 0; });
  assetsNow().forEach(function(a, idx){
    var svc = svcState(a);
    if (a.s === STATUSES[0]) running++;
    if (svc.cls === 'svc-due') { due++; if (!firstDue) firstDue = a; }
    if (a.r) { meterSum += a.r; meterN++; }
    var hay = (a.n + ' ' + a.o + ' ' + a.s).toLowerCase();
    var hit = Q && hay.indexOf(Q) !== -1;
    var vis = (stFilter === null || a.s === stFilter);
    var stIdx = Math.max(0, STATUSES.indexOf(a.s));
    stCounts[stIdx] = (stCounts[stIdx] || 0) + 1;
    var card = document.createElement('div');
    card.className = 'acard' + (hit ? ' hit' : (Q && !hit ? ' dim' : '')) + (vis ? '' : ' dim');
    card.innerHTML = '<div class="spread"><div class="t">' + a.n + '</div><span class="badge st-' + stIdx + '">' + a.s + '</span></div>'
      + '<div class="m"><span>' + (a.o || '—') + '</span><span class="mono">' + (a.r ? a.r.toLocaleString() : '—') + '</span></div>'
      + '<div class="m"><span class="badge ' + svc.cls + '">' + svc.txt + '</span></div>'
      + '<div class="svcbar"><div style="width:' + svc.pct + '%;background:' + svcColor(svc.cls) + '"></div></div>';
    card.onclick = (function(i){ return function(){ openModal(i); }; })(idx);
    grid.appendChild(card);
  });
  if (!ENTRY) renderDist(stCounts);
  if (ENTRY) return; // entry view: card only, no fleet-wide numbers
  document.getElementById('kpiRun').innerText = running;
  document.getElementById('kpiDue').innerText = due;
  document.getElementById('kpiMeter').innerText = meterN ? Math.round(meterSum / meterN).toLocaleString() : '—';
  var ab = document.getElementById('auditBanner');
  ab.classList.toggle('open', due > 0);
  if (due > 0 && firstDue) document.getElementById('auditText').innerText = due + ' asset' + (due > 1 ? 's' : '') + ' at service-due threshold — starting with ' + firstDue.n + '. Book maintenance before it fails on the floor.';
  var vd = document.getElementById('verdict');
  if (vd){
    if (ENTRY || !HZ){ vd.style.display = 'none'; }
    else {
      var runPct = Math.round(100 * running / Math.max(1, state.assets.length));
      var soon = 0;
      state.assets.forEach(function(a){ if (svcState(a).cls === 'svc-soon') soon++; });
      var tone = runPct >= HZ.runTarget ? '#34d399' : (runPct >= HZ.runTarget * 0.7 ? '#fbbf24' : '#f87171');          vd.innerHTML = '<span class="vbig" style="color:' + tone + '">' + runPct + '%</span><span>of the ' + (UNIT || 'fleet') + ' is Running' + (soon ? ' · ' + soon + ' needing service soon' : '') + (runPct < HZ.runTarget ? ' · below the ' + HZ.runTarget + '% health line' : '') + '</span>';
      vd.style.display = 'flex'; vd.style.borderLeftColor = tone;
    }
  }
}
function setFilter(s){ stFilter = s; render(); }
var ENTRY = null; // staff role: the driver whose view this is
function setEntry(n){ ENTRY = state.assets.find(function(a){ return a.o === n; }) || null; if (ENTRY) document.body.classList.add('entry'); renderStaffHome(); }
(function wireStaffHome(){
  var b = document.getElementById('shSave');
  if (b) b.onclick = staffHomeSave;
  var sv = document.getElementById('shSvc');
  if (sv) sv.onclick = function(){
    if (!ENTRY) return;
    ENTRY.ls = ENTRY.r || ENTRY.ls || 0;
    touched['ls|' + ENTRY.n] = 1;
    saveLocal(); renderStaffHome(); toast('Service logged ✓ — clock reset'); PERSIST.schedule();
  };
  var mi = document.getElementById('shMeter');
  if (mi) mi.oninput = function(){ document.getElementById('shSave').textContent = 'Send to boss ✓'; };
})();
function assetsNow(){ return ENTRY ? [ENTRY] : state.assets; }
function openModal(idx){
  if (ENTRY && state.assets[idx] !== ENTRY) return; // staff touch only their own vehicle
  editing = idx;
  LIFECYCLE = { mode: 'edit', sel: idx };
  document.getElementById('retireBtn').style.display = '';
  document.getElementById('svcBtn').style.display = '';
  var a0 = state.assets[idx];
  var selPre = document.getElementById('stSel');
  setTimeout(function(){ if (selPre && !Array.prototype.some.call(selPre.options, function(o){ return o.value === a0.s; })) { var o = document.createElement('option'); o.value = a0.s; o.text = a0.s; selPre.appendChild(o); o.selected = true; } }, 0);
  var a = state.assets[idx];
  document.getElementById('modalTitle').innerText = a.n;
  document.getElementById('editF0').value = a.n;
  var sel = document.getElementById('stSel'); sel.innerHTML = '';
  STATUSES.forEach(function(s){ var o = document.createElement('option'); o.value = s; o.text = s; if (s === a.s) o.selected = true; sel.appendChild(o); });
  document.getElementById('editF1').value = a.o || '';
  document.getElementById('editF2').value = a.r || '';
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
var LIFECYCLE = { mode: 'edit', sel: null };
function openAddAsset(){
  LIFECYCLE = { mode: 'add', sel: null };
  document.getElementById('retireBtn').style.display = 'none';
  document.getElementById('svcBtn').style.display = 'none';
  document.getElementById('modalTitle').innerText = 'New Asset';
  document.getElementById('editF0').value = '';
  var sel = document.getElementById('stSel'); sel.innerHTML = '';
  STATUSES.forEach(function(st){ var o = document.createElement('option'); o.value = st; o.text = st; sel.appendChild(o); });
  document.getElementById('editF1').value = '';
  document.getElementById('editF2').value = '';
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function markServiced(){
  if (LIFECYCLE.mode !== 'edit' || LIFECYCLE.sel == null) return;
  var a = state.assets[LIFECYCLE.sel];
  a.ls = a.r || a.ls || 0; // the service clock resets from the CURRENT meter
  touched['ls|' + a.n] = 1;
  saveLocal(); render(); closeModal(); toast('Marked serviced ✓ — clock reset'); PERSIST.schedule();
}
function retireAsset(){
  if (LIFECYCLE.mode !== 'edit' || LIFECYCLE.sel == null) return;
  if (STATUSES.indexOf('Retired') === -1) STATUSES.push('Retired'); // keep chips/dist consistent with the new state
  state.assets[LIFECYCLE.sel].s = 'Retired';
  saveLocal(); render(); closeModal(); toast('Asset retired'); PERSIST.schedule();
}
function applyEdit(){
  if (LIFECYCLE.mode === 'add') {
    var n = document.getElementById('editF0').value.trim();
    if (!n) { closeModal(); return; }
    var nr0 = parseFloat(document.getElementById('editF2').value);
    state.assets.push({ n: n, s: document.getElementById('stSel').value, o: document.getElementById('editF1').value.trim(), r: isNaN(nr0) ? null : nr0, ls: 0 });
    saveLocal(); render(); closeModal(); toast('Asset added'); PERSIST.schedule();
    return;
  }
  if (LIFECYCLE.sel == null) return;
  var a = state.assets[LIFECYCLE.sel];
  a.n = document.getElementById('editF0').value.trim() || a.n;
  a.s = document.getElementById('stSel').value;
  a.o = document.getElementById('editF1').value.trim();
  var nr = parseFloat(document.getElementById('editF2').value);
  if (!isNaN(nr) && nr > 0) a.r = nr;
  touched['n|' + a.n] = 1; touched['s|' + a.n] = 1; touched['o|' + a.n] = 1; touched['r|' + a.n] = 1;
  saveLocal(); render(); closeModal(); toast(ENTRY ? 'Saved ✓' : 'Saved'); PERSIST.schedule();
}
function toast(m){ var t = document.getElementById('toast'); t.innerText = m; t.classList.add('open'); setTimeout(function(){ t.classList.remove('open'); }, 2000); }
var ST_HUE = {};
STATUSES.forEach(function(s, i){ ST_HUE[s] = Math.round((i * 137.5) % 360); });
function renderDist(counts){
  var bar = document.getElementById('distBar');
  if (!bar) return;
  var total = state.assets.length || 1;
  bar.innerHTML = STATUSES.map(function(s, i){
    var w = (100 * (counts[i] || 0) / total).toFixed(2);
    return '<div style="width:' + w + '%;background:hsl(' + ST_HUE[s] + ',65%,55%)"></div>';
  }).join('');
  var legend = document.getElementById('distLegend');
  if (legend) legend.innerHTML = STATUSES.map(function(s, i){
    return '<span><i class="dot" style="background:hsl(' + ST_HUE[s] + ',65%,55%)"></i>' + s + ' · ' + (counts[i] || 0) + '</span>';
  }).join('');
  var dc = document.getElementById('distCount');
  if (dc) dc.innerText = state.assets.length + ' assets';
}
function buildRecords(){
  // Full snapshot, always — entry mode scopes the VIEW, never the ledger.
  return state.assets.map(function(a){ var svc = svcState(a); return { name: a.n, status: a.s, owner: a.o, reading: a.r || null, service_state: svc.cls, last_service: a.ls || 0 }; });
}
async function sync(){
  var btn = document.getElementById('syncBtn'); btn.innerText = 'Syncing…';
  try {
    if (typeof window.__opsDeskSubmit__ === 'function') {
      await window.__opsDeskSubmit__({ records: buildRecords() });
      toast('Synced to OpsDesk');
    } else { toast('Saved locally'); }
  } catch (err) { toast('Sync failed'); }
  btn.innerText = 'Sync Fleet';
}
// Engine 2: the ledger is the console's memory. Boot hydrates from the latest
// confirmed event (applyLoaded merges server records into seeded state); every
// edit auto-persists a full snapshot through the same submit bridge.
function applyLoaded(records){
  if (!records || !records.length) return;
  records.forEach(function(r){
    if (!r || !r.name) return;
    var a = state.assets.find(function(x){ return x.n === r.name; });
    if (!a) return;
    if (r.status && STATUSES.indexOf(r.status) >= 0 && !touched['s|' + a.n]) a.s = r.status;
    if (r.owner && !touched['o|' + a.n]) a.o = r.owner;
    if (r.reading !== undefined && r.reading !== null && !isNaN(parseFloat(r.reading)) && !touched['r|' + a.n]) a.r = parseFloat(r.reading);
    if (r.last_service !== undefined && r.last_service !== null && !touched['ls|' + a.n]) a.ls = parseFloat(r.last_service) || 0;
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
  var rows = [['name', 'status', 'owner', 'reading', 'service_state']];
  state.assets.forEach(function(a){ var svc = svcState(a); rows.push([a.n, a.s, a.o || '', a.r || '', svc.cls]); });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fleet.csv'; a.click();
  toast('Exported CSV');
}
(function boot(){ var s = loadLocal(); if (s && s.assets && s.assets.length) state = s; PERSIST.hydrate(true).then(render); })();
</script>
</body>
</html>`;
}
