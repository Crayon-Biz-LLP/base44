// Archetype #7: Token Queue — counters × live tokens × wait intelligence.
// Same doctrine: the model chooses nouns (counter/operator names, token labels,
// purposes); ALL behavior lives here as proven code. Walk-in businesses don't
// book — they queue. "Now serving #23" is the whole product.
//
// Contract parity: #modal/.open mechanics, #editF0 focus, __opsDeskSubmit__
// bridge, storage-shim persistence, toast, spotlight dim/hit, #auditBanner,
// #staffHome + sh-* classes, body.entry scoping, warm toasts.
//
// Schema doctrine: nested arrays ≤3 properties, everything required, no
// .default()/.optional() inside nested arrays, scalars first / arrays last.
// The model proposes {label, purpose} only; the platform assigns counters
// round-robin (assignment is a platform concern, not a model concern).
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { esc, jstr } from "./escape";
import { logoOf } from "./branding";
import { chromeFonts, chromeCss, chromeJs, icon } from "./chrome";

export const QueueSchema = z.object({
  productName: z.string().describe("Short invented product name, e.g. 'TokenSetu'"),
  logoText: z.string().min(1),
  tagline: z.string(),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dark: z.boolean(),
  searchHint: z.string(),
  advisory: z.string(),
  avgMinutes: z.number().positive().describe("Average minutes the counter spends with one person"),
  counters: z.array(z.object({ name: z.string() })).min(1).max(8).describe("Serving counters — usually named by the operator/staff who runs them, e.g. 'Dr. Rao', 'Counter 1', 'Billing'"),
  tokens: z.array(z.object({
    label: z.string(),
    purpose: z.string(),
  })).min(4).max(80).describe("Today's tokens so far. label = the number/name called out (e.g. '23', 'A-12'); purpose = short customer-facing phrase (e.g. 'Fever check', 'Ration — BPL'). Seed a realistic mid-morning volume: some done, 1-2 being served now, the rest waiting. Labels ascending"),
  voice: z.object({
    boardTitle: z.string().describe("Insider name for the queue board, e.g. 'OPD Line', 'Token Board'"),
    personNoun: z.string().describe("What one person in the queue is called here, e.g. 'patient', 'customer'"),
    searchExamples: z.array(z.string()).max(5).describe("What staff type, e.g. '23', 'fever', 'Ration'"),
    guidelines: z.array(z.object({ title: z.string(), detail: z.string() })).max(3).describe("Trade coaching for smooth queues — in THIS trade's words"),
  }).describe("Domain voice — the board must read like this trade's own queue").optional(),
  heuristics: z.object({
    rushPerCounter: z.number().int().min(2).max(30).describe("People waiting per counter above which it's a rush (e.g. 6)"),
  }).describe("Judgment as numbers — drives the rush verdict").optional(),
});

export type QueueConfig = z.infer<typeof QueueSchema>;

export async function extractQueueConfig(userPrompt: string): Promise<QueueConfig> {
  return generateWithRepair<QueueConfig>({
        prompt: `A manager described a walk-in counter/token operation. Extract the queue config.

MANAGER: "${userPrompt}"

Rules:
- counters: 1-6 serving counters, named the way staff say them (a doctor's name, 'Counter 1', 'Billing desk').
- tokens: 12-24 realistic tokens for TODAY so far. label = token number called out ('23', 'A-12') ascending; purpose = short customer-facing phrase. Mark the story: earliest ~60% done, 1-2 being served now, rest waiting (the platform stores status by position — do not provide it).
- avgMinutes: realistic minutes per person at the counter (5-15 typical).
- accentHex: a #rrggbb hex color suited to the domain. dark: true unless told otherwise.
- tagline: one short line. searchHint: what staff search. advisory: one domain best-practice tip for smooth queues. productName: invented, e.g. 'TokenSetu'.
- VOICE — make the board speak this trade's language: boardTitle (insider name for the queue board), personNoun (one person waiting is a…), searchExamples (real things typed here), guidelines (2-3 coaching tips with this trade's vocabulary and reasons).
- HEURISTICS — judgment as numbers: rushPerCounter (people waiting per counter that counts as a rush, e.g. 6).`,
      },
      QueueSchema,
      5);
}

export function assembleQueue(cfg: QueueConfig): string {
  const theme = cfg.dark
    ? { bg: "#0f172a", surface: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", input: "#0b1220" }
    : { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#ffffff" };
  const cJson = jstr(cfg.counters.map(c => c.name));
  // Tokens: model gives {label, purpose}; platform assigns counter round-robin
  // and derives status from position (done → serving → waiting).
  const tJson = jstr(cfg.tokens.map((t, idx) => {
    const st = idx < Math.floor(cfg.tokens.length * 0.6) ? "done" : (idx < Math.floor(cfg.tokens.length * 0.6) + cfg.counters.length ? "serving" : "waiting");
    return { n: t.label, p: t.purpose, c: cfg.counters[idx % cfg.counters.length].name, s: st };
  }));
  const V = cfg.voice ?? { boardTitle: "Token Board", personNoun: "person", searchExamples: [] as string[], guidelines: [] as { title: string; detail: string }[] };
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
.kpi:nth-child(3) { border-left:3px solid var(--info); }
.kpi:nth-child(4) { border-left:3px solid var(--danger); }
.kpi .label { font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:1px; font-weight:600; display:flex; align-items:center; gap:5px; }
.kpi .val { font-size:24px; font-weight:800; letter-spacing:-0.02em; margin-top:4px; }
.badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid; font-weight:700; white-space:nowrap; }
.badge.ok { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.badge.part { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.badge.none { color:#94a3b8; border-color:rgba(148,163,184,.25); background:rgba(148,163,184,.08); }
.badge.serving { color:#000; background:var(--accent); border-color:var(--accent); }
.banner { display:none; margin-bottom:12px; padding:10px 14px; border-radius:10px; border:1px solid rgba(248,113,113,.35); background:rgba(248,113,113,.08); color:#f87171; font-size:13px; font-weight:600; align-items:center; gap:10px; }
.banner.open { display:flex; }
.qgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:12px; margin-bottom:14px; }
.qcard { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; }
.qcard .cname { font-size:12px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.6px; }
.now-num { font-size:38px; font-weight:800; letter-spacing:-0.03em; line-height:1.15; margin:2px 0 1px; }
.now-next { font-size:11.5px; color:var(--muted); }
.qcard .qacts { display:flex; gap:8px; margin-top:10px; }
.qbtn { flex:1; padding:9px 6px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-weight:700; font-size:12.5px; cursor:pointer; }
.qbtn.primary { background:var(--accent); color:#000; border-color:var(--accent); }
.qrow { display:flex; align-items:center; gap:12px; padding:10px 12px; border-bottom:1px solid var(--border); cursor:pointer; }
.qrow:last-child { border-bottom:0; }
.qrow:hover { background:var(--bg); }
.qrow.dim { opacity:.22; filter:saturate(.4); }
.qrow.hit { background:color-mix(in srgb, var(--accent) 8%, transparent); }
.qnum { font-weight:800; font-size:15px; min-width:52px; font-variant-numeric:tabular-nums; }
.qwhy { flex:1; font-size:13px; }
.qctr { font-size:11px; color:var(--muted); white-space:nowrap; }
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
.gi, .qcard { border-radius:var(--r-md); }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } .searchwrap { display:none; } }
/* Entry mode — staff: the counter operator sees their counter's line. */
body.entry .grid-4, body.entry #chipsRow, body.entry #syncBtn, body.entry #search,
body.entry button[onclick="exportCsv()"], body.entry #verdict, body.entry .lifecycle { display:none; }
/* ---- Staff Home: the operator's OWN screen — their counter, the person
   being served, one button each. No board jargon. ------------------------ */
#staffHome { display:none; padding:4px 22px 64px; max-width:640px; margin:0 auto; }
body.entry #staffHome { display:block; }
body.entry .hero, body.entry .stage, body.entry .footnotes, body.entry .qgrid { display:none; }
body.entry main#mapView { padding-top:4px; }
.sh-greet { margin:10px 0 4px; }
.sh-hi { font-size:27px; font-weight:800; letter-spacing:-0.02em; display:block; }
.sh-sub { color:var(--muted); font-size:13.5px; display:block; margin-top:3px; }
.sh-serve { background:var(--surface); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:14px; padding:18px; margin:18px 0 14px; text-align:center; }
.sh-now-label { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); font-weight:700; }
.sh-now-num { font-size:44px; font-weight:800; letter-spacing:-0.03em; margin:4px 0; }
.sh-now-why { color:var(--muted); font-size:13.5px; }
.sh-line { font-size:12.5px; color:var(--muted); margin-top:8px; }
.sh-save { width:100%; padding:16px; border-radius:14px; border:0; background:var(--accent); color:#000; font-size:17px; font-weight:800; margin-top:14px; cursor:pointer; }
.sh-save:active { transform:scale(.99); }
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
  <span class="meta-chip mono">${cfg.counters.length} COUNTER${cfg.counters.length > 1 ? "S" : ""} · ~${cfg.avgMinutes} MIN/${esc(V.personNoun.toUpperCase())}</span>
  <div class="searchwrap"><input id="search" class="input" placeholder="${esc(searchPh)}" aria-label="Search" oninput="render()"><span class="kbd">⌘K</span></div>
  <button class="btn" onclick="exportCsv()">${icon("download")} Export CSV</button>
  <button id="syncBtn" class="btn primary" onclick="sync()">${icon("upload")} Sync Queue</button>
  <span id="syncState" class="sync-chip"></span>
</header>
<section class="hero">
  <div class="hero-side">
    <span class="hero-label">Average ${cfg.avgMinutes} min per ${esc(V.personNoun)}</span>
    <h1 class="hero-title">${esc(V.boardTitle || cfg.tagline)}</h1>
  </div>
  <div id="verdict"></div>
</section>
<section class="grid-4">
  <div class="kpi"><span class="label">${icon("users", 13)} Waiting now</span><div class="val mono" id="kpiWait">0</div></div>
  <div class="kpi"><span class="label">${icon("zap", 13)} Being served</span><div class="val mono tint-ok" id="kpiServing">0</div></div>
  <div class="kpi"><span class="label">${icon("check", 13)} Served today</span><div class="val mono tint-info" id="kpiDone">0</div></div>
  <div class="kpi"><span class="label">${icon("clock", 13)} Est. wait</span><div class="val mono tint-danger" id="kpiEta">0 min</div></div>
</section>
<main id="mapView">
  <section id="staffHome">
    <div class="sh-greet"><span class="sh-hi" id="shHi"></span><span class="sh-sub" id="shSub"></span></div>
    <div class="sh-serve" id="shServe"></div>
    <button class="sh-save" id="shDone">Served ✓ — call the next one</button>
    <button class="sh-nextbtn" id="shNew">+ Add walk-in token</button>
    <div class="sh-note">${icon("check", 14)} <span>The board updates for everyone by itself.</span></div>
  </section>
  <div class="qgrid" id="counterGrid"></div>
  <div id="auditBanner" class="banner"><span>⚠</span><span id="auditText"></span></div>
  <div class="lifecycle" style="margin-bottom:10px">
    <button class="btn primary" onclick="openAdd()">${icon("plus")} New Token</button>
  </div>
  <div class="stage">
    <div class="rail-title" style="margin-bottom:8px">Today's Line</div>
    <div class="card" style="padding:2px 12px" id="lineCard"><div id="tokenList"></div></div>
  </div>
  <div class="footnotes">
    <div class="muted advisory">${icon("lightbulb", 13)} ${cfg.advisory}</div>
    ${V.guidelines.length ? `<div class="glist">${V.guidelines.map(g => `<div class="gi"><b>${g.title}</b><span>${g.detail}</span></div>`).join("")}</div>` : ""}
  </div>
</main>
<div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
  <div class="card" style="width:min(440px,92vw);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px">
    <h3 style="margin:0 0 12px" id="modalTitle">Token</h3>
    <input id="editF0" class="input" style="width:100%;margin-bottom:10px" placeholder="Token number" aria-label="Token number">
    <input id="editF1" class="input" style="width:100%;margin-bottom:10px" placeholder="Purpose" aria-label="Purpose">
    <select id="ctrSel" class="input" aria-label="Counter" style="width:100%;margin-bottom:10px"></select>
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="applyEdit()">Apply</button>
    </div>
  </div>
</div>
<div id="toast" class="toast"></div>
${chromeJs({ syncLabel: 'Sync Queue' })}
<script>
var COUNTERS = ${cJson};
var AVG_MIN = ${cfg.avgMinutes};
var state = { tokens: ${tJson} }, editing = null;
var HZ = ${H ? jstr({ rush: H.rushPerCounter }) : "null"};
var UNIT = ${jstr(V.personNoun)};
var touched = {};
function waitingFor(c){ return state.tokens.filter(function(t){ return t.c === c && t.s === 'waiting'; }); }
function servingOf(c){ return state.tokens.find(function(t){ return t.c === c && t.s === 'serving'; }); }
function nextUp(c){ return waitingFor(c)[0] || null; }
function render(){
  var cg = document.getElementById('counterGrid'); cg.innerHTML = '';
  var wait = 0, serving = 0, done = 0;
  state.tokens.forEach(function(t){ if (t.s === 'waiting') wait++; else if (t.s === 'serving') serving++; else done++; });
  COUNTERS.forEach(function(c){
    var cur = servingOf(c), nxt = nextUp(c), wq = waitingFor(c);
    var line = wq.slice(1, 3).map(function(t){ return t.n; }).join(' · ');
    var card = document.createElement('div');
    card.className = 'qcard';
    card.innerHTML = '<div class="spread"><span class="cname">' + c + '</span><span class="badge ' + (cur ? 'serving' : 'none') + '">' + (cur ? 'SERVING' : 'FREE') + '</span></div>' +
      '<div class="now-num mono">' + (cur ? cur.n : '—') + '</div>' +
      '<div class="now-next">' + (cur ? cur.p : 'No one being served') + (line ? ' · next: ' + line : '') + '</div>' +
      '<div class="qacts"><button class="qbtn primary" data-serve="' + c + '">' + (cur ? 'Served ✓' : 'Call next') + '</button><button class="qbtn" data-walk="' + c + '">+ Walk-in</button></div>';
    cg.appendChild(card);
  });
  document.getElementById('kpiWait').innerText = wait;
  document.getElementById('kpiServing').innerText = serving;
  document.getElementById('kpiDone').innerText = done;
  var perC = wait / Math.max(1, COUNTERS.length);
  document.getElementById('kpiEta').innerText = Math.round(perC * AVG_MIN) + ' min';
  var ab = document.getElementById('auditBanner');
  if (ab){
    var rush = COUNTERS.filter(function(c){ return waitingFor(c).length >= (HZ ? HZ.rush : 8); });
    ab.classList.toggle('open', rush.length > 0);
    if (rush.length) document.getElementById('auditText').innerText = 'Rush at ' + rush.join(', ') + ' — ' + wait + ' waiting, open a counter or speed up';
  }
  var vd = document.getElementById('verdict');
  if (vd){
    if (!HZ || wait === 0){ vd.style.display = 'none'; }
    else if (perC >= HZ.rush){
      vd.innerHTML = '<span class="vbig" style="color:#f87171">' + Math.round(perC * AVG_MIN) + 'm</span><span class="vtxt">rush — ' + wait + ' ' + (UNIT || 'person') + 's waiting across ' + COUNTERS.length + ' counter' + (COUNTERS.length > 1 ? 's' : '') + '</span>';
      vd.style.display = 'flex'; vd.style.borderLeftColor = '#f87171';
    } else {
      vd.innerHTML = '<span class="vbig" style="color:#34d399">' + Math.round(perC * AVG_MIN) + 'm</span><span class="vtxt">normal flow — line is moving</span>';
      vd.style.display = 'flex'; vd.style.borderLeftColor = '#34d399';
    }
  }
  renderList();
  if (ENTRY) renderStaffHome();
}
function renderList(){
  var el = document.getElementById('tokenList'); if (!el) return;
  var Q = (document.getElementById('search').value || '').toLowerCase();
  el.innerHTML = state.tokens.map(function(t, i){
    var hay = (t.n + ' ' + t.p + ' ' + t.c).toLowerCase();
    var dim = Q && hay.indexOf(Q) === -1 ? ' dim' : '';
    var hit = Q && hay.indexOf(Q) !== -1 ? ' hit' : '';
    var badge = t.s === 'done' ? 'badge ok' : t.s === 'serving' ? 'badge serving' : 'badge none';
    var txt = t.s === 'done' ? 'DONE' : t.s === 'serving' ? 'NOW' : 'WAITING';
    return '<div class="qrow' + dim + hit + '" data-i="' + i + '"><span class="qnum mono">' + t.n + '</span><span class="qwhy">' + t.p + '</span><span class="qctr">' + t.c + '</span><span class="' + badge + '">' + txt + '</span></div>';
  }).join('');
}
function serveNext(c){
  var cur = servingOf(c);
  if (cur){ cur.s = 'done'; toast(cur.n + ' served ✓'); }
  var nxt = nextUp(c);
  if (nxt){ nxt.s = 'serving'; }
  saveLocal(); render(); PERSIST.schedule();
}
function addToken(c){
  var nums = state.tokens.map(function(t){ return parseInt(String(t.n).replace(/[^0-9]/g, ''), 10) || 0; });
  var maxN = Math.max.apply(null, nums.concat([0]));
  state.tokens.push({ n: String(maxN + 1), p: 'Walk-in', c: c || COUNTERS[0], s: 'waiting' });
  saveLocal(); render(); toast('Token ' + (maxN + 1) + ' added'); PERSIST.schedule();
}
function openAdd(){
  LIFECYCLE = { mode: 'add' };
  document.getElementById('modalTitle').innerText = 'New Token';
  document.getElementById('editF0').value = '';
  document.getElementById('editF1').value = '';
  var sel = document.getElementById('ctrSel'); sel.innerHTML = '';
  COUNTERS.forEach(function(c){ var o = document.createElement('option'); o.value = c; o.text = c; sel.appendChild(o); });
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
var LIFECYCLE = { mode: 'edit', i: null };
function openEdit(i){
  editing = i;
  var t = state.tokens[i];
  document.getElementById('modalTitle').innerText = 'Token ' + t.n;
  document.getElementById('editF0').value = t.n;
  document.getElementById('editF1').value = t.p;
  var sel = document.getElementById('ctrSel'); sel.innerHTML = '';
  COUNTERS.forEach(function(c){ var o = document.createElement('option'); o.value = c; o.text = c; if (c === t.c) o.selected = true; sel.appendChild(o); });
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
function applyEdit(){
  var n = document.getElementById('editF0').value.trim();
  var p = document.getElementById('editF1').value.trim();
  var c = document.getElementById('ctrSel').value || COUNTERS[0];
  if (LIFECYCLE.mode === 'add'){
    if (!n) { closeModal(); return; }
    state.tokens.push({ n: n, p: p || 'Walk-in', c: c, s: 'waiting' });
  } else if (editing != null){
    var t = state.tokens[editing];
    if (t){ if (n) t.n = n; t.p = p; t.c = c; }
  }
  saveLocal(); render(); closeModal(); toast(ENTRY ? 'Sent to boss ✓' : 'Saved'); PERSIST.schedule();
}
document.getElementById('counterGrid').addEventListener('click', function(ev){
  var s = ev.target.closest('[data-serve]'); if (s){ serveNext(s.getAttribute('data-serve')); return; }
  var w = ev.target.closest('[data-walk]'); if (w){ addToken(w.getAttribute('data-walk')); }
});
document.getElementById('tokenList').addEventListener('click', function(ev){
  var r = ev.target.closest('.qrow'); if (!r) return;
  openEdit(parseInt(r.getAttribute('data-i'), 10));
});
/* Entry mode: counter operators. Name match → their counter. */
var ENTRY = null, ENTRY_CTR = null;
function setEntry(n){
  var q = String(n || '').trim().toLowerCase(); if (!q) return;
  var c = COUNTERS.find(function(x){ return x.toLowerCase().indexOf(q) === 0 || q.indexOf(x.toLowerCase()) !== -1; });
  ENTRY = String(n).trim();
  ENTRY_CTR = c || COUNTERS[0];
  document.body.classList.add('entry');
  renderStaffHome();
}
function renderStaffHome(){
  if (!ENTRY || !ENTRY_CTR) return;
  var hi = document.getElementById('shHi'); if (!hi) return;
  hi.textContent = 'Hi ' + ENTRY;
  var cur = servingOf(ENTRY_CTR), wq = waitingFor(ENTRY_CTR), nxt = nextUp(ENTRY_CTR);
  document.getElementById('shSub').textContent = wq.length + ' waiting at your counter — take them one by one';
  var box = document.getElementById('shServe');
  box.innerHTML = '<span class="sh-now-label">Now serving</span><div class="sh-now-num mono">' + (cur ? cur.n : '—') + '</div><div class="sh-now-why">' + (cur ? cur.p : 'Nobody yet — call the next') + '</div><div class="sh-line">' + (nxt ? 'Next: ' + nxt.n + ' · ' + nxt.p : 'Line empty') + '</div>';
}
document.getElementById('shDone').addEventListener('click', function(){ if (ENTRY) serveNext(ENTRY_CTR); });
document.getElementById('shNew').addEventListener('click', function(){ if (ENTRY) addToken(ENTRY_CTR); });
function buildRecords(){
  return state.tokens.map(function(t){ return { token: t.n, purpose: t.p, counter: t.c, status: t.s }; });
}
// Engine 2: the ledger is the console's memory. Boot hydrates from the latest
// confirmed event (applyLoaded merges server records into seeded state); every
// edit auto-persists a full snapshot through the same submit bridge.
function applyLoaded(records){
  if (!records || !records.length) return;
  records.forEach(function(r){
    if (!r || !r.token) return;
    var t = state.tokens.find(function(x){ return x.n === String(r.token); });
    var st = (r.status === 'done' || r.status === 'serving' || r.status === 'waiting') ? r.status : undefined;
    if (t){ if (r.purpose) t.p = String(r.purpose); if (r.counter && COUNTERS.indexOf(String(r.counter)) !== -1) t.c = String(r.counter); if (st) t.s = st; }
    else state.tokens.push({ n: String(r.token), p: String(r.purpose || 'Walk-in'), c: COUNTERS.indexOf(String(r.counter)) !== -1 ? String(r.counter) : COUNTERS[0], s: st || 'waiting' });
  });
  saveLocal();
}
function exportCsv(){
  var rows = [['token', 'purpose', 'counter', 'status']];
  state.tokens.forEach(function(t){ rows.push([t.n, t.p, t.c, t.s]); });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'queue.csv'; a.click();
  toast('Exported CSV');
}
(function boot(){
  var s = loadLocal(); if (s && s.tokens && s.tokens.length) state = s;
  PERSIST.hydrate(true).then(render);
})();
</script>
</body>
</html>`;
}
