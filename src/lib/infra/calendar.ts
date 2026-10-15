// Archetype #10: Date Calendar / Renewals — week grid (recurring events) ×
// renewal due-dates × overdue intelligence. Same doctrine: the model chooses
// nouns (event titles, renewal items); ALL behavior and ALL date math live
// here as proven code. Medicine batches, FSSAI/GST/insurance renewals, hall
// bookings, tuition timetables — what's coming up, on which date.
//
// HONEST DATE CLOCK (fleet doctrine): the model gives `dueInDays` RELATIVE to
// the generation date — never absolute dates that rot in the DB. The console
// computes the real due date client-side from today, so "expired 2 days ago"
// is always true.
//
// Contract parity: #modal/.open mechanics, #editF0 focus, __opsDeskSubmit__
// bridge, storage-shim persistence, toast, spotlight dim/hit, #auditBanner,
// #staffHome + sh-* classes, body.entry scoping, warm toasts.
//
// Schema doctrine: nested arrays ≤3 properties, everything required, scalars
// first / arrays last. Both arrays optional-shaped at the config level (empty
// = feature off) so pre-extension configs keep assembling.
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { esc, jstr } from "./escape";
import { logoOf } from "./branding";
import { chromeFonts, chromeCss, icon } from "./chrome";

export const CalendarSchema = z.object({
  productName: z.string().describe("Short invented product name, e.g. 'DateSetu'"),
  logoText: z.string().min(1),
  tagline: z.string(),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dark: z.boolean(),
  searchHint: z.string(),
  advisory: z.string(),
  events: z.array(z.object({
    title: z.string(),
    weekday: z.string(),
    time: z.string(),
  })).max(40).describe("Recurring weekly events. weekday must be exactly one of 'Mon','Tue','Wed','Thu','Fri','Sat','Sun'; time is 24h 'HH:MM' or '' if time-free. E.g. wedding hall bookings, weekly classes, market days"),
  renewals: z.array(z.object({
    item: z.string(),
    dueInDays: z.number().int().describe("Days from TODAY until due. Negative = already overdue (e.g. -2), 0 = due today, 3 = this week, 45 = later. Spread realistically: at least one overdue or due within days"),
    note: z.string(),
  })).max(20).describe("Renewals/expiry/compliance dates. item = 'Amoxicillin batch B12', 'FSSAI license', 'GST filing', 'Insurance — Tempo 1'; note = short status ('advance paid ₹5000', 'filed papers ready', '')"),
  desk: z.array(z.object({ name: z.string() })).max(8).optional().describe("Front-desk/manager staff who manage the calendar — first names, verbatim if the operator named them. They get a personal today-screen"),
  voice: z.object({
    boardTitle: z.string().describe("Insider name for the calendar, e.g. 'The Diary', 'Booking Chart', 'Compliance Wall'"),
    searchExamples: z.array(z.string()).max(5).describe("What staff type, e.g. 'FSSAI', 'Saturday', 'insurance'"),
    guidelines: z.array(z.object({ title: z.string(), detail: z.string() })).max(3).describe("Trade coaching for never missing a date — in THIS trade's words"),
  }).describe("Domain voice — the calendar must read like this trade's own diary").optional(),
  heuristics: z.object({
    soonDays: z.number().int().min(1).max(30).describe("Days before a due date that counts as 'due soon' (e.g. 7)"),
  }).describe("Judgment as numbers — drives the due-soon verdict").optional(),
});

export type CalendarConfig = z.infer<typeof CalendarSchema>;

export async function extractCalendarConfig(userPrompt: string): Promise<CalendarConfig> {
  return generateWithRepair<CalendarConfig>({
        prompt: `A manager described a date-driven operation (bookings, weekly timetable, renewals, expiry or compliance dates). Extract the calendar config.

MANAGER: "${userPrompt}"

Rules:
- events: recurring weekly bookings/slots. weekday exactly 'Mon','Tue','Wed','Thu','Fri','Sat' or 'Sun'; time 24h 'HH:MM' or ''. 4-14 events; spread across the week. Only include events when the prompt is about bookings/classes/slots; otherwise an empty array.
- renewals: licenses, GST filings, insurance, medicine batches, subscriptions — anything with a due/expiry date. dueInDays is RELATIVE to today: negative = overdue, 0 = today, small = this week, large = later. Seed 4-8 with at least one overdue or nearly due. note is a short status ('advance paid ₹5000', 'papers ready', ''). If the prompt mentions no dated obligations, use an empty array.
- desk: front-desk/manager staff if the prompt names them (first names). They get a personal today-screen.
- accentHex: a #rrggbb hex color suited to the domain. dark: true unless told otherwise.
- tagline: one short line. searchHint: what staff search. advisory: one domain best-practice tip for never missing a date. productName: invented, e.g. 'DateSetu'.
- VOICE — make it speak this trade's language: boardTitle (insider name for the diary), searchExamples (real things typed here), guidelines (2-3 coaching tips with this trade's vocabulary and reasons).
- HEURISTICS — judgment as numbers: soonDays (days before due that counts as 'due soon', e.g. 7).`,
      },
      CalendarSchema,
      5);
}

export function assembleCalendar(cfg: CalendarConfig): string {
  const theme = cfg.dark
    ? { bg: "#0f172a", surface: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", input: "#0b1220" }
    : { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#ffffff" };
  const EVS = (cfg.events ?? []).filter(e => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(e.weekday));
  const RENS = cfg.renewals ?? [];
  const hasWeek = EVS.length > 0;
  const hasRenew = RENS.length > 0;
  const eJson = jstr(EVS.map(e => ({ t: e.title, d: e.weekday, h: e.time })));
  const rJson = jstr(RENS.map(r => ({ n: r.item, dd: r.dueInDays, nt: r.note })));
  const V = cfg.voice ?? { boardTitle: "The Diary", searchExamples: [] as string[], guidelines: [] as { title: string; detail: string }[] };
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
.kpi:nth-child(1) { border-left:3px solid var(--accent); }
.kpi:nth-child(2) { border-left:3px solid var(--ok); }
.kpi:nth-child(3) { border-left:3px solid var(--danger); }
.kpi:nth-child(4) { border-left:3px solid var(--info); }
.kpi .label { font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:1px; font-weight:600; display:flex; align-items:center; gap:5px; }
.kpi .val { font-size:24px; font-weight:800; letter-spacing:-0.02em; margin-top:4px; }
.badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid; font-weight:700; white-space:nowrap; }
.badge.ok { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.badge.part { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.badge.warn { color:#f87171; border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.1); }
.badge.none { color:#94a3b8; border-color:rgba(148,163,184,.25); background:rgba(148,163,184,.08); }
.banner { display:none; margin-bottom:12px; padding:10px 14px; border-radius:10px; border:1px solid rgba(248,113,113,.35); background:rgba(248,113,113,.08); color:#f87171; font-size:13px; font-weight:600; align-items:center; gap:10px; }
.banner.open { display:flex; }
.week { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; margin-bottom:14px; }
.cal-cell { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:10px 8px; min-height:120px; }
.cal-cell.today { border-color:${cfg.accentHex}; box-shadow:0 0 0 2px ${cfg.accentHex}44; }
.cal-cell .dh { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); font-weight:800; }
.cal-cell.today .dh { color:var(--accent); }
.ev-block { display:block; margin-top:7px; padding:6px 8px; border-radius:8px; background:color-mix(in srgb, var(--accent) 14%, transparent); border:1px solid color-mix(in srgb, var(--accent) 35%, transparent); font-size:11.5px; font-weight:700; cursor:pointer; line-height:1.3; }
.ev-block .et { color:var(--muted); font-weight:600; font-size:10px; display:block; }
.renew-row { display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid var(--border); cursor:pointer; }
.renew-row:last-child { border-bottom:0; }
.renew-row:hover { background:var(--bg); }
.renew-row.dim { opacity:.22; filter:saturate(.4); }
.renew-row.hit { background:color-mix(in srgb, var(--accent) 8%, transparent); }
.rname { font-weight:800; font-size:14px; }
.rnote { font-size:11px; color:var(--muted); }
.rdate { margin-left:auto; text-align:right; white-space:nowrap; }
.rwhen { font-weight:800; font-size:13px; }
.rfull { font-size:11px; color:var(--muted); }
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
.gi, .cal-cell { border-radius:var(--r-md); }
@media (max-width:900px) { .week { grid-template-columns:repeat(4,1fr); } }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } .searchwrap { display:none; } }
/* Entry mode — staff: front desk sees today only. */
body.entry .grid-4, body.entry #syncBtn, body.entry #search, body.entry #weekWrap,
body.entry button[onclick="exportCsv()"], body.entry #verdict, body.entry .lifecycle { display:none; }
/* ---- Staff Home: the front-desk's OWN screen — today's diary. */
#staffHome { display:none; padding:4px 22px 64px; max-width:640px; margin:0 auto; }
body.entry #staffHome { display:block; }
body.entry .hero, body.entry .stage, body.entry .footnotes { display:none; }
body.entry main#mapView { padding-top:4px; }
.sh-greet { margin:10px 0 4px; }
.sh-hi { font-size:27px; font-weight:800; letter-spacing:-0.02em; display:block; }
.sh-sub { color:var(--muted); font-size:13.5px; display:block; margin-top:3px; }
.sh-today { background:var(--surface); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:14px; padding:16px 18px; margin:18px 0 14px; }
.sh-ev { display:flex; gap:12px; padding:10px 0; border-bottom:1px solid var(--border); align-items:baseline; }
.sh-ev:last-child { border-bottom:0; }
.sh-ev .et { font-weight:800; min-width:52px; }
.sh-nextbtn { width:100%; padding:14px; border-radius:14px; border:1px solid var(--border); background:var(--surface); color:var(--text); font-size:15px; font-weight:700; margin-top:10px; cursor:pointer; }
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
  <span class="meta-chip mono">${hasWeek ? EVS.length + " WEEKLY" : "NO RECURRING"}${hasRenew ? " · " + RENS.length + " DATED" : ""}</span>
  <div class="searchwrap"><input id="search" class="input" placeholder="${esc(searchPh)}" aria-label="Search" oninput="render()"><span class="kbd">⌘K</span></div>
  <button class="btn" onclick="exportCsv()">${icon("download")} Export CSV</button>
  <button id="syncBtn" class="btn primary" onclick="sync()">${icon("upload")} Sync Diary</button>
  <span id="syncState" class="sync-chip"></span>
</header>
<section class="hero">
  <div class="hero-side">
    <span class="hero-label">Week of <span id="weekLabel"></span></span>
    <h1 class="hero-title">${esc(V.boardTitle || cfg.tagline)}</h1>
  </div>
  <div id="verdict"></div>
</section>
<section class="grid-4">
  <div class="kpi"><span class="label">${icon("calendar", 13)} Today</span><div class="val mono" id="kpiToday">0</div></div>
  <div class="kpi"><span class="label">${icon("grid", 13)} This week</span><div class="val mono tint-ok" id="kpiWeek">0</div></div>
  <div class="kpi"><span class="label">${icon("alert", 13)} Due ≤7 days</span><div class="val mono tint-danger" id="kpiSoon">0</div></div>
  <div class="kpi"><span class="label">${icon("clock", 13)} Overdue</span><div class="val mono tint-warn" id="kpiOver">0</div></div>
</section>
<main id="mapView">
  <section id="staffHome">
    <div class="sh-greet"><span class="sh-hi" id="shHi"></span><span class="sh-sub" id="shSub"></span></div>
    <div class="sh-today" id="shToday"></div>
    <button class="sh-nextbtn" id="shAdd">+ Add booking</button>
    <div class="sh-note">${icon("check", 14)} <span>Anything you add reaches the boss's diary by itself.</span></div>
  </section>
  <div id="auditBanner" class="banner"><span>⚠</span><span id="auditText"></span></div>
  ${hasWeek ? `<div id="weekWrap" class="week" style="margin-top:4px"></div>` : ""}
  ${hasRenew ? `<div class="stage">
    <div class="rail-title" style="margin-bottom:8px">Dates That Matter</div>
    <div class="card" style="padding:2px 12px"><div id="renewList"></div></div>
  </div>` : ""}
  <div class="lifecycle" style="margin-top:12px">
    <button class="btn primary" onclick="openAdd('event')">${icon("plus")} New Booking</button>
    ${hasRenew ? `<button class="btn" onclick="openAdd('renewal')">${icon("calendar")} New Dated Item</button>` : ""}
  </div>
  <div class="footnotes">
    <div class="muted advisory">${icon("lightbulb", 13)} ${cfg.advisory}</div>
    ${V.guidelines.length ? `<div class="glist">${V.guidelines.map(g => `<div class="gi"><b>${g.title}</b><span>${g.detail}</span></div>`).join("")}</div>` : ""}
  </div>
</main>
<div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
  <div class="card" style="width:min(440px,92vw);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px">
    <h3 style="margin:0 0 12px" id="modalTitle">Item</h3>
    <input id="editF0" class="input" style="width:100%;margin-bottom:10px" placeholder="Title" aria-label="Title">
    <select id="daySel" class="input" aria-label="Weekday" style="width:100%;margin-bottom:10px"></select>
    <input id="editF1" class="input" style="width:100%;margin-bottom:10px" placeholder="Time (HH:MM) or note" aria-label="Time or note">
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn danger-ghost" id="delBtn" onclick="delItem()" style="display:none">Remove</button>
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="applyEdit()">Apply</button>
    </div>
  </div>
</div>
<div id="toast" class="toast"></div>
<script>
var DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
var SOON = ${H ? H.soonDays : 7};
var state = { events: ${eJson}, renewals: ${rJson} }, editing = null;
var touched = {};
var LS_KEY = 'opsdesk_console_state';
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
function loadLocal(){ try{ var r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
var TODAY_IDX = (new Date().getDay() + 6) % 7; // Mon = 0
function dueDate(dd){ var d = new Date(); d.setDate(d.getDate() + dd); return d; }
function whenTxt(dd){
  if (dd < 0) return Math.abs(dd) === 1 ? '1 day ago' : Math.abs(dd) + ' days ago';
  if (dd === 0) return 'TODAY';
  if (dd === 1) return 'Tomorrow';
  return 'in ' + dd + ' days';
}
function renState(dd){ return dd < 0 ? 'over' : (dd <= SOON ? 'soon' : 'ok'); }
function render(){
  var Q = (document.getElementById('search').value || '').toLowerCase();
  var wk = document.getElementById('weekWrap');
  if (wk){
    wk.innerHTML = '';
    DAYS.forEach(function(d, di){
      var evs = state.events.filter(function(e){ return e.d === d; });
      var dim = Q && d.toLowerCase().indexOf(Q) === -1 && !evs.some(function(e){ return (e.t + ' ' + e.h).toLowerCase().indexOf(Q) !== -1; });
      var cell = document.createElement('div');
      cell.className = 'cal-cell' + (di === TODAY_IDX ? ' today' : '') + (Q ? (dim ? ' dim' : '') : '');
      cell.innerHTML = '<div class="dh">' + d + (di === TODAY_IDX ? ' · today' : '') + '</div>' +
        evs.map(function(e){ return '<span class="ev-block" data-kind="event" data-t="' + e.t + '">' + (e.h ? '<span class="et mono">' + e.h + '</span>' : '') + e.t + '</span>'; }).join('');
      wk.appendChild(cell);
    });
  }
  var todayN = state.events.filter(function(e){ return e.d === DAYS[TODAY_IDX]; }).length;
  var soon = 0, over = 0;
  state.renewals.forEach(function(r){ var s = renState(r.dd); if (s === 'soon') soon++; if (s === 'over') over++; });
  document.getElementById('kpiToday').innerText = todayN;
  document.getElementById('kpiWeek').innerText = state.events.length;
  document.getElementById('kpiSoon').innerText = soon;
  document.getElementById('kpiOver').innerText = over;
  var ab = document.getElementById('auditBanner');
  if (ab){
    var firstOver = state.renewals.filter(function(r){ return r.dd < 0; }).sort(function(a, b){ return a.dd - b.dd; })[0];
    var firstSoon = state.renewals.filter(function(r){ return r.dd >= 0 && r.dd <= SOON; }).sort(function(a, b){ return a.dd - b.dd; })[0];
    var focusR = firstOver || firstSoon;
    var trigger = over > 0 || soon > 0;
    ab.classList.toggle('open', trigger);
    if (trigger && focusR) document.getElementById('auditText').innerText = (focusR.dd < 0 ? 'OVERDUE: ' : 'Coming due: ') + focusR.n + ' — ' + whenTxt(focusR.dd);
  }
  var vd = document.getElementById('verdict');
  if (vd){
    var sorted = state.renewals.slice().sort(function(a, b){ return a.dd - b.dd; });
    var next = sorted[0];
    if (!next){ vd.style.display = 'none'; }
    else {
      var tone = next.dd < 0 ? '#f87171' : (next.dd <= SOON ? '#fbbf24' : '#34d399');
      vd.innerHTML = '<span class="vbig" style="color:' + tone + '">' + whenTxt(next.dd) + '</span><span class="vtxt">' + next.n + (next.nt ? ' · ' + next.nt : '') + '</span>';
      vd.style.display = 'flex'; vd.style.borderLeftColor = tone;
    }
  }
  renderRenew();
  if (ENTRY) renderStaffHome();
}
function renderRenew(){
  var el = document.getElementById('renewList'); if (!el) return;
  var Q = (document.getElementById('search').value || '').toLowerCase();
  var sorted = state.renewals.map(function(r, i){ return { r: r, i: i }; }).sort(function(a, b){ return a.r.dd - b.r.dd; });
  el.innerHTML = sorted.map(function(x){
    var r = x.r;
    var hay = (r.n + ' ' + (r.nt || '')).toLowerCase();
    var dim = Q && hay.indexOf(Q) === -1 ? ' dim' : '';
    var hit = Q && hay.indexOf(Q) !== -1 ? ' hit' : '';
    var s = renState(r.dd);
    var badge = s === 'over' ? 'badge warn' : s === 'soon' ? 'badge part' : 'badge ok';
    var txt = s === 'over' ? 'OVERDUE' : s === 'soon' ? 'DUE SOON' : 'ON TRACK';
    var d = dueDate(r.dd);
    return '<div class="renew-row' + dim + hit + '" data-i="' + x.i + '"><span><span class="rname">' + r.n + '</span>' + (r.nt ? '<span class="rnote"> · ' + r.nt + '</span>' : '') + '</span><span class="rdate"><span class="rwhen" style="color:' + (s === 'over' ? '#f87171' : s === 'soon' ? '#fbbf24' : '#34d399') + '">' + whenTxt(r.dd) + '</span><span class="rfull mono" style="display:block">' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + '</span></span><span class="' + badge + '">' + txt + '</span></div>';
  }).join('');
}
function openEditEvent(t){
  var e = state.events.find(function(x){ return x.t === t; }); if (!e) return;
  editing = { kind: 'event', orig: e };
  document.getElementById('modalTitle').innerText = 'Booking';
  document.getElementById('editF0').value = e.t;
  var ds = document.getElementById('daySel'); ds.innerHTML = '';
  DAYS.forEach(function(d){ var o = document.createElement('option'); o.value = d; o.text = d; if (d === e.d) o.selected = true; ds.appendChild(o); });
  ds.style.display = '';
  document.getElementById('editF1').value = e.h || '';
  document.getElementById('editF1').placeholder = 'Time (HH:MM)';
  document.getElementById('delBtn').style.display = '';
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function openEditRenewal(i){
  var r = state.renewals[i]; if (!r) return;
  editing = { kind: 'renewal', i: i };
  document.getElementById('modalTitle').innerText = 'Dated Item';
  document.getElementById('editF0').value = r.n;
  var ds = document.getElementById('daySel'); ds.innerHTML = '';
  [-3, -1, 0, 1, 3, 7, 14, 30, 60, 90].forEach(function(v){ var o = document.createElement('option'); o.value = String(v); o.text = v < 0 ? Math.abs(v) + ' days ago' : v === 0 ? 'today' : 'in ' + v + ' days'; if (v === r.dd) o.selected = true; ds.appendChild(o); });
  ds.style.display = '';
  document.getElementById('editF1').value = r.nt || '';
  document.getElementById('editF1').placeholder = 'Note (advance, papers…)';
  document.getElementById('delBtn').style.display = '';
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function openAdd(kind){
  editing = { kind: kind === 'renewal' ? 'renewal' : 'event', add: true };
  document.getElementById('modalTitle').innerText = kind === 'renewal' ? 'New Dated Item' : 'New Booking';
  document.getElementById('editF0').value = '';
  var ds = document.getElementById('daySel'); ds.innerHTML = '';
  if (kind === 'renewal'){
    [-3, -1, 0, 1, 3, 7, 14, 30, 60, 90].forEach(function(v){ var o = document.createElement('option'); o.value = String(v); o.text = v < 0 ? Math.abs(v) + ' days ago' : v === 0 ? 'today' : 'in ' + v + ' days'; ds.appendChild(o); });
    document.getElementById('editF1').placeholder = 'Note (advance, papers…)';
  } else {
    DAYS.forEach(function(d, i){ var o = document.createElement('option'); o.value = d; o.text = d; if (i === TODAY_IDX) o.selected = true; ds.appendChild(o); });
    document.getElementById('editF1').placeholder = 'Time (HH:MM)';
  }
  ds.style.display = '';
  document.getElementById('editF1').value = '';
  document.getElementById('delBtn').style.display = 'none';
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function delItem(){
  if (!editing) return;
  if (editing.kind === 'event' && editing.orig){ state.events = state.events.filter(function(x){ return x !== editing.orig; }); }
  if (editing.kind === 'renewal' && editing.i != null){ state.renewals.splice(editing.i, 1); }
  saveLocal(); render(); closeModal(); toast('Removed'); PERSIST.schedule();
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
function applyEdit(){
  if (!editing) return;
  var t = document.getElementById('editF0').value.trim();
  var ds = document.getElementById('daySel');
  var f1 = document.getElementById('editF1').value.trim();
  if (editing.kind === 'event'){
    var d = ds.value || DAYS[TODAY_IDX];
    if (editing.add){ if (t) state.events.push({ t: t, d: d, h: f1 }); }
    else if (editing.orig){ if (t) editing.orig.t = t; editing.orig.d = d; editing.orig.h = f1; }
  } else {
    var dd = parseInt(ds.value, 10) || 0;
    if (editing.add){ if (t) state.renewals.push({ n: t, dd: dd, nt: f1 }); }
    else if (editing.i != null && state.renewals[editing.i]){ if (t) state.renewals[editing.i].n = t; state.renewals[editing.i].dd = dd; state.renewals[editing.i].nt = f1; }
  }
  touched[t] = 1;
  saveLocal(); render(); closeModal(); toast(ENTRY ? 'Sent to boss ✓' : 'Saved'); PERSIST.schedule();
}
function toast(m){ var t = document.getElementById('toast'); t.innerText = m; t.classList.add('open'); setTimeout(function(){ t.classList.remove('open'); }, 2000); }
document.getElementById('weekWrap').addEventListener('click', function(ev){
  var e = ev.target.closest('.ev-block'); if (e) openEditEvent(e.getAttribute('data-t'));
});
var rlEl = document.getElementById('renewList');
if (rlEl) rlEl.addEventListener('click', function(ev){
  var r = ev.target.closest('.renew-row'); if (r) openEditRenewal(parseInt(r.getAttribute('data-i'), 10));
});
/* Entry mode: front desk / managers. Name match → today view. */
var ENTRY = null;
function setEntry(n){
  var q = String(n || '').trim().toLowerCase(); if (!q) return;
  ENTRY = String(n).trim();
  document.body.classList.add('entry');
  renderStaffHome();
}
function renderStaffHome(){
  if (!ENTRY) return;
  var hi = document.getElementById('shHi'); if (!hi) return;
  hi.textContent = 'Hi ' + ENTRY;
  var today = DAYS[TODAY_IDX];
  var evs = state.events.filter(function(e){ return e.d === today; });
  var soon = state.renewals.filter(function(r){ return r.dd >= 0 && r.dd <= SOON; }).length;
  var over = state.renewals.filter(function(r){ return r.dd < 0; }).length;
  document.getElementById('shSub').textContent = todayN === undefined ? '' : evs.length + ' booking' + (evs.length === 1 ? '' : 's') + ' today' + (over ? ' · ' + over + ' OVERDUE' : soon ? ' · ' + soon + ' due this week' : '');
  document.getElementById('shToday').innerHTML = '<span class="rail-title">Today · ' + today + '</span>' +
    (evs.length ? evs.map(function(e){ return '<div class="sh-ev"><span class="et mono">' + (e.h || '—') + '</span><span>' + e.t + '</span></div>'; }).join('') : '<div class="sh-ev"><span>Nothing booked today.</span></div>');
}
document.getElementById('shAdd').addEventListener('click', function(){ if (ENTRY) openAdd('event'); });
function buildRecords(){
  var rows = state.events.map(function(e){ return { kind: 'event', title: e.t, day: e.d, detail: e.h }; });
  state.renewals.forEach(function(r){ rows.push({ kind: 'renewal', title: r.n, day: 'in ' + r.dd + ' days', detail: r.nt }); });
  return rows;
}
async function sync(){
  var btn = document.getElementById('syncBtn'); btn.innerText = 'Syncing…';
  try {
    if (typeof window.__opsDeskSubmit__ === 'function') {
      await window.__opsDeskSubmit__({ records: buildRecords() });
      toast('Synced to OpsDesk');
    } else { toast('Saved locally'); }
  } catch (e) { toast('Sync failed'); }
  btn.innerText = 'Sync Diary';
}
// Engine 2: the ledger is the console's memory. Boot hydrates from the latest
// confirmed event (applyLoaded merges server records into seeded state); every
// edit auto-persists a full snapshot through the same submit bridge.
function applyLoaded(records){
  if (!records || !records.length) return;
  records.forEach(function(r){
    if (!r || !r.title) return;
    if (r.kind === 'event'){
      var e = state.events.find(function(x){ return x.t === r.title; });
      var d = DAYS.indexOf(String(r.day || '')) !== -1 ? String(r.day) : null;
      if (e){ if (d) e.d = d; e.h = String(r.detail || ''); }
      else state.events.push({ t: String(r.title), d: d || DAYS[TODAY_IDX], h: String(r.detail || '') });
    } else if (r.kind === 'renewal'){
      var m = /in (-?\\d+) days?/.exec(String(r.day || ''));
      var dd = m ? parseInt(m[1], 10) : 0;
      var rn = state.renewals.find(function(x){ return x.n === r.title; });
      if (rn){ rn.dd = dd; rn.nt = String(r.detail || ''); }
      else state.renewals.push({ n: String(r.title), dd: dd, nt: String(r.detail || '') });
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
  var rows = [['kind', 'title', 'day', 'detail']];
  buildRecords().forEach(function(r){ rows.push([r.kind, r.title, r.day, r.detail]); });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'diary.csv'; a.click();
  toast('Exported CSV');
}
(function boot(){
  var s = loadLocal(); if (s && (s.events || s.renewals)) state = s;
  var wl = document.getElementById('weekLabel');
  if (wl) wl.textContent = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  PERSIST.hydrate(true).then(render);
})();
</script>
</body>
</html>`;
}
