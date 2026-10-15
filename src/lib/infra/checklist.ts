// Archetype #8: Checklist / Compliance Rounds — rounds × scored items ×
// pass-rate history. Same doctrine: the model chooses nouns (round names,
// item texts, guidance); ALL behavior lives here as proven code. FSSAI hygiene
// rounds, opening/closing SOPs, safety audits — recurring scored checks.
//
// Contract parity: #modal/.open mechanics, #editF0 focus, __opsDeskSubmit__
// bridge, storage-shim persistence, toast, spotlight dim/hit, #auditBanner,
// #staffHome + sh-* classes, body.entry scoping, warm toasts.
//
// Schema doctrine: nested arrays ≤3 properties, everything required, no
// .default()/.optional() inside nested arrays, scalars first / arrays last.
// The model proposes {name, text} only; the platform assigns item order and
// seeds pass/fail history deterministically (scores are a platform concern).
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { esc, jstr } from "./escape";
import { logoOf } from "./branding";
import { chromeFonts, chromeCss, icon } from "./chrome";

export const ChecklistSchema = z.object({
  productName: z.string().describe("Short invented product name, e.g. 'SafeRound'"),
  logoText: z.string().min(1),
  tagline: z.string(),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dark: z.boolean(),
  searchHint: z.string(),
  advisory: z.string(),
  passTargetPct: z.number().min(50).max(100).describe("Round pass-rate % below which the round is flagged (e.g. 90)"),
  rounds: z.array(z.object({ name: z.string() })).min(1).max(6).describe("The recurring rounds, e.g. 'Morning hygiene round', 'Opening checklist', 'Closing checklist', 'Evening safety round'"),
  items: z.array(z.object({
    round: z.string(),
    text: z.string(),
  })).min(4).max(60).describe("Check items; round must EXACTLY match a rounds name; text is the check as staff would say it, e.g. 'Chimney exhaust on', 'Oil temp logged'"),
  staff: z.array(z.object({ name: z.string() })).max(12).optional().describe("People who run the rounds — first names, verbatim if the operator named them. They get a personal round screen"),
  voice: z.object({
    boardTitle: z.string().describe("Insider name for the checklist home, e.g. 'Daily Rounds', 'The Book'"),
    roundNoun: z.string().describe("What one round is called here, e.g. 'round', 'check'"),
    searchExamples: z.array(z.string()).max(5).describe("What staff type, e.g. 'chimney', 'closing'"),
    guidelines: z.array(z.object({ title: z.string(), detail: z.string() })).max(3).describe("Trade coaching for clean audits — in THIS trade's words"),
  }).describe("Domain voice — the checklist must read like this trade's own rulebook").optional(),
  heuristics: z.object({
    streakTarget: z.number().int().min(2).max(30).describe("Consecutive all-pass rounds that earns the 'clean streak' flag (e.g. 5)"),
  }).describe("Judgment as numbers — drives the streak verdict").optional(),
});

export type ChecklistConfig = z.infer<typeof ChecklistSchema>;

export async function extractChecklistConfig(userPrompt: string): Promise<ChecklistConfig> {
  return generateWithRepair<ChecklistConfig>({
        prompt: `A manager described recurring checklists/inspection rounds. Extract the checklist config.

MANAGER: "${userPrompt}"

Rules:
- rounds: 1-5 recurring rounds verbatim if named (e.g. 'Morning hygiene round', 'Closing checklist').
- items: 6-20 checks spread across ALL rounds. text = the check phrased the way staff say it on the floor. round must EXACTLY match a rounds name.
- staff: list who runs rounds if the prompt names them (first names). They get a personal round screen.
- passTargetPct: pass-rate % below which a round is flagged (e.g. 90).
- accentHex: a #rrggbb hex color suited to the domain. dark: true unless told otherwise.
- tagline: one short line. searchHint: what staff search. advisory: one domain best-practice tip for passing audits. productName: invented, e.g. 'SafeRound'.
- VOICE — make it speak this trade's language: boardTitle (insider name for the checklist home), roundNoun (what one round is called here), searchExamples (real things typed here), guidelines (2-3 coaching tips with this trade's vocabulary and reasons).
- HEURISTICS — judgment as numbers: streakTarget (consecutive all-pass rounds that earns a clean-streak flag, e.g. 5).`,
      },
      ChecklistSchema,
      5);
}

export function assembleChecklist(cfg: ChecklistConfig): string {
  const theme = cfg.dark
    ? { bg: "#0f172a", surface: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", input: "#0b1220" }
    : { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#ffffff" };
  const rJson = jstr(cfg.rounds.map(r => r.name));
  const people = (cfg.staff ?? []).map(s => s.name);
  // Items: model gives {round, text}; platform assigns order + round-robin
  // owner among named staff (or "Owner" when none) and seeds deterministic
  // history: yesterday all-pass except one miss on item 1 (drives the flag).
  const iJson = jstr(cfg.items.map((it, idx) => {
    const owner = people.length ? people[idx % people.length] : "Owner";
    return { r: it.round, t: it.text, o: owner, ok: idx !== 0, y: idx !== 1 };
  }));
  const V = cfg.voice ?? { boardTitle: "Daily Rounds", roundNoun: "round", searchExamples: [] as string[], guidelines: [] as { title: string; detail: string }[] };
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
.badge.warn { color:#f87171; border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.1); }
.badge.part { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.badge.none { color:#94a3b8; border-color:rgba(148,163,184,.25); background:rgba(148,163,184,.08); }
.banner { display:none; margin-bottom:12px; padding:10px 14px; border-radius:10px; border:1px solid rgba(248,113,113,.35); background:rgba(248,113,113,.08); color:#f87171; font-size:13px; font-weight:600; align-items:center; gap:10px; }
.banner.open { display:flex; }
.rgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:12px; margin-bottom:14px; }
.rnd-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; cursor:pointer; transition:all .12s; }
.rnd-card:hover { border-color:${cfg.accentHex}88; transform:translateY(-1px); }
.rnd-card.dim { opacity:.22; filter:saturate(.4); }
.rnd-card.hit { border-color:${cfg.accentHex}; box-shadow:0 0 0 2px ${cfg.accentHex}55; }
.rnd-card .rn { font-weight:800; font-size:14.5px; }
.rnd-card .rm { font-size:11px; color:var(--muted); margin-top:4px; }
.rnd-card .pbar { height:6px; border-radius:3px; background:var(--bg); border:1px solid var(--border); overflow:hidden; margin-top:10px; }
.rnd-card .pbar div { height:100%; }
.ck-item { display:flex; align-items:center; gap:12px; padding:11px 12px; border-bottom:1px solid var(--border); cursor:pointer; }
.ck-item:last-child { border-bottom:0; }
.ck-item:hover { background:var(--bg); }
.ck-item.dim { opacity:.22; filter:saturate(.4); }
.ck-item.hit { background:color-mix(in srgb, var(--accent) 8%, transparent); }
.ck-tick { width:22px; height:22px; border-radius:7px; border:2px solid var(--border); display:flex; align-items:center; justify-content:center; flex:none; color:#000; }
.ck-tick.y { background:#34d399; border-color:#34d399; }
.ck-tick.n { background:#f87171; border-color:#f87171; }
.ck-text { flex:1; font-size:13.5px; font-weight:600; }
.ck-meta { font-size:11px; color:var(--muted); white-space:nowrap; }
.ck-score { font-size:30px; font-weight:800; letter-spacing:-0.02em; }
.ck-pass { color:#34d399; } .ck-fail { color:#f87171; }
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
.gi, .rnd-card { border-radius:var(--r-md); }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } .searchwrap { display:none; } }
/* Entry mode — staff: the round-runner sees only their rounds. */
body.entry .grid-4, body.entry #syncBtn, body.entry #search, body.entry .rgrid,
body.entry button[onclick="exportCsv()"], body.entry #verdict, body.entry .lifecycle { display:none; }
/* ---- Staff Home: the round-runner's OWN screen — their items, big
   pass/fail ticks, live score. No audit jargon. -------------------------- */
#staffHome { display:none; padding:4px 22px 64px; max-width:640px; margin:0 auto; }
body.entry #staffHome { display:block; }
body.entry .hero, body.entry .stage, body.entry .footnotes { display:none; }
body.entry main#mapView { padding-top:4px; }
.sh-greet { margin:10px 0 4px; }
.sh-hi { font-size:27px; font-weight:800; letter-spacing:-0.02em; display:block; }
.sh-sub { color:var(--muted); font-size:13.5px; display:block; margin-top:3px; }
.sh-cards { display:grid; gap:10px; margin:18px 0 6px; }
.sh-ck { display:flex; align-items:center; gap:14px; width:100%; text-align:left; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px 18px; color:var(--text); cursor:pointer; font:inherit; }
.sh-ck:active { transform:scale(.98); }
.sh-ck .ck-tick { width:30px; height:30px; border-radius:10px; }
.sh-ck-name { font-weight:700; font-size:15.5px; display:block; }
.sh-ck-sub { color:var(--muted); font-size:12px; display:block; margin-top:2px; }
.sh-scorecard { background:var(--surface); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:14px; padding:16px 18px; margin-top:14px; display:flex; align-items:center; gap:14px; }
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
  <span class="meta-chip mono">${cfg.rounds.length} ROUND${cfg.rounds.length > 1 ? "S" : ""} · ${cfg.items.length} CHECKS · TARGET ${cfg.passTargetPct}%</span>
  <div class="searchwrap"><input id="search" class="input" placeholder="${esc(searchPh)}" aria-label="Search" oninput="render()"><span class="kbd">⌘K</span></div>
  <button class="btn" onclick="exportCsv()">${icon("download")} Export CSV</button>
  <button id="syncBtn" class="btn primary" onclick="sync()">${icon("upload")} Sync Rounds</button>
  <span id="syncState" class="sync-chip"></span>
</header>
<section class="hero">
  <div class="hero-side">
    <span class="hero-label">Pass target ${cfg.passTargetPct}% · resets daily</span>
    <h1 class="hero-title">${esc(V.boardTitle || cfg.tagline)}</h1>
  </div>
  <div id="verdict"></div>
</section>
<section class="grid-4">
  <div class="kpi"><span class="label">${icon("shield", 13)} Today's pass rate</span><div class="val mono" id="kpiPass">0%</div><div class="bar"><div id="barPass" style="width:0%"></div></div></div>
  <div class="kpi"><span class="label">${icon("check", 13)} Checks passed</span><div class="val mono tint-ok" id="kpiOk">0 / 0</div></div>
  <div class="kpi"><span class="label">${icon("alert", 13)} Misses</span><div class="val mono tint-danger" id="kpiMiss">0</div></div>
  <div class="kpi"><span class="label">${icon("zap", 13)} Clean streak</span><div class="val mono tint-info" id="kpiStreak">0</div></div>
</section>
<main id="mapView">
  <section id="staffHome">
    <div class="sh-greet"><span class="sh-hi" id="shHi"></span><span class="sh-sub" id="shSub"></span></div>
    <div class="sh-cards" id="shChecks"></div>
    <div class="sh-scorecard" id="shScore"></div>
    <div class="sh-note">${icon("check", 14)} <span>Tap once — tick or cross. It saves by itself.</span></div>
  </section>
  <div class="rgrid" id="roundGrid"></div>
  <div id="auditBanner" class="banner"><span>⚠</span><span id="auditText"></span></div>
  <div class="stage">
    <div class="rail-title" style="margin-bottom:8px" id="listTitle">All Checks — Today</div>
    <div class="card" style="padding:2px 12px" id="checkCard"><div id="checkList"></div></div>
  </div>
  <div class="footnotes">
    <div class="muted advisory">${icon("lightbulb", 13)} ${cfg.advisory}</div>
    ${V.guidelines.length ? `<div class="glist">${V.guidelines.map(g => `<div class="gi"><b>${g.title}</b><span>${g.detail}</span></div>`).join("")}</div>` : ""}
  </div>
</main>
<div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
  <div class="card" style="width:min(420px,92vw);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px">
    <h3 style="margin:0 0 12px" id="modalTitle">Check</h3>
    <input id="editF0" class="input" style="width:100%;margin-bottom:10px" placeholder="Check text" aria-label="Check text">
    <input id="editF1" class="input" style="width:100%;margin-bottom:10px" placeholder="Who runs it" aria-label="Who runs it">
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="applyEdit()">Apply</button>
    </div>
  </div>
</div>
<div id="toast" class="toast"></div>
<script>
var ROUNDS = ${rJson};
var TARGET = ${cfg.passTargetPct};
var STREAK_GOAL = ${H ? H.streakTarget : 5};
var state = { items: ${iJson} }, editing = null, roundFilter = null;
var HZ = ${H ? jstr({ streak: H.streakTarget }) : "null"};
var touched = {};
var LS_KEY = 'opsdesk_console_state';
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
function loadLocal(){ try{ var r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function mineNow(){ return ENTRY ? state.items.filter(function(it){ return (it.o || '').trim().toLowerCase() === ENTRY.toLowerCase(); }) : state.items; }
function roundStat(rn, items){
  var rs = items.filter(function(it){ return it.r === rn; });
  var ok = rs.filter(function(it){ return it.ok; }).length;
  return { total: rs.length, ok: ok, pct: rs.length ? Math.round(100 * ok / rs.length) : 0 };
}
function render(){
  var items = mineNow();
  var rg = document.getElementById('roundGrid'); rg.innerHTML = '';
  var Q = (document.getElementById('search').value || '').toLowerCase();
  var okN = 0, missN = 0, streak = 0;
  ROUNDS.forEach(function(rn){
    var st = roundStat(rn, items);
    okN += st.ok; missN += st.total - st.ok;
    var tone = st.pct >= TARGET ? '#34d399' : st.pct >= 70 ? '#fbbf24' : '#f87171';
    var dim = Q && rn.toLowerCase().indexOf(Q) === -1 ? ' dim' : '';
    var hit = Q && rn.toLowerCase().indexOf(Q) !== -1 ? ' hit' : '';
    var card = document.createElement('div');
    card.className = 'rnd-card' + dim + hit;
    card.setAttribute('data-round', rn);
    card.innerHTML = '<div class="spread"><span class="rn">' + rn + '</span><span class="badge ' + (st.pct >= TARGET ? 'ok' : st.pct >= 70 ? 'part' : 'warn') + '">' + st.pct + '%</span></div>' +
      '<div class="rm mono">' + st.ok + ' of ' + st.total + ' passed today</div>' +
      '<div class="pbar"><div style="width:' + st.pct + '%;background:' + tone + '"></div></div>';
    card.onclick = (function(r){ return function(){ roundFilter = (roundFilter === r ? null : r); render(); }; })(rn);
    rg.appendChild(card);
  });
  var allPct = items.length ? Math.round(100 * okN / items.length) : 0;
  document.getElementById('kpiPass').innerText = allPct + '%';
  document.getElementById('barPass').style.width = allPct + '%';
  document.getElementById('kpiOk').innerText = okN + ' / ' + items.length;
  document.getElementById('kpiMiss').innerText = missN;
  // Streak: consecutive fully-passed rounds ending today (today all-pass + yesterday all-pass = 2, etc.)
  var todayAll = items.length > 0 && okN === items.length;
  var yAll = items.length > 0 && items.every(function(it){ return it.y !== false; });
  streak = (todayAll ? 1 : 0) + (yAll ? 1 : 0);
  document.getElementById('kpiStreak').innerText = streak + (streak >= (HZ ? HZ.streak : 5) ? ' ✓' : '');
  var ab = document.getElementById('auditBanner');
  if (ab){
    ab.classList.toggle('open', allPct < TARGET && items.length > 0);
    if (allPct < TARGET && items.length > 0) document.getElementById('auditText').innerText = allPct + '% pass — below the ' + TARGET + '% target. ' + missN + ' check' + (missN > 1 ? 's' : '') + ' to fix before the next inspection';
  }
  var vd = document.getElementById('verdict');
  if (vd){
    if (!items.length){ vd.style.display = 'none'; }
    else if (todayAll && streak >= (HZ ? HZ.streak : 5)){
      vd.innerHTML = '<span class="vbig ck-pass">' + streak + '</span><span class="vtxt">clean streak — every check passing ' + streak + ' rounds running. Inspector-ready.</span>';
      vd.style.display = 'flex'; vd.style.borderLeftColor = '#34d399';
    } else {
      vd.innerHTML = '<span class="vbig mono" style="color:' + (allPct >= TARGET ? '#34d399' : '#f87171') + '">' + allPct + '%</span><span class="vtxt">' + (allPct >= TARGET ? 'above target — keep the rhythm' : missN + ' miss' + (missN > 1 ? 'es' : '') + ' today — fix before closing') + '</span>';
      vd.style.display = 'flex'; vd.style.borderLeftColor = allPct >= TARGET ? '#34d399' : '#f87171';
    }
  }
  renderList();
  if (ENTRY) renderStaffHome();
}
function renderList(){
  var el = document.getElementById('checkList'); if (!el) return;
  var Q = (document.getElementById('search').value || '').toLowerCase();
  var items = mineNow().filter(function(it){ return !roundFilter || it.r === roundFilter; });
  var shown = roundFilter ? roundFilter : 'All Checks — Today';
  var lt = document.getElementById('listTitle'); if (lt) lt.textContent = shown;
  el.innerHTML = items.map(function(it, i){
    var hay = (it.t + ' ' + it.r + ' ' + (it.o || '')).toLowerCase();
    var dim = Q && hay.indexOf(Q) === -1 ? ' dim' : '';
    var hit = Q && hay.indexOf(Q) !== -1 ? ' hit' : '';
    var tick = it.ok ? 'y' : 'n';
    return '<div class="ck-item' + dim + hit + '" data-i="' + i + '"><span class="ck-tick ' + tick + '">' + (it.ok ? '✓' : '✕') + '</span><span class="ck-text">' + it.t + '</span><span class="ck-meta">' + it.r + ' · ' + (it.o || '—') + '</span></div>';
  }).join('');
}
function toggleCheck(i){
  var it = mineNow()[i]; if (!it) return;
  it.ok = !it.ok;
  if (ENTRY) it.o = ENTRY;
  touched[i] = 1;
  saveLocal(); render(); toast(it.ok ? 'Passed ✓' : 'Marked failed'); PERSIST.schedule();
}
function openEdit(i){
  var items = mineNow(); var it = items[i]; if (!it) return;
  editing = { pool: items, i: i };
  document.getElementById('modalTitle').innerText = it.t;
  document.getElementById('editF0').value = it.t;
  document.getElementById('editF1').value = it.o || '';
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
function applyEdit(){
  if (editing && editing.pool){
    var it = editing.pool[editing.i];
    if (it){ it.t = document.getElementById('editF0').value.trim() || it.t; it.o = document.getElementById('editF1').value.trim(); }
  }
  saveLocal(); render(); closeModal(); toast(ENTRY ? 'Sent to boss ✓' : 'Saved'); PERSIST.schedule();
}
function toast(m){ var t = document.getElementById('toast'); t.innerText = m; t.classList.add('open'); setTimeout(function(){ t.classList.remove('open'); }, 2000); }
document.getElementById('checkList').addEventListener('click', function(ev){
  var r = ev.target.closest('.ck-item'); if (!r) return;
  if (ev.target.closest('.ck-tick')) toggleCheck(parseInt(r.getAttribute('data-i'), 10));
  else openEdit(parseInt(r.getAttribute('data-i'), 10));
});
/* Entry mode: round-runners. Name match → their checks. */
var ENTRY = null;
function setEntry(n){
  var q = String(n || '').trim().toLowerCase(); if (!q) return;
  ENTRY = state.items.some(function(it){ return (it.o || '').trim().toLowerCase() === q; }) ? String(n).trim() : null;
  if (ENTRY){ document.body.classList.add('entry'); renderStaffHome(); }
}
function renderStaffHome(){
  if (!ENTRY) return;
  var hi = document.getElementById('shHi'); if (!hi) return;
  hi.textContent = 'Hi ' + ENTRY;
  var mine = mineNow();
  var done = mine.filter(function(it){ return it.ok; }).length;
  document.getElementById('shSub').textContent = mine.length ? done + ' of ' + mine.length + ' checks done — tick as you walk' : 'No checks assigned yet — the boss will add yours here';
  document.getElementById('shChecks').innerHTML = mine.map(function(it, i){
    var tick = it.ok ? 'y' : 'n';
    return '<button class="sh-ck" data-i="' + i + '"><span class="ck-tick ' + tick + '">' + (it.ok ? '✓' : '✕') + '</span><span><span class="sh-ck-name">' + it.t + '</span><span class="sh-ck-sub">' + it.r + '</span></span></button>';
  }).join('');
  var pct = mine.length ? Math.round(100 * done / mine.length) : 0;
  document.getElementById('shScore').innerHTML = '<span class="ck-score mono" style="color:' + (pct >= TARGET ? '#34d399' : '#fbbf24') + '">' + pct + '%</span><span class="vtxt">your round today' + (pct === 100 ? ' — perfect, that\\u2019s a clean sheet' : ' — tap any check to flip it') + '</span>';
}
document.getElementById('shChecks').addEventListener('click', function(ev){
  var c = ev.target.closest('.sh-ck'); if (!c || !ENTRY) return;
  toggleCheck(parseInt(c.getAttribute('data-i'), 10));
});
function buildRecords(){
  return state.items.map(function(it){ return { round: it.r, check: it.t, assigned_to: it.o, passed: it.ok ? 1 : 0 }; });
}
async function sync(){
  var btn = document.getElementById('syncBtn'); btn.innerText = 'Syncing…';
  try {
    if (typeof window.__opsDeskSubmit__ === 'function') {
      await window.__opsDeskSubmit__({ records: buildRecords() });
      toast('Synced to OpsDesk');
    } else { toast('Saved locally'); }
  } catch (e) { toast('Sync failed'); }
  btn.innerText = 'Sync Rounds';
}
// Engine 2: the ledger is the console's memory. Boot hydrates from the latest
// confirmed event (applyLoaded merges server records into seeded state); every
// edit auto-persists a full snapshot through the same submit bridge.
function applyLoaded(records){
  if (!records || !records.length) return;
  records.forEach(function(r){
    if (!r || !r.check) return;
    var it = state.items.find(function(x){ return x.t === r.check; });
    if (it){
      if (r.round && ROUNDS.indexOf(r.round) !== -1) it.r = r.round;
      if (r.assigned_to) it.o = String(r.assigned_to);
      if (r.passed !== undefined && r.passed !== null) it.ok = !!parseInt(r.passed, 10);
    } else {
      state.items.push({ r: ROUNDS.indexOf(r.round) !== -1 ? r.round : ROUNDS[0], t: String(r.check), o: String(r.assigned_to || ''), ok: !!parseInt(r.passed || 0, 10), y: true });
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
  var rows = [['round', 'check', 'assigned_to', 'passed']];
  state.items.forEach(function(it){ rows.push([it.r, it.t, it.o || '', it.ok ? 1 : 0]); });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rounds.csv'; a.click();
  toast('Exported CSV');
}
(function boot(){
  var s = loadLocal(); if (s && s.items && s.items.length) state = s;
  PERSIST.hydrate(true).then(render);
})();
</script>
</body>
</html>`;
}
