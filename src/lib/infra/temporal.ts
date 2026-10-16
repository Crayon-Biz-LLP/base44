// Archetype #5: Temporal Booking — resources × time slots × collision
// intelligence. Same doctrine: the model chooses nouns (resource names, slot
// labels, booking purposes); ALL behavior lives here as proven code.
// Contract parity: #modal/.open mechanics, #editF0 focus, __opsDeskSubmit__
// bridge, storage-shim persistence, toast, spotlight dim/hit, #auditBanner.
//
// Schema doctrine: nested arrays ≤3 properties, everything required, no
// .default()/.optional(), scalars first / arrays last. The model proposes
// {resource, startIdx} only; the platform deterministically assigns slot
// durations and spread (Gemini rejects ≥4-prop nested objects; duration is a
// platform concern, not a model concern).
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { esc, jstr } from "./escape";
import { logoOf } from "./branding";
import { chromeFonts, chromeCss, icon } from "./chrome";

export const TemporalSchema = z.object({
  productName: z.string().describe("Short invented product name, e.g. 'ChairFlow'"),
  logoText: z.string().min(1),
  tagline: z.string(),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dark: z.boolean(),
  searchHint: z.string(),
  advisory: z.string(),
  resources: z.array(z.object({ name: z.string() })).min(1).max(16).describe("Bookable resources (chairs, rooms, docks, tables), verbatim if named"),
  slots: z.array(z.object({
    purpose: z.string(),
    resource: z.string(),
  })).min(4).max(60).describe("Today's bookings; purpose is a short phrase; resource must EXACTLY match a resources name; seed a realistic full-day volume consistent with any counts stated in the prompt"),
  voice: z.object({
    boardTitle: z.string().describe("Insider name for this schedule, e.g. 'Chair Chart', 'Dock Board', 'Day Sheet'"),
    resourceNoun: z.string().describe("What one resource is called here, e.g. 'chair', 'room', 'dock'"),
    searchExamples: z.array(z.string()).max(5).describe("What the owner types, e.g. 'cleaning', 'Ramesh', '10:30'"),
    guidelines: z.array(z.object({ title: z.string(), detail: z.string() })).max(3).describe("Trade coaching for smooth scheduling — in THIS trade's words"),
  }).describe("Domain voice — the schedule must read like this trade's own day sheet").optional(),
  heuristics: z.object({
    busyThresholdPct: z.number().min(30).max(95).describe("Utilization % above which the day counts as peak (e.g. 75)"),
  }).describe("Judgment as numbers — drives the peak-day verdict").optional(),
});
// Voice + heuristics: the trade's words and judgment-as-numbers. Optional
// with generic fallbacks so pre-voice configs keep assembling.

export type TemporalConfig = z.infer<typeof TemporalSchema>;

export async function extractTemporalConfig(userPrompt: string): Promise<TemporalConfig> {
  return generateWithRepair<TemporalConfig>({
        prompt: `A manager described a booking/scheduling need. Extract the temporal booking config.

MANAGER: "${userPrompt}"

Rules:
- resources: verbatim if named, else invent 2-6 realistic for the domain.
- slots: 8-16 realistic bookings for TODAY (invent if none named). Spread across resources and leave some slots empty (utilization below 100%). purpose is a short customer-facing phrase.
- resource must EXACTLY match a resources name.
- accentHex: a #rrggbb hex color suited to the domain. dark: true unless told otherwise.
- tagline: one short line. searchHint: what to search. advisory: one domain best-practice tip for smooth scheduling. productName: invented, e.g. 'ChairFlow'.
- VOICE — make the schedule speak this trade's language: boardTitle (insider name for the day sheet), resourceNoun (what one resource is called here), searchExamples (real purposes/names typed here), guidelines (2-3 coaching tips with this trade's vocabulary and reasons).
- HEURISTICS — judgment as numbers: busyThresholdPct (utilization % above which the day is a peak day needing extra hands, e.g. 75).`,
      },
      TemporalSchema,
      5);
}

export function assembleTemporal(cfg: TemporalConfig): string {
  // Voice + heuristics: the trade's words and judgment-as-numbers. Optional
  // with generic fallbacks so pre-voice configs keep assembling.
  const V = cfg.voice ?? { boardTitle: "Today", resourceNoun: "resource", searchExamples: [] as string[], guidelines: [] as { title: string; detail: string }[] };
  const H = cfg.heuristics ?? null;
  const searchPh = (V.searchExamples.length ? V.searchExamples.join(", ") : cfg.searchHint);
  const theme = cfg.dark
    ? { bg: "#0f172a", surface: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", input: "#0b1220" }
    : { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#ffffff" };
  const rJson = jstr(cfg.resources.map(r => r.name));
  // Slots: the model gives {purpose, resource}; the platform deterministically
  // assigns startIdx (round-robin with gaps so utilization < 100%).
  const sJson = jstr(cfg.slots.map((s, idx) => ({
    p: s.purpose,
    r: s.resource,
    st: idx % 7,
  })));

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
.kpi:nth-child(2) { border-left:3px solid var(--info); }
.kpi:nth-child(3) { border-left:3px solid var(--ok); }
.kpi:nth-child(4) { border-left:3px solid var(--danger); }
.kpi .label { font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:1px; font-weight:600; display:flex; align-items:center; gap:5px; }
.kpi .val { font-size:24px; font-weight:800; letter-spacing:-0.02em; margin-top:4px; }
.badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid; font-weight:700; white-space:nowrap; }
.badge.ok { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.badge.warn { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.badge.breach { color:#f87171; border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.1); }
.banner { display:none; margin-bottom:12px; padding:10px 14px; border-radius:10px; border:1px solid rgba(248,113,113,.35); background:rgba(248,113,113,.08); color:#f87171; font-size:13px; font-weight:600; align-items:center; gap:10px; }
.banner.open { display:flex; }
.grid-wrap { overflow-x:auto; }
.tgrid { width:100%; border-collapse:collapse; min-width:640px; }
.tgrid th { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); padding:8px 8px; border-bottom:1px solid var(--border); text-align:left; white-space:nowrap; }
.tgrid td { padding:4px 6px; border-bottom:1px solid var(--border); height:52px; }
.slot-cell { min-width:110px; }
.bcell { border-radius:8px; padding:7px 9px; font-size:12px; font-weight:600; cursor:pointer; border:1px solid var(--border); background:var(--bg); transition:all .12s; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bcell:hover { border-color:${cfg.accentHex}88; }
.bcell.filled { background:${cfg.accentHex}22; border-color:${cfg.accentHex}66; color:var(--text); }
.bcell.dim { opacity:.25; }
.bcell.hit { border-color:${cfg.accentHex}; box-shadow:0 0 0 2px ${cfg.accentHex}55; }
.bcell.conflict { background:rgba(248,113,113,.15); border-color:rgba(248,113,113,.5); color:#f87171; }
.empty { color:var(--muted); font-size:11px; cursor:pointer; padding:8px; border-radius:8px; border:1px dashed var(--border); text-align:center; }
.empty:hover { border-color:${cfg.accentHex}88; color:var(--text); }
.modal { position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:center; justify-content:center; z-index:50; } .modal.open { display:flex; }
.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--accent); color:#000; padding:10px 20px; border-radius:10px; font-weight:700; display:none; z-index:60; } .toast.open { display:block; }
.sync-chip { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid var(--border); color:var(--muted); font-weight:600; white-space:nowrap; } .sync-chip:empty { display:none; }
.meta-chip { font-size:10px; padding:2px 8px; border:1px solid var(--border); border-radius:999px; color:var(--muted); letter-spacing:.8px; font-weight:600; white-space:nowrap; }
.glist { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:8px; margin-bottom:12px; }
.gi { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 12px; font-size:12px; }
.gi b { display:block; font-size:12px; margin-bottom:2px; }
.gi span { color:var(--muted); }
#verdict { flex:1; display:none; align-items:center; gap:14px; border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:var(--r-md); padding:12px 18px; background:var(--surface); min-height:64px; font-size:13.5px; font-weight:600; line-height:1.5; }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } }
.ring-wrap { border:1px solid var(--border); border-radius:12px; background:var(--surface); padding:16px; margin-bottom:14px; display:flex; align-items:center; gap:18px; }
.ring-pos { position:relative; flex:none; }
.ring-num { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.ring-num b { font-size:20px; font-weight:800; }
.ring-num span { font-size:9px; letter-spacing:1px; color:var(--muted); text-transform:uppercase; }
.ring-side { flex:1; min-width:0; }
.rail-title { font-size:11px; font-weight:700; letter-spacing:1px; color:var(--muted); text-transform:uppercase; margin-bottom:6px; }
.ring-desc { font-size:12px; color:var(--muted); }
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
.ring-wrap { border-radius:var(--r-lg); }
.bcell { border-radius:var(--r-sm); }
.empty { border-radius:var(--r-sm); }
.banner { border-radius:var(--r-md); }
.gi { border-radius:var(--r-md); }
tgrid-sticky-th-placeholder { display:none; }
/* Entry mode — staff view: scoped to the signed-in worker's resource. */
.scope-hint { display:none; font-size:12px; font-weight:700; color:var(--accent); }
body.entry .scope-hint { display:inline; }
body.entry .searchwrap, body.entry #syncBtn, body.entry button[onclick="exportCsv()"], body.entry #auditBanner, body.entry .grid-4 { display:none; }
body.entry #verdict { display:none !important; }
/* ---- Staff Home: the stylist's OWN screen. Their chair's day as big
   tappable slot pills; booking/cancelling is one tap, no forms. ---------- */
#staffHome { display:none; padding:4px 22px 64px; max-width:640px; margin:0 auto; }
body.entry #staffHome { display:block; }
body.entry .hero, body.entry .stage, body.entry .footnotes, body.entry .lifecycle, body.entry .ring-wrap { display:none; }
body.entry main#mapView { padding-top:4px; }
.sh-greet { margin:10px 0 4px; }
.sh-hi { font-size:27px; font-weight:800; letter-spacing:-0.02em; display:block; }
.sh-sub { color:var(--muted); font-size:13.5px; display:block; margin-top:3px; }
.sh-slots { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; margin:18px 0 6px; }
.sh-slot { text-align:left; background:var(--surface); border:1px solid var(--border); border-radius:999px; padding:13px 18px; color:var(--text); cursor:pointer; font:inherit; display:flex; align-items:center; gap:10px; }
.sh-slot:active { transform:scale(.97); }
.sh-slot.mine { border-left:4px solid var(--accent); }
.sh-slot.empty { border-style:dashed; color:var(--muted); }
.sh-time { font-weight:800; font-size:14px; font-variant-numeric:tabular-nums; }
.sh-who { font-size:12.5px; color:var(--muted); display:block; }
.sh-note { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12.5px; margin-top:16px; }
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
  <span class="meta-chip mono">${cfg.resources.length} RESOURCES · ${cfg.slots.length} SLOTS</span>
  <div class="searchwrap"><input id="search" class="input" placeholder="${esc(searchPh)}" aria-label="Search" oninput="render()"><span class="kbd">⌘K</span></div>
  <button class="btn" onclick="exportCsv()">${icon("download")} Export CSV</button>
  <button id="syncBtn" class="btn primary" onclick="sync()">${icon("upload")} Sync Schedule</button>
  <span id="syncState" class="sync-chip"></span>
</header>
<section class="hero">
  <div class="hero-side">
    <span class="hero-label">Day sheet · ${cfg.resources.length} resources × ${cfg.slots.length} slots</span>
    <h1 class="hero-title">${esc(V.boardTitle || cfg.tagline)}</h1>
  </div>
  <div id="verdict"></div>
</section>
<section class="grid-4">
  <div class="kpi"><span class="label">${icon("calendar", 13)} Utilization</span><div class="val mono" id="kpiUtil">0%</div></div>
  <div class="kpi"><span class="label">${icon("check", 13)} Bookings today</span><div class="val mono tint-info" id="kpiBook">0</div></div>
  <div class="kpi"><span class="label">${icon("clock", 13)} Free slots</span><div class="val mono tint-ok" id="kpiFree">0</div></div>
  <div class="kpi"><span class="label">${icon("alert", 13)} Conflicts</span><div class="val mono tint-danger" id="kpiConf">0</div></div>
</section>
<main id="mapView">
  <section id="staffHome">
    <div class="sh-greet"><span class="sh-hi" id="shHi"></span><span class="sh-sub" id="shSub"></span></div>
    <div class="sh-slots" id="shSlots"></div>
    <div class="sh-note">${icon("check", 14)} <span>Tap an open slot to book it, tap a booking to change it.</span></div>
  </section>
  <div class="ring-wrap">
    <div class="ring-pos"><svg width="84" height="84" viewBox="0 0 84 84"><circle cx="42" cy="42" r="36" fill="none" stroke="var(--border)" stroke-width="9"/><circle id="ringArc" cx="42" cy="42" r="36" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="226.2" stroke-dashoffset="226.2" transform="rotate(-90 42 42)" style="transition:stroke-dashoffset .5s ease"/><circle cx="42" cy="42" r="30" fill="var(--bg)"/></circle></svg><div class="ring-num"><b class="mono" id="ringPct">0%</b><span>used</span></div></div>
    <div class="ring-side">
      <div class="rail-title">${icon("calendar", 13)} Today's Capacity</div>
      <div class="ring-desc" id="ringDesc">${cfg.resources.length} resources × ${cfg.slots.length} slots</div>
    </div>
  </div>
  <div class="lifecycle">
    <span id="scopeHint" class="scope-hint"></span>
    <button class="btn primary" onclick="openAddBooking()">${icon("plus")} New Booking</button>
  </div>
  <div id="auditBanner" class="banner"><span>⚠</span><span id="auditText"></span></div>
  <div class="stage">
    <div class="grid-wrap"><table class="tgrid"><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>
  </div>
  <div class="footnotes">
    <div class="muted advisory">${icon("lightbulb", 13)} ${cfg.advisory}</div>
    ${V.guidelines.length ? `<div class="glist">${V.guidelines.map(g => `<div class="gi"><b>${g.title}</b><span>${g.detail}</span></div>`).join("")}</div>` : ""}
  </div>
</main>
<div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
  <div class="card" style="width:min(440px,92vw);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px">
    <h3 style="margin:0 0 12px" id="modalTitle">Slot</h3>
    <input id="editF0" class="input" style="width:100%;margin-bottom:10px" placeholder="Purpose" aria-label="Purpose">
    <select id="resSel" class="input" aria-label="Resource" style="width:100%;margin-bottom:10px"></select>
    <select id="slotSel" class="input" aria-label="Slot" style="width:100%;margin-bottom:10px"></select>
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn danger-ghost" id="cancelBtn" onclick="cancelBooking()" style="display:none">Cancel booking</button>
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="applyEdit()">Apply</button>
    </div>
  </div>
</div>
<div id="toast" class="toast"></div>
<script>
var RESOURCES = ${rJson};
var SLOTS = ${jstr(cfg.slots.map((_, i) => String(9 + Math.floor(i * 1.0)) + ":00"))};
var state = { bookings: ${sJson} }, editing = null;
var HZ = ${H ? jstr({ busy: H.busyThresholdPct }) : "null"};
var UNIT = ${jstr(V.resourceNoun)};
var LS_KEY = 'opsdesk_console_state';
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
function loadLocal(){ try{ var r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function bookingAt(ri, si){ return state.bookings.find(function(b){ return RESOURCES.indexOf(b.r) === ri && b.st === si; }); }
function render(){
  var Q = (document.getElementById('search').value || '').toLowerCase();
  var thead = document.getElementById('thead');
  thead.innerHTML = '<tr><th>Resource</th>' + SLOTS.map(function(s){ return '<th class="mono">' + s + '</th>'; }).join('') + '</tr>';
  var tb = document.getElementById('tbody'); tb.innerHTML = '';
  var RES = ENTRY ? RESOURCES.filter(function(r){ return r.trim().toLowerCase() === ENTRY.toLowerCase(); }) : RESOURCES;
  var shown = ENTRY ? state.bookings.filter(function(b){ return b.r === ENTRY; }) : state.bookings;
  var filled = 0, conflicts = 0;
  var conflictKeys = {};
  shown.forEach(function(b){
    var k = b.r + '|' + b.st;
    if (conflictKeys[k]) conflicts++; else conflictKeys[k] = true;
  });
  RES.forEach(function(rname, ri){
    var tr = document.createElement('tr');
    var hayR = rname.toLowerCase();
    var dimRow = Q && hayR.indexOf(Q) === -1;
    var html = '<td style="font-weight:700;font-size:13px">' + rname + '</td>';
    for (var si = 0; si < SLOTS.length; si++) {
      var b = shown.find(function(x){ return x.r === rname && x.st === si; });
      if (b) {
        filled++;
        var hay = (b.p + ' ' + b.r).toLowerCase();
        var hit = Q && hay.indexOf(Q) !== -1;
        var isConflict = !!conflictKeys[b.r + '|' + si] && state.bookings.filter(function(x){ return x.r === b.r && x.st === si; }).length > 1;
        html += '<td class="slot-cell"><div class="bcell filled' + (isConflict ? ' conflict' : '') + (hit ? ' hit' : (Q && !hit ? ' dim' : '')) + '" title="' + b.p + '" data-ri="' + RESOURCES.indexOf(rname) + '" data-si="' + si + '">' + b.p + '</div></td>';
      } else {
        html += '<td class="slot-cell"><div class="empty' + (dimRow ? ' dim' : '') + '" data-ri="' + RESOURCES.indexOf(rname) + '" data-si="' + si + '">+</div></td>';
      }
    }
    tr.innerHTML = html;
    tb.appendChild(tr);
  });
  var total = RES.length * SLOTS.length;
  var util = total ? Math.round(filled / total * 100) : 0;
  renderRing(util, filled, total);
  document.getElementById('kpiUtil').innerText = util + '%';
  document.getElementById('kpiBook').innerText = shown.length;
  document.getElementById('kpiFree').innerText = total - filled;
  document.getElementById('kpiConf').innerText = conflicts;
  var ab = document.getElementById('auditBanner');
  ab.classList.toggle('open', conflicts > 0);
  if (conflicts > 0) document.getElementById('auditText').innerText = conflicts + ' double-booked slot' + (conflicts > 1 ? 's' : '') + ' — tap a red slot to resolve before the day starts.';
  var vd = document.getElementById('verdict');
  if (vd){
    if (!HZ){ vd.style.display = 'none'; }
    else {
      var byRes = {}, bySlot = {};
      state.bookings.forEach(function(b){
        byRes[b.r] = (byRes[b.r] || 0) + 1;
        bySlot[b.s] = (bySlot[b.s] || 0) + 1;
      });
      var busRes = null, busN = 0;
      Object.keys(byRes).forEach(function(r){ if (byRes[r] > busN){ busN = byRes[r]; busRes = r; } });
      var peakSlot = null, peakN = 0;
      Object.keys(bySlot).forEach(function(k){ if (bySlot[k] > peakN){ peakN = bySlot[k]; peakSlot = k; } });
      var bits = [];
      if (busRes) bits.push('<span>' + (UNIT || 'resource') + ' leader: ' + busRes + ' (' + busN + ' today) — schedule ' + (UNIT || 'it') + ' upkeep around the quiet hours</span>');
      if (peakSlot && peakN >= RESOURCES.length) bits.push('<span style="color:#fbbf24">' + peakSlot + ' is fully booked across all ' + RESOURCES.length + ' ' + (UNIT || 'resources') + (UNIT ? 's' : '') + ' — peak hour</span>');
      if (util >= HZ.busy) bits.push('<span class="mono" style="font-size:15px;color:#fbbf24">' + util + '%</span><span>booked — peak day, line up extra hands</span>');
      if (bits.length){ vd.innerHTML = bits.join('<br>'); vd.style.display = 'flex'; vd.style.borderLeftColor = '#fbbf24'; }
      else { vd.style.display = 'none'; }
    }
  }
}
function openModalFor(ri, si){
  var b = bookingAt(ri, si);
  editing = { ri: ri, si: si, isNew: !b };
  var cb = document.getElementById('cancelBtn'); if (cb) cb.style.display = b ? '' : 'none';
  document.getElementById('modalTitle').innerText = b ? b.p : 'New booking';
  document.getElementById('editF0').value = b ? b.p : '';
  var rs = document.getElementById('resSel'); rs.innerHTML = '';
  RESOURCES.forEach(function(r){ var o = document.createElement('option'); o.value = r; o.text = r; if (r === RESOURCES[ri]) o.selected = true; rs.appendChild(o); });
  var ss = document.getElementById('slotSel'); ss.innerHTML = '';
  SLOTS.forEach(function(s, i){ var o = document.createElement('option'); o.value = i; o.text = s; if (i === si) o.selected = true; ss.appendChild(o); });
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
/* Entry mode: scoping to ONE worker's resource (fleet doctrine — filter at
   render, never mutate state). A stylist runs a chair; strict case-insensitive
   match; unrecognized name stays in owner view. */
var ENTRY = null;
function setEntry(n){
  var q = String(n || '').trim().toLowerCase();
  if (!q) return;
  ENTRY = RESOURCES.find(function(r){ return r.trim().toLowerCase() === q; }) || null;
  if (ENTRY){
    document.body.classList.add('entry');
    var hint = document.getElementById('scopeHint');
    if (hint) hint.textContent = 'Showing only ' + ENTRY;
    renderStaffHome();
  }
}
/* Staff Home — the worker's chair-day as slot pills. Tap empty = book,
   tap booked = change/cancel (the proven modal, pre-scoped). */
function renderStaffHome(){
  if (!ENTRY) return;
  var hi = document.getElementById('shHi'); if (!hi) return;
  hi.textContent = 'Hi there';
  var mine = state.bookings.filter(function(b){ return b.r === ENTRY; });
  document.getElementById('shSub').textContent = mine.length + ' of ' + SLOTS.length + ' slots booked today';
  document.getElementById('shSlots').innerHTML = SLOTS.map(function(s, si){
    var b = state.bookings.find(function(x){ return x.r === ENTRY && x.st === si; });
    return b
      ? '<button class="sh-slot mine" data-si="' + si + '"><span class="sh-time">' + s + '</span><span class="sh-who">' + b.p + '</span></button>'
      : '<button class="sh-slot empty" data-si="' + si + '"><span class="sh-time">' + s + '</span><span class="sh-who">open</span></button>';
  }).join('');
}
document.getElementById('shSlots').addEventListener('click', function(ev){
  var c = ev.target.closest('.sh-slot'); if (!c || !ENTRY) return;
  var ri = RESOURCES.indexOf(ENTRY);
  if (ri < 0) return;
  openModalFor(ri, parseInt(c.getAttribute('data-si'), 10));
});
function openAddBooking(){
  editing = { ri: -1, si: -1, isNew: true };
  var cb = document.getElementById('cancelBtn'); if (cb) cb.style.display = 'none';
  document.getElementById('modalTitle').innerText = 'New booking';
  document.getElementById('editF0').value = '';
  var rs = document.getElementById('resSel'); rs.innerHTML = '';
  RESOURCES.forEach(function(r){ var o = document.createElement('option'); o.value = r; o.text = r; rs.appendChild(o); });
  var ss = document.getElementById('slotSel'); ss.innerHTML = '';
  SLOTS.forEach(function(s, i){ var o = document.createElement('option'); o.value = i; o.text = s; ss.appendChild(o); });
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function cancelBooking(){
  if (!editing || editing.isNew) return;
  var idx = state.bookings.findIndex(function(b){ return RESOURCES.indexOf(b.r) === editing.ri && b.st === editing.si; });
  if (idx >= 0) state.bookings.splice(idx, 1);
  saveLocal(); render(); closeModal(); toast('Booking cancelled'); PERSIST.schedule();
}
function applyEdit(){
  if (!editing) return;
  var p = document.getElementById('editF0').value.trim();
  var r = document.getElementById('resSel').value;
  var st = parseInt(document.getElementById('slotSel').value, 10);
  if (!p) { closeModal(); return; }
  if (editing.isNew) {
    state.bookings.push({ p: p, r: r, st: st });
  } else {
    var idx = state.bookings.findIndex(function(b){ return RESOURCES.indexOf(b.r) === editing.ri && b.st === editing.si; });
    if (idx >= 0) { state.bookings[idx] = { p: p, r: r, st: st }; }
  }
  saveLocal(); render(); closeModal(); toast(ENTRY ? 'Saved ✓' : 'Saved'); PERSIST.schedule();
}
function toast(m){ var t = document.getElementById('toast'); t.innerText = m; t.classList.add('open'); setTimeout(function(){ t.classList.remove('open'); }, 2000); }
function renderRing(util, filled, total){
  var arc = document.getElementById('ringArc');
  if (!arc) return;
  var C = 226.2;
  arc.setAttribute('stroke-dashoffset', String(C * (1 - Math.min(100, util) / 100)));
  arc.setAttribute('stroke', util >= 90 ? '#f87171' : (util >= 60 ? '#fbbf24' : 'var(--accent)'));
  document.getElementById('ringPct').innerText = util + '%';
  document.getElementById('ringDesc').innerText = filled + ' of ' + total + ' slots booked · ' + (total - filled) + ' still free';
}
function buildRecords(){
  return state.bookings.map(function(b){ return { slot: SLOTS[b.st], resource: b.r, purpose: b.p }; });
}
async function sync(){
  var btn = document.getElementById('syncBtn'); btn.innerText = 'Syncing…';
  try {
    if (typeof window.__opsDeskSubmit__ === 'function') {
      await window.__opsDeskSubmit__({ records: buildRecords() });
      toast('Synced to OpsDesk');
    } else { toast('Saved locally'); }
  } catch (err) { toast('Sync failed'); }
  btn.innerText = 'Sync Schedule';
}
// Engine 2: the ledger is the console's memory. Boot hydrates from the latest
// confirmed event (applyLoaded merges server records into seeded state); every
// edit auto-persists a full snapshot through the same submit bridge.
function applyLoaded(records){
  if (!records || !records.length) return;
  var cells = {};
  records.forEach(function(r){
    if (!r || !r.purpose) return;
    var st = SLOTS.indexOf(r.slot); if (st < 0) return;
    var res = r.resource || RESOURCES[0];
    var key = res + '||' + st;
    if (!cells[key]) cells[key] = { res: res, st: st, ps: [] };
    cells[key].ps.push(r.purpose);
  });
  Object.keys(cells).forEach(function(key){
    var c = cells[key];
    var locals = [];
    state.bookings.forEach(function(x, i){ if (((x.r || '') + '||' + x.st) === key) locals.push(i); });
    for (var i = 0; i < c.ps.length; i++){
      if (i < locals.length) state.bookings[locals[i]].p = c.ps[i];
      else state.bookings.push({ p: c.ps[i], r: c.res, st: c.st });
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
  async function hydrate(){
    if (dirty) return; // local edits win; the pending autosave lands shortly
    if (typeof window.__opsDeskLoad__ !== 'function') return;
    try {
      var res = await window.__opsDeskLoad__();
      if (dirty) return; // edit landed while fetching — local state wins
      if (res && res.ok){
        if (res.role === 'staff' && (res.staffName || res.filledBy)) setEntry(res.staffName || res.filledBy); // entry mode before first paint
        if (res.records && res.records.length){ applyLoaded(res.records); render(); say('Loaded'); setTimeout(function(){ say(''); }, 2500); }
      }
    } catch (e) { /* first boot / offline: keep seed */ }
  }
  return { schedule: schedule, hydrate: hydrate, push: push };
})();
function exportCsv(){
  var rows = [['slot', 'resource', 'purpose']];
  state.bookings.forEach(function(b){ rows.push([SLOTS[b.st], b.r, b.p]); });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'schedule.csv'; a.click();
  toast('Exported CSV');
}
document.addEventListener('click', function(ev){
  var el = ev.target.closest ? ev.target.closest('.bcell, .empty') : null;
  if (!el) return;
  openModalFor(parseInt(el.getAttribute('data-ri'), 10), parseInt(el.getAttribute('data-si'), 10));
});
(function boot(){ var s = loadLocal(); if (s && s.bookings && s.bookings.length) state = s; render(); PERSIST.hydrate(); })();
</script>
</body>
</html>`;
}
