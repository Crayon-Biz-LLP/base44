// Archetype #9: Attendance & Payroll — workers × daily marks × rate → payout.
// Same doctrine: the model chooses nouns (worker names, rates); ALL behavior
// and ALL money math live here as proven code. Piece-rate tailors, daily-wage
// helpers, monthly staff — humans over time, settled in rupees.
//
// Contract parity: #modal/.open mechanics, #editF0 focus, __opsDeskSubmit__
// bridge, storage-shim persistence, toast, spotlight dim/hit, #auditBanner,
// #staffHome + sh-* classes, body.entry scoping, warm toasts.
//
// Schema doctrine: nested arrays ≤3 properties, everything required, scalars
// first / arrays last. The model proposes {name, rate} and today's {name,
// status} only; the month tally is a platform concern (accumulated in state).
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { esc, jstr } from "./escape";
import { logoOf } from "./branding";
import { chromeFonts, chromeCss, icon } from "./chrome";

export const RosterSchema = z.object({
  productName: z.string().describe("Short invented product name, e.g. 'WageBook'"),
  logoText: z.string().min(1),
  tagline: z.string(),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dark: z.boolean(),
  searchHint: z.string(),
  advisory: z.string(),
  unitLabel: z.string().describe("What one unit of work is called here, e.g. 'day' for daily wages, 'piece' for piece-rate"),
  workers: z.array(z.object({
    name: z.string(),
    rate: z.number().positive(),
  })).min(2).max(40).describe("Workers with their rate per unit in rupees — verbatim names, realistic rates for the trade"),
  attendance: z.array(z.object({
    name: z.string(),
    status: z.string(),
  })).max(40).describe("Today's marks. name must EXACTLY match a workers name; status must be exactly 'full', 'half' or 'absent'. Mark realistically: most full, maybe one half, at most one absent"),
  voice: z.object({
    boardTitle: z.string().describe("Insider name for the register, e.g. 'The Register', 'Hajri Book'"),
    unitNoun: z.string().describe("What one marked unit is called, e.g. 'day', 'piece'"),
    searchExamples: z.array(z.string()).max(5).describe("What the owner types, e.g. 'Ramesh', 'half'"),
    guidelines: z.array(z.object({ title: z.string(), detail: z.string() })).max(3).describe("Trade coaching for fair, smooth payroll — in THIS trade's words"),
  }).describe("Domain voice — the register must read like this trade's own hajri book").optional(),
  heuristics: z.object({
    absenceAlertPct: z.number().min(10).max(60).describe("Share of workers absent above which the day is flagged understaffed (e.g. 20)"),
  }).describe("Judgment as numbers — drives the understaffed verdict").optional(),
});

export type RosterConfig = z.infer<typeof RosterSchema>;

export async function extractRosterConfig(userPrompt: string): Promise<RosterConfig> {
  return generateWithRepair<RosterConfig>({
        prompt: `A manager described attendance/wage tracking for their workers. Extract the roster config.

MANAGER: "${userPrompt}"

Rules:
- workers: verbatim names with realistic per-unit rates in rupees for this trade (e.g. piece-rate tailor ₹40-80/piece; daily wage ₹350-600/day). Rate = what ONE unit earns.
- unitLabel: 'day' for daily wages, 'piece' for piece-rate — the trade's own word.
- attendance: today's marks; name must EXACTLY match a workers name; status exactly 'full', 'half' or 'absent'. Most full.
- accentHex: a #rrggbb hex color suited to the domain. dark: true unless told otherwise.
- tagline: one short line. searchHint: what the owner searches. advisory: one domain best-practice tip for fair payroll. productName: invented, e.g. 'WageBook'.
- VOICE — make it speak this trade's language: boardTitle (insider name, e.g. 'Hajri Book'), unitNoun (one marked unit), searchExamples (real names typed here), guidelines (2-3 coaching tips with this trade's vocabulary and reasons).
- HEURISTICS — judgment as numbers: absenceAlertPct (share of workers absent that means understaffed, e.g. 20).`,
      },
      RosterSchema,
      5);
}

export function assembleRoster(cfg: RosterConfig): string {
  const theme = cfg.dark
    ? { bg: "#0f172a", surface: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", input: "#0b1220" }
    : { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#ffffff" };
  // Workers: model gives {name, rate}; attendance merges to today's mark.
  // Month tally (m, in units) is platform-seeded — it accumulates in state.
  const aMap: Record<string, string> = {};
  for (const a of cfg.attendance) if (aMap[a.name] === undefined) aMap[a.name] = a.status;
  const statusOf = (s: string | undefined): number => (s === "half" ? 0.5 : s === "absent" ? 0 : 1);
  const wJson = jstr(cfg.workers.map((w, idx) => ({
    n: w.name,
    r: w.rate,
    a: statusOf(aMap[w.name]),
    m: aMap[w.name] === undefined ? 0 : 12 + ((idx * 7) % 11), // month units so far (only for marked workers)
  })));
  const V = cfg.voice ?? { boardTitle: "Hajri Book", unitNoun: cfg.unitLabel, searchExamples: [] as string[], guidelines: [] as { title: string; detail: string }[] };
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
.btn { padding:8px 16px; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--text); cursor:pointer; font-weight:600; font-size:13px; }
.btn.primary { background:var(--accent); color:#000; border-color:var(--accent); }
.input { padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:var(--input); color:var(--text); font-size:16px; width:100%; }
.muted { color:var(--muted); }
.kpi { padding:13px 18px 14px; background:var(--bg); }
.kpi:nth-child(1) { border-left:3px solid var(--ok); }
.kpi:nth-child(2) { border-left:3px solid var(--info); }
.kpi:nth-child(3) { border-left:3px solid var(--accent); }
.kpi:nth-child(4) { border-left:3px solid var(--danger); }
.kpi .label { font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:1px; font-weight:600; display:flex; align-items:center; gap:5px; }
.kpi .val { font-size:24px; font-weight:800; letter-spacing:-0.02em; margin-top:4px; }
.badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid; font-weight:700; white-space:nowrap; }
.badge.ok { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.badge.part { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.badge.none { color:#94a3b8; border-color:rgba(148,163,184,.25); background:rgba(148,163,184,.08); }
.banner { display:none; margin-bottom:12px; padding:10px 14px; border-radius:10px; border:1px solid rgba(248,113,113,.35); background:rgba(248,113,113,.08); color:#f87171; font-size:13px; font-weight:600; align-items:center; gap:10px; }
.banner.open { display:flex; }
.wgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:12px; margin-bottom:14px; }
.wcard { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; cursor:pointer; transition:all .12s; }
.wcard:hover { border-color:${cfg.accentHex}88; transform:translateY(-1px); }
.wcard.dim { opacity:.22; filter:saturate(.4); }
.wcard.hit { border-color:${cfg.accentHex}; box-shadow:0 0 0 2px ${cfg.accentHex}55; }
.ava { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:9px; background:${cfg.accentHex}1c; color:${cfg.accentHex}; font-weight:800; font-size:12px; flex:none; }
.wname { font-weight:800; font-size:14.5px; }
.wmeta { font-size:11px; color:var(--muted); margin-top:3px; }
.wpay { text-align:right; }
.pay-val { font-size:19px; font-weight:800; font-variant-numeric:tabular-nums; }
.att-cell { display:inline-flex; align-items:center; justify-content:center; padding:7px 12px; border-radius:999px; border:1px solid var(--border); background:var(--bg); font-weight:700; font-size:12px; cursor:pointer; color:var(--muted); margin-top:10px; margin-right:6px; }
.att-cell.on-full { background:#34d399; border-color:#34d399; color:#000; }
.att-cell.on-half { background:#fbbf24; border-color:#fbbf24; color:#000; }
.att-cell.on-absent { background:#f87171; border-color:#f87171; color:#000; }
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
.topbar { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:14px; padding:10px 22px; border-bottom:1px solid var(--border); background:linear-gradient(180deg, ${cfg.dark ? "rgba(148,163,184,.06)" : "rgba(15,23,42,.03)"}, transparent 140%), var(--surface); }
.topbar .brand { display:flex; align-items:center; gap:10px; }
.brand-tile { width:36px; height:36px; border-radius:10px; color:#000; display:flex; align-items:center; justify-content:center; font-weight:800; flex:none; }
.brand b { font-size:16px; letter-spacing:-0.01em; display:block; line-height:1.15; }
.brand .tag { font-size:11.5px; }
.searchwrap { position:relative; flex:1; max-width:380px; margin-left:auto; }
.searchwrap .input { width:100%; padding-right:56px; }
.searchwrap .kbd { font-family:ui-monospace,monospace; font-size:10px; border:1px solid var(--border); border-bottom-width:2px; border-radius:4px; padding:1px 6px; color:var(--muted); position:absolute; right:10px; top:50%; transform:translateY(-50%); }
.hero { display:flex; align-items:center; gap:20px; padding:20px 22px 14px; max-width:1160px; margin:0 auto; width:100%; }
.hero-side { min-width:200px; }
.hero-label { display:block; font-size:10px; text-transform:uppercase; letter-spacing:1.2px; color:var(--muted); font-weight:600; }
.hero-title { display:block; font-size:20px; font-weight:800; letter-spacing:-0.02em; margin:0; }
#mapView { padding:6px 22px 56px; max-width:1160px; margin:0 auto; width:100%; }
.stage { margin-top:12px; }
.footnotes { margin-top:14px; }
.advisory { font-size:12px; margin-bottom:10px; display:flex; align-items:center; gap:6px; }
.rail-title { font-size:11px; font-weight:700; letter-spacing:1px; color:var(--muted); text-transform:uppercase; }
.gi, .wcard { border-radius:var(--r-md); }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } .searchwrap { display:none; } }
/* Entry mode — staff: the worker sees only their own card. */
body.entry .grid-4, body.entry #syncBtn, body.entry #search, body.entry .wgrid,
body.entry button[onclick="exportCsv()"], body.entry #verdict, body.entry .lifecycle { display:none; }
/* ---- Staff Home: the worker's OWN screen — mark yourself, see the month. */
#staffHome { display:none; padding:4px 22px 64px; max-width:640px; margin:0 auto; }
body.entry #staffHome { display:block; }
body.entry .hero, body.entry .stage, body.entry .footnotes { display:none; }
body.entry main#mapView { padding-top:4px; }
.sh-greet { margin:10px 0 4px; }
.sh-hi { font-size:27px; font-weight:800; letter-spacing:-0.02em; display:block; }
.sh-sub { color:var(--muted); font-size:13.5px; display:block; margin-top:3px; }
.sh-mark { background:var(--surface); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:14px; padding:18px; margin:18px 0 14px; }
.sh-mark-row { display:flex; gap:10px; margin-top:14px; }
.sh-markbtn { flex:1; padding:15px 6px; border-radius:12px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-weight:800; font-size:14px; cursor:pointer; }
.sh-markbtn.on-full { background:#34d399; border-color:#34d399; color:#000; }
.sh-markbtn.on-half { background:#fbbf24; border-color:#fbbf24; color:#000; }
.sh-markbtn.on-absent { background:#f87171; border-color:#f87171; color:#000; }
.sh-tally { display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:13px; color:var(--muted); }
.sh-note { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12.5px; margin-top:16px; }
</style>
${chromeCss(cfg.dark, cfg.accentHex)}
</head>
<body>
<header class="topbar">
  <div class="row brand">
    <div class="brand-tile">${logoOf(cfg.productName, cfg.logoText)}</div>
    <div class="brand"><b>${esc(cfg.productName)}</b><span class="muted tag">${esc(cfg.tagline)}</span></div>
  </div>
  <span class="meta-chip mono">${cfg.workers.length} WORKERS · PER ${esc(V.unitNoun.toUpperCase())}</span>
  <div class="searchwrap"><input id="search" class="input" placeholder="${esc(searchPh)}" aria-label="Search" oninput="render()"><span class="kbd">⌘K</span></div>
  <button class="btn" onclick="exportCsv()">${icon("download")} Export CSV</button>
  <button id="syncBtn" class="btn primary" onclick="sync()">${icon("upload")} Sync Register</button>
  <span id="syncState" class="sync-chip"></span>
</header>
<section class="hero">
  <div class="hero-side">
    <span class="hero-label">Rate per ${esc(V.unitNoun)} · month running</span>
    <h1 class="hero-title">${esc(V.boardTitle || cfg.tagline)}</h1>
  </div>
  <div id="verdict"></div>
</section>
<section class="grid-4">
  <div class="kpi"><span class="label">${icon("check", 13)} Present today</span><div class="val mono tint-ok" id="kpiPresent">0</div></div>
  <div class="kpi"><span class="label">${icon("grid", 13)} ${esc(V.unitNoun)}s today</span><div class="val mono tint-info" id="kpiUnits">0</div></div>
  <div class="kpi"><span class="label">${icon("money", 13)} Month payroll</span><div class="val mono tint-accent" id="kpiPay">₹0</div></div>
  <div class="kpi"><span class="label">${icon("alert", 13)} Absent today</span><div class="val mono tint-danger" id="kpiAbsent">0</div></div>
</section>
<main id="mapView">
  <section id="staffHome">
    <div class="sh-greet"><span class="sh-hi" id="shHi"></span><span class="sh-sub" id="shSub"></span></div>
    <div class="sh-mark" id="shMark"></div>
    <div class="sh-note">${icon("check", 14)} <span>Your mark saves by itself — the boss sees it instantly.</span></div>
  </section>
  <div class="wgrid" id="workerGrid"></div>
  <div id="auditBanner" class="banner"><span>⚠</span><span id="auditText"></span></div>
  <div class="lifecycle" style="margin-bottom:10px">
    <button class="btn" onclick="settleMonth()">${icon("money")} Settle month &amp; start fresh</button>
  </div>
  <div class="footnotes">
    <div class="muted advisory">${icon("lightbulb", 13)} ${cfg.advisory}</div>
    ${V.guidelines.length ? `<div class="glist">${V.guidelines.map(g => `<div class="gi"><b>${g.title}</b><span>${g.detail}</span></div>`).join("")}</div>` : ""}
  </div>
</main>
<div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
  <div class="card" style="width:min(420px,92vw);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px">
    <h3 style="margin:0 0 12px" id="modalTitle">Worker</h3>
    <input id="editF0" class="input" style="width:100%;margin-bottom:10px" placeholder="Name" aria-label="Name">
    <input id="editF1" class="input" type="number" inputmode="decimal" enterkeyhint="done" style="width:100%;margin-bottom:10px" placeholder="Rate per ${esc(V.unitNoun)} (₹)" aria-label="Rate per ${esc(V.unitNoun)} in rupees">
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="applyEdit()">Apply</button>
    </div>
  </div>
</div>
<div id="toast" class="toast"></div>
<script>
var UNITLbl = ${jstr(cfg.unitLabel)};
var state = { workers: ${wJson} }, editing = null;
var HZ = ${H ? jstr({ abs: H.absenceAlertPct }) : "null"};
var touched = {};
var LS_KEY = 'opsdesk_console_state';
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
function loadLocal(){ try{ var r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function initOf(n){ return n.split(/\\s+/).map(function(w){ return (w[0] || '').toUpperCase(); }).join('').slice(0, 2); }
function statusOf(a){ return a === 1 ? 'full' : a === 0.5 ? 'half' : 'absent'; }
function payOf(w){ return Math.round(w.r * (w.m + w.a)); }
function findMe(){ return ENTRY ? state.workers.find(function(w){ return w.n.toLowerCase() === ENTRY.toLowerCase(); }) : null; }
function render(){
  var wg = document.getElementById('workerGrid'); wg.innerHTML = '';
  var Q = (document.getElementById('search').value || '').toLowerCase();
  var present = 0, units = 0, absent = 0, pay = 0;
  state.workers.forEach(function(w){
    if (w.a > 0) present++;
    if (w.a === 0) absent++;
    units += w.a; pay += payOf(w);
  });
  state.workers.forEach(function(w, i){
    var st = statusOf(w.a);
    var dim = Q && w.n.toLowerCase().indexOf(Q) === -1 ? ' dim' : '';
    var hit = Q && w.n.toLowerCase().indexOf(Q) !== -1 ? ' hit' : '';
    var badge = w.a === 1 ? 'badge ok' : w.a === 0.5 ? 'badge part' : 'badge none';
    var card = document.createElement('div');
    card.className = 'wcard' + dim + hit;
    card.innerHTML = '<div class="spread"><span class="row"><span class="ava">' + initOf(w.n) + '</span><span><span class="wname">' + w.n + '</span><span class="wmeta mono">₹' + w.r + ' / ' + UNITLbl + (w.a === 0.5 ? ' · half today' : '') + '</span></span></span>' +
      '<span class="wpay"><span class="pay-val mono">₹' + payOf(w).toLocaleString('en-IN') + '</span><span class="wmeta mono" style="display:block">' + (w.m + w.a) + ' ' + UNITLbl + 's this month</span></span></div>' +
      '<div><span class="att-cell' + (w.a === 1 ? ' on-full' : '') + '" data-i="' + i + '" data-v="1">Full</span><span class="att-cell' + (w.a === 0.5 ? ' on-half' : '') + '" data-i="' + i + '" data-v="0.5">Half</span><span class="att-cell' + (w.a === 0 ? ' on-absent' : '') + '" data-i="' + i + '" data-v="0">Absent</span> <span class="' + badge + '" style="margin-left:4px">' + st.toUpperCase() + '</span></div>';
    card.onclick = function(ev){
      var cell = ev.target.closest('.att-cell');
      if (cell){ mark(parseInt(cell.getAttribute('data-i'), 10), parseFloat(cell.getAttribute('data-v'))); return; }
      openEdit(i);
    };
    wg.appendChild(card);
  });
  document.getElementById('kpiPresent').innerText = present + ' / ' + state.workers.length;
  document.getElementById('kpiUnits').innerText = (Math.round(units * 2) / 2);
  document.getElementById('kpiPay').innerText = '₹' + pay.toLocaleString('en-IN');
  document.getElementById('kpiAbsent').innerText = absent;
  var absPct = Math.round(100 * absent / Math.max(1, state.workers.length));
  var ab = document.getElementById('auditBanner');
  if (ab){
    ab.classList.toggle('open', absent > 0 && absPct >= (HZ ? HZ.abs : 20));
    if (absent > 0 && absPct >= (HZ ? HZ.abs : 20)) document.getElementById('auditText').innerText = absent + ' worker' + (absent > 1 ? 's' : '') + ' absent (' + absPct + '%) — ' + (UNITLbl === 'day' ? 'plan delivery dates around the gap' : 'rebalance today\u2019s work among those present');
  }
  var vd = document.getElementById('verdict');
  if (vd){
    if (absent === 0){ vd.style.display = 'none'; }
    else {
      vd.innerHTML = '<span class="vbig" style="color:' + (absPct >= (HZ ? HZ.abs : 20) ? '#f87171' : '#fbbf24') + '">' + absPct + '%</span><span class="vtxt">of the team absent today — ' + present + ' working, ' + absent + ' away</span>';
      vd.style.display = 'flex'; vd.style.borderLeftColor = absPct >= (HZ ? HZ.abs : 20) ? '#f87171' : '#fbbf24';
    }
  }
  if (ENTRY) renderStaffHome();
}
function mark(i, v){
  var w = state.workers[i]; if (!w) return;
  var was = w.a;
  w.a = v;
  if (was === undefined || was === null) w.m = w.m || 0;
  touched[w.n] = 1;
  saveLocal(); render(); toast(w.n + ' · ' + statusOf(v) + ' ✓'); PERSIST.schedule();
}
function settleMonth(){
  state.workers.forEach(function(w){ w.m = 0; });
  saveLocal(); render(); toast('Month settled — tally reset'); PERSIST.schedule();
}
function openEdit(i){
  var w = state.workers[i]; if (!w) return;
  editing = i;
  document.getElementById('modalTitle').innerText = w.n;
  document.getElementById('editF0').value = w.n;
  document.getElementById('editF1').value = w.r;
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
function applyEdit(){
  if (editing != null){
    var w = state.workers[editing];
    if (w){
      w.n = document.getElementById('editF0').value.trim() || w.n;
      var r = parseFloat(document.getElementById('editF1').value);
      if (!isNaN(r) && r > 0) w.r = r;
    }
  }
  saveLocal(); render(); closeModal(); toast(ENTRY ? 'Sent to boss ✓' : 'Saved'); PERSIST.schedule();
}
function toast(m){ var t = document.getElementById('toast'); t.innerText = m; t.classList.add('open'); setTimeout(function(){ t.classList.remove('open'); }, 2000); }
/* Entry mode: workers mark themselves. Name match → their card. */
var ENTRY = null;
function setEntry(n){
  var q = String(n || '').trim().toLowerCase(); if (!q) return;
  ENTRY = state.workers.some(function(w){ return w.n.toLowerCase() === q; }) ? String(n).trim() : null;
  if (ENTRY){ document.body.classList.add('entry'); renderStaffHome(); }
}
function renderStaffHome(){
  if (!ENTRY) return;
  var me = findMe();
  var hi = document.getElementById('shHi'); if (!hi) return;
  hi.textContent = 'Hi ' + ENTRY;
  if (!me){ document.getElementById('shSub').textContent = 'You are not on the register yet — ask the boss'; return; }
  document.getElementById('shSub').textContent = 'Mark today\u2019s attendance — it saves by itself';
  var box = document.getElementById('shMark');
  box.innerHTML = '<span class="rail-title">Today · ' + new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + '</span>' +
    '<div class="sh-mark-row">' +
    '<button class="sh-markbtn' + (me.a === 1 ? ' on-full' : '') + '" data-v="1">Full day</button>' +
    '<button class="sh-markbtn' + (me.a === 0.5 ? ' on-half' : '') + '" data-v="0.5">Half day</button>' +
    '<button class="sh-markbtn' + (me.a === 0 ? ' on-absent' : '') + '" data-v="0">Off today</button></div>' +
    '<div class="sh-tally"><span>' + (me.m + me.a) + ' ' + UNITLbl + 's this month</span><span class="pay-val mono">₹' + payOf(me).toLocaleString('en-IN') + '</span></div>';
}
document.getElementById('shMark').addEventListener('click', function(ev){
  var b = ev.target.closest('.sh-markbtn'); if (!b || !ENTRY) return;
  var me = findMe(); if (!me) return;
  me.a = parseFloat(b.getAttribute('data-v'));
  touched[me.n] = 1;
  saveLocal(); renderStaffHome(); render(); toast('Marked ' + statusOf(me.a) + ' ✓'); PERSIST.schedule();
});
function buildRecords(){
  return state.workers.map(function(w){ return { name: w.n, rate: w.r, today_status: statusOf(w.a), month_units: w.m }; });
}
async function sync(){
  var btn = document.getElementById('syncBtn'); btn.innerText = 'Syncing…';
  try {
    if (typeof window.__opsDeskSubmit__ === 'function') {
      await window.__opsDeskSubmit__({ records: buildRecords() });
      toast('Synced to OpsDesk');
    } else { toast('Saved locally'); }
  } catch (e) { toast('Sync failed'); }
  btn.innerText = 'Sync Register';
}
// Engine 2: the ledger is the console's memory. Boot hydrates from the latest
// confirmed event (applyLoaded merges server records into seeded state); every
// edit auto-persists a full snapshot through the same submit bridge.
function applyLoaded(records){
  if (!records || !records.length) return;
  records.forEach(function(r){
    if (!r || !r.name) return;
    var w = state.workers.find(function(x){ return x.n === r.name; });
    if (w){
      if (r.rate !== undefined && r.rate !== null && parseFloat(r.rate) > 0) w.r = parseFloat(r.rate);
      if (r.today_status !== undefined && r.today_status !== null) w.a = r.today_status === 'half' ? 0.5 : r.today_status === 'absent' ? 0 : 1;
      if (r.month_units !== undefined && r.month_units !== null) w.m = parseFloat(r.month_units) || 0;
    } else {
      state.workers.push({ n: String(r.name), r: parseFloat(r.rate) || 0, a: r.today_status === 'half' ? 0.5 : r.today_status === 'absent' ? 0 : 1, m: parseFloat(r.month_units) || 0 });
    }
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
  var rows = [['name', 'rate', 'today_status', 'month_units', 'payout']];
  state.workers.forEach(function(w){ rows.push([w.n, w.r, statusOf(w.a), w.m, payOf(w)]); });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'payroll.csv'; a.click();
  toast('Exported CSV');
}
(function boot(){
  var s = loadLocal(); if (s && s.workers && s.workers.length) state = s;
  PERSIST.hydrate(true).then(render);
})();
</script>
</body>
</html>`;
}
