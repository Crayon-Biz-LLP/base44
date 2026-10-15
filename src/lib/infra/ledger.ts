// Archetype #4: Ledger — chronological entries × running balances × threshold
// intelligence. Same doctrine: the model chooses nouns (account names, entry
// labels, entry types, amounts); ALL behavior lives here as proven code.
// Contract parity: #modal/.open mechanics, #editF0 focus, __opsDeskSubmit__
// bridge, storage-shim persistence, toast, spotlight dim/hit, #auditBanner.
//
// Schema doctrine (hard-won this session): Gemini 3.x structured output
// rejects arrays-of-objects with ≥4 properties — every nested array here has
// ≤3 properties, every property is required, no .default()/.optional(),
// scalars first / arrays last (TargetBoardSchema twin).
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { esc, jstr } from "./escape";
import { logoOf } from "./branding";
import { chromeFonts, chromeCss, icon } from "./chrome";

export const LedgerSchema = z.object({
  productName: z.string().describe("Short invented product name, e.g. 'CashBook Pro'"),
  logoText: z.string().min(1),
  tagline: z.string(),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dark: z.boolean(),
  searchHint: z.string(),
  advisory: z.string(),
  openingBalance: z.number(),
  lowBalanceThreshold: z.number().int().positive(),
  accounts: z.array(z.object({ name: z.string() })).min(1).max(12).describe("Money accounts (Cash, Bank, UDIhaar ledger...), verbatim if named"),
  staff: z.array(z.object({ name: z.string() })).max(12).optional().describe("Counter/warehouse staff who log entries — first names, verbatim if the owner named them. They get a personal entry screen"),
  entryTypes: z.array(z.object({
    label: z.string(),
    sign: z.string(),
  })).min(2).max(8).describe("Entry categories; sign must be exactly 'in' (money received) or 'out' (money paid)"),
  entries: z.array(z.object({
    label: z.string(),
    amount: z.number().positive(),
    type: z.string(),
  })).min(4).max(60).describe("Chronological entries; type must exactly match an entryTypes label; amounts are positive"),
  voice: z.object({
    boardTitle: z.string().describe("Insider name for this book, e.g. 'Counter Khata', 'Daily Cash Book', 'Register'"),
    entryNoun: z.string().describe("What one entry is called here, e.g. 'entry', 'voucher', 'transaction'"),
    searchExamples: z.array(z.string()).max(5).describe("What the owner types, e.g. 'supplier', 'cash sale', 'rent'"),
    guidelines: z.array(z.object({ title: z.string(), detail: z.string() })).max(3).describe("Trade coaching for keeping the book clean — in THIS trade's words"),
  }).describe("Domain voice — the book must read like this trade's own khata").optional(),
  heuristics: z.object({
    outflowCapPct: z.number().min(10).max(90).describe("Day's outflows exceeding this % of the day's inflows gets flagged (e.g. 60)"),
  }).describe("Judgment as numbers — drives the burn/pace verdict").optional(),
});
// Voice + heuristics: the trade's words and judgment-as-numbers. Optional
// with generic fallbacks so pre-voice configs keep assembling.

export type LedgerConfig = z.infer<typeof LedgerSchema>;

export async function extractLedgerConfig(userPrompt: string): Promise<LedgerConfig> {
  return generateWithRepair<LedgerConfig>({
        prompt: `A shop owner described money they need to track. Extract the ledger config.

OWNER: "${userPrompt}"

Rules:
- accounts: verbatim if named, else invent 1-3 realistic for the domain.
- staff: if the owner mentions who works the counter/warehouse (clerks, helpers), list their first names. These staff each get a personal money-logging screen; every entry they log is stamped with their name.
- entryTypes: 2-6 categories; sign must be exactly 'in' (money received) or 'out' (money paid).
- entries: 8-16 realistic ones (invent if none named), chronological. type must EXACTLY match an entryTypes label. Mix inflows and outflows; include enough outflow that the running balance dips below lowBalanceThreshold at least once, then recovers.
- openingBalance: a sensible starting balance for this domain. lowBalanceThreshold: a safety line the owner would want an alert at.
- accentHex: a #rrggbb hex color suited to the domain. dark: true unless told otherwise.
- tagline: one short line. searchHint: what to search. advisory: one domain best-practice tip for keeping books clean. productName: invented, e.g. 'CashBook Pro'.
- VOICE — make the book speak this trade's language: boardTitle (insider name for the register), entryNoun (what one entry is called here), searchExamples (real payees/categories typed here), guidelines (2-3 coaching tips with this trade's vocabulary and reasons).
- HEURISTICS — judgment as numbers: outflowCapPct (day's outflows above this % of the same day's inflows gets flagged, e.g. 60).`,
      },
      LedgerSchema,
      5);
}

export function assembleLedger(cfg: LedgerConfig): string {
  // Voice + heuristics: the trade's words and judgment-as-numbers. Optional
  // with generic fallbacks so pre-voice configs keep assembling.
  const V = cfg.voice ?? { boardTitle: "Ledger", entryNoun: "entry", searchExamples: [] as string[], guidelines: [] as { title: string; detail: string }[] };
  const H = cfg.heuristics ?? null;
  const searchPh = (V.searchExamples.length ? V.searchExamples.join(", ") : cfg.searchHint);
  const theme = cfg.dark
    ? { bg: "#0f172a", surface: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", input: "#0b1220" }
    : { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#ffffff" };
  const sJson = jstr(cfg.accounts.map(a => a.name));
  const tJson = jstr(cfg.entryTypes.map(t => ({ l: t.label, s: t.sign === "in" ? 1 : -1 })));
  // Entries: model provides {label, amount, type}; the platform deterministically
  // assigns day + account (account cycling when multiple accounts exist).
  const eJson = jstr(cfg.entries.map((e, idx) => ({
    l: e.label,
    a: e.amount,
    t: e.type,
    d: idx + 1,
    ac: cfg.accounts.length > 1 ? cfg.accounts[idx % cfg.accounts.length].name : cfg.accounts[0].name,
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
.kpi:nth-child(2) { border-left:3px solid var(--ok); }
.kpi:nth-child(3) { border-left:3px solid var(--danger); }
.kpi:nth-child(4) { border-left:3px solid var(--info); }
.kpi .label { font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:1px; font-weight:600; display:flex; align-items:center; gap:5px; }
.kpi .val { font-size:24px; font-weight:800; letter-spacing:-0.02em; margin-top:4px; }
.badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid; font-weight:700; white-space:nowrap; }
.badge.ok { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.badge.warn { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.badge.breach { color:#f87171; border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.1); }
.banner { display:none; margin-bottom:12px; padding:10px 14px; border-radius:10px; border:1px solid rgba(248,113,113,.35); background:rgba(248,113,113,.08); color:#f87171; font-size:13px; font-weight:600; align-items:center; gap:10px; }
.banner.open { display:flex; }
.chips { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
.chip { font-size:11px; padding:4px 10px; border-radius:999px; border:1px solid var(--border); background:var(--surface); cursor:pointer; font-weight:600; color:var(--muted); }
.chip.on { color:#000; background:var(--accent); border-color:var(--accent); }
.ledger { width:100%; border-collapse:collapse; }
.ledger th { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); text-align:left; padding:8px 10px; border-bottom:1px solid var(--border); }
.ledger td { padding:9px 10px; border-bottom:1px solid var(--border); font-size:13px; }
.erow { cursor:pointer; transition:background .12s; }
.erow:hover { background:${cfg.accentHex}11; }
.erow.dim { opacity:.25; }
.erow.hit { background:${cfg.accentHex}1c; box-shadow:inset 3px 0 0 ${cfg.accentHex}; }
.amt.in { color:#34d399; } .amt.out { color:#f87171; }
.modal { position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:center; justify-content:center; z-index:50; } .modal.open { display:flex; }
.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--accent); color:#000; padding:10px 20px; border-radius:10px; font-weight:700; display:none; z-index:60; } .toast.open { display:block; }
.sync-chip { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid var(--border); color:var(--muted); font-weight:600; white-space:nowrap; } .sync-chip:empty { display:none; }
.meta-chip { font-size:10px; padding:2px 8px; border:1px solid var(--border); border-radius:999px; color:var(--muted); letter-spacing:.8px; font-weight:600; white-space:nowrap; }
.glist { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:8px; margin-bottom:12px; }
.gi { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 12px; font-size:12px; }
.gi b { display:block; font-size:12px; margin-bottom:2px; }
.gi span { color:var(--muted); }
#verdict { flex:1; display:none; align-items:center; gap:14px; border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:var(--r-md); padding:12px 18px; background:var(--surface); min-height:64px; font-size:13.5px; font-weight:600; line-height:1.5; }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } .ledger .h-day, .ledger .h-acct { display:none; } }
.spark-wrap { border:1px solid var(--border); border-radius:12px; background:var(--surface); padding:14px 16px 10px; margin-bottom:14px; }
.spark-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.rail-title { font-size:11px; font-weight:700; letter-spacing:1px; color:var(--muted); text-transform:uppercase; }
.rail-title svg { margin-right:4px; }
.board-panel { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); padding:4px 10px 10px; overflow-x:auto; }
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
.spark-wrap { border-radius:var(--r-lg); }
.amt { font-weight:700; font-variant-numeric:tabular-nums; }
.banner { border-radius:var(--r-md); }
.gi { border-radius:var(--r-md); }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } .searchwrap { display:none; } .hero { flex-wrap:wrap; } }
/* Entry mode — staff: a khata is shared money knowledge; keep the data full,
   but give staff their OWN logging screen. Export/verdict/audit stay owner-only. */
.scope-hint { display:none; font-size:12px; font-weight:700; color:var(--accent); }
body.entry .scope-hint { display:inline; }
body.entry button[onclick="exportCsv()"], body.entry #verdict, body.entry #auditBanner { display:none; }
#staffHome { display:none; padding:4px 22px 64px; max-width:640px; margin:0 auto; }
body.entry #staffHome { display:block; }
body.entry .hero, body.entry .stage, body.entry .footnotes, body.entry #sparkWrap { display:none; }
body.entry main#mapView { padding-top:4px; }
.sh-greet { margin:10px 0 4px; }
.sh-hi { font-size:27px; font-weight:800; letter-spacing:-0.02em; display:block; }
.sh-sub { color:var(--muted); font-size:13.5px; display:block; margin-top:3px; }
.sh-balance { background:var(--surface); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:14px; padding:18px; margin:18px 0 14px; }
.sh-bnum { font-size:32px; font-weight:800; font-variant-numeric:tabular-nums; display:block; }
.sh-blabel { color:var(--muted); font-size:12.5px; }
.sh-btns { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
.sh-log { padding:20px; border-radius:14px; border:0; background:var(--ok, #34d399); color:#052e16; font-size:16px; font-weight:800; cursor:pointer; }
.sh-log.out { background:var(--danger, #f87171); color:#450a0a; }
.sh-log span { display:block; font-size:11.5px; font-weight:600; opacity:.75; margin-top:3px; }
.sh-log:active { transform:scale(.98); }
.sh-mine { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px 16px; }
.sh-mine b { font-size:13px; }
.sh-mine .mrow { display:flex; justify-content:space-between; font-size:13.5px; padding:7px 0; border-bottom:1px solid var(--border); }
.sh-mine .mrow:last-child { border-bottom:0; }
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
  <span class="meta-chip mono">${cfg.accounts.length} ACCOUNT${cfg.accounts.length > 1 ? "S" : ""} · ${cfg.entryTypes.length} TYPES</span>
  <div class="searchwrap"><input id="search" class="input" placeholder="${esc(searchPh)}" aria-label="Search" oninput="render()"><span class="kbd">⌘K</span></div>
  <button class="btn" onclick="exportCsv()">${icon("download")} Export CSV</button>
  <button id="syncBtn" class="btn primary" onclick="sync()">${icon("upload")} Sync Ledger</button>
  <span id="syncState" class="sync-chip"></span>
</header>
<section class="hero">
  <div class="hero-side">
    <span class="hero-label">Closing balance target · threshold ${cfg.lowBalanceThreshold.toLocaleString()}</span>
    <h1 class="hero-title">${esc(V.boardTitle || cfg.tagline)}</h1>
  </div>
  <div id="verdict"></div>
</section>
<section class="grid-4">
  <div class="kpi" style="border-left:3px solid var(--accent)"><span class="label">${icon("money", 14)} Current Balance</span><div class="val mono" id="kpiBal">0</div></div>
  <div class="kpi" style="border-left:3px solid var(--ok)"><span class="label">${icon("download", 14)} Money In</span><div class="val mono tint-ok" id="kpiIn">0</div></div>
  <div class="kpi" style="border-left:3px solid var(--danger)"><span class="label">${icon("upload", 14)} Money Out</span><div class="val mono tint-danger" id="kpiOut">0</div></div>
  <div class="kpi" style="border-left:3px solid var(--info)"><span class="label">${icon("check", 14)} Entries</span><div class="val mono tint-info" id="kpiN">0</div></div>
</section>
<main id="mapView">
  <section id="staffHome">
    <div class="sh-greet"><span class="sh-hi" id="shHi"></span><span class="sh-sub" id="shSub"></span></div>
    <div class="sh-balance"><span class="sh-bnum" id="shBal">—</span><span class="sh-blabel">money in the ${esc(V.boardTitle || 'book')} right now</span></div>
    <div class="sh-btns">
      <button class="sh-log" id="shIn">+ Money came in<span>tap when you receive cash</span></button>
      <button class="sh-log out" id="shOut">− Money went out<span>tap when you pay something</span></button>
      <button class="sh-log" id="shMine" style="grid-column:1/-1;background:var(--surface);color:var(--text);border:1px solid var(--border)">My entries today<span id="shMineCount">see what you logged</span></button>
    </div>
    <div class="sh-note">${icon("check", 14)} <span>Everything saves on its own — the boss sees it instantly.</span></div>
  </section>
  <div id="sparkWrap" class="spark-wrap">
    <div class="spark-head"><span class="rail-title">${icon("trend-up", 13)} Balance Trajectory</span><span class="mono muted" style="font-size:11px" id="sparkRange"></span></div>
    <svg id="sparkSvg" width="100%" height="96" viewBox="0 0 760 96" preserveAspectRatio="none" role="img"></svg>
  </div>
  <div class="lifecycle">
    <span id="scopeHint" class="scope-hint"></span>
    <button class="btn primary" onclick="openAdd()">${icon("plus")} New Entry</button>
  </div>
  <div id="auditBanner" class="banner"><span>⚠</span><span id="auditText"></span></div>
  <div class="stage">
    <div id="chips" class="chips"></div>
    <div class="board-panel">
    <table class="ledger">
      <thead><tr><th>#</th><th class="h-day">Day</th><th>Entry</th><th>Type</th><th class="h-acct">Account</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
    </div>
  </div>
  <div class="footnotes">
    <div class="muted advisory">${icon("lightbulb", 13)} ${cfg.advisory}</div>
    ${V.guidelines.length ? `<div class="glist">${V.guidelines.map(g => `<div class="gi"><b>${g.title}</b><span>${g.detail}</span></div>`).join("")}</div>` : ""}
  </div>
</main>
<div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
  <div class="card" style="width:min(440px,92vw);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px">
    <h3 style="margin:0 0 12px" id="modalTitle">Entry</h3>
    <input id="editF0" class="input" style="width:100%;margin-bottom:10px" placeholder="Label" aria-label="Label">
    <input id="editF1" class="input" type="number" inputmode="decimal" enterkeyhint="done" style="width:100%;margin-bottom:10px" placeholder="Amount" aria-label="Amount">
    <select id="typeSel" class="input" aria-label="Entry type" style="width:100%;margin-bottom:10px"></select>
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn danger-ghost" id="voidBtn" onclick="voidEntry()" style="display:none">${icon("archive")} Void</button>
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="applyEdit()">Apply</button>
    </div>
  </div>
</div>
<div id="toast" class="toast"></div>
<script>
var ACCOUNTS = ${sJson};
var STAFF = ${jstr((cfg.staff ?? []).map(s => s.name))};
var TYPES = ${tJson};
var OPENING = ${cfg.openingBalance};
var THRESHOLD = ${cfg.lowBalanceThreshold};
var state = { entries: ${eJson} }, editing = null, acctFilter = null;
/* Entry mode: counter staff get their OWN money-logging screen. Staff come
   from the extracted roster (big tap tiles at the gate); logging as any
   recognized name stamps every entry with who logged it. */
var ENTRY = null;
function setEntry(n){
  var q = String(n || '').trim(); if (!q) return;
  ENTRY = q;
  document.body.classList.add('entry');
  renderStaffHome();
}
var HZ = ${H ? jstr({ outCap: H.outflowCapPct }) : "null"};
var UNIT = ${jstr(V.entryNoun)};
var LS_KEY = 'opsdesk_console_state';
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
function loadLocal(){ try{ var r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function signOf(e){ var t = TYPES.find(function(x){ return x.l === e.t; }); return t ? t.s : -1; }
function balAfter(idx){ var b = OPENING; for (var i = 0; i <= idx; i++) b += signOf(state.entries[i]) * state.entries[i].a; return b; }
function render(){
  var Q = (document.getElementById('search').value || '').toLowerCase();
  var chips = document.getElementById('chips');
  if (ACCOUNTS.length > 1) {
    chips.innerHTML = '<span class="chip' + (acctFilter === null ? ' on' : '') + '" onclick="setFilter(null)">All</span>' + ACCOUNTS.map(function(a){ return '<span class="chip' + (acctFilter === a ? ' on' : '') + '" onclick="setFilter(\\'' + a.replace(/'/g, "\\\\'") + '\\')">' + a + '</span>'; }).join('');
  } else chips.innerHTML = '';
  var tb = document.getElementById('tbody'); tb.innerHTML = '';
  var tin = 0, tout = 0;
  state.entries.forEach(function(e, idx){
    var s = signOf(e);
    if (s > 0) tin += e.a; else tout += e.a;
    var hay = (e.l + ' ' + e.t + ' ' + e.ac).toLowerCase();
    var vis = (acctFilter === null || e.ac === acctFilter);
    var cls = 'erow' + (Q ? (hay.indexOf(Q) !== -1 ? ' hit' : ' dim') : '') + (vis ? '' : ' dim');
    var tr = document.createElement('tr'); tr.className = cls;
    tr.innerHTML = '<td class="mono muted">' + (idx + 1) + '</td><td class="mono muted h-day">Day ' + e.d + '</td><td>' + e.l + (e.by ? ' <span class="muted" style="font-size:11px">· ' + e.by + '</span>' : '') + '</td><td><span class="badge ' + (s > 0 ? 'ok' : 'warn') + '">' + e.t + '</span></td><td class="muted h-acct">' + e.ac + '</td><td class="mono amt ' + (s > 0 ? 'in' : 'out') + '" style="text-align:right">' + (s > 0 ? '+' : '−') + e.a.toLocaleString() + '</td><td class="mono" style="text-align:right;font-weight:700">' + balAfter(idx).toLocaleString() + '</td>';
    tr.onclick = (function(i){ return function(){ openModal(i); }; })(idx);
    tb.appendChild(tr);
  });
  renderSpark(state.entries.map(function(e, idx){ return balAfter(idx); }), THRESHOLD);
  var finalBal = state.entries.length ? balAfter(state.entries.length - 1) : OPENING;
  document.getElementById('kpiBal').innerText = finalBal.toLocaleString();
  document.getElementById('kpiIn').innerText = tin.toLocaleString();
  document.getElementById('kpiOut').innerText = tout.toLocaleString();
  document.getElementById('kpiN').innerText = state.entries.length;
  var ab = document.getElementById('auditBanner');
  var dipped = false, dipAt = -1;
  for (var i = 0; i < state.entries.length; i++) if (balAfter(i) < THRESHOLD) { dipped = true; dipAt = i; }
  var belowNow = finalBal < THRESHOLD;
  ab.classList.toggle('open', dipped);
  if (dipped) document.getElementById('auditText').innerText = belowNow
    ? 'Balance ' + finalBal.toLocaleString() + ' is below your ' + THRESHOLD.toLocaleString() + ' safety line — defer non-urgent outflows.'
    : 'Balance dipped below the ' + THRESHOLD.toLocaleString() + ' safety line on Day ' + state.entries[dipAt].d + ' — recovered since, but watch the pattern.';
  var vd = document.getElementById('verdict');
  if (vd){
    if (!HZ){ vd.style.display = 'none'; }
    else {
      var byDay = {};
      state.entries.forEach(function(e){
        var k = e.d; if (!byDay[k]) byDay[k] = { i: 0, o: 0 };
        if (signOf(e) > 0) byDay[k].i += e.a; else byDay[k].o += e.a;
      });
      var heavy = null;
      Object.keys(byDay).forEach(function(k){
        var d = byDay[k];
        if (d.i > 0 && (100 * d.o / d.i) > HZ.outCap && (!heavy || d.o > heavy.o)) heavy = { d: k, i: d.i, o: d.o };
      });
      if (heavy){
        vd.innerHTML = '<span class="mono" style="font-size:15px;color:#fbbf24">' + Math.round(100 * heavy.o / heavy.i) + '%</span><span>of Day ' + heavy.d + ' inflows went straight back out (' + heavy.o.toLocaleString() + ' of ' + heavy.i.toLocaleString() + ') — over the ' + HZ.outCap + '% comfort line</span>';
        vd.style.display = 'flex'; vd.style.borderLeftColor = '#fbbf24';
      } else { vd.style.display = 'none'; }
    }
  }
}
function setFilter(a){ acctFilter = a; render(); }
/* Staff Home — the counter worker's own screen. Two giant buttons (money in /
   money out), their stamped entries, the day's balance in plain words. */
function renderStaffHome(){
  if (!ENTRY) return;
  var hi = document.getElementById('shHi'); if (!hi) return;
  hi.textContent = 'Hi ' + ENTRY;
  var by = state.entries.filter(function(e){ return e.by === ENTRY; });
  var bal = state.entries.length ? balAfter(state.entries.length - 1) : OPENING;
  document.getElementById('shSub').textContent = by.length ? 'You logged ' + by.length + ' ' + (UNIT || 'entry') + (by.length > 1 ? 's' : '') + ' today' : 'You have not logged anything yet';
  document.getElementById('shBal').textContent = bal.toLocaleString();
  document.getElementById('shMineCount').textContent = by.length ? by.length + ' ' + (UNIT || 'entry') + (by.length > 1 ? 's' : '') + ' with your name' : 'nothing yet — tap a button above';
}
function openStaffLog(sign){
  openAdd();
  var sel = document.getElementById('typeSel');
  var opts = Array.prototype.slice.call(sel.options);
  var pick = opts.find(function(o){ var t = TYPES.find(function(x){ return x.l === o.value; }); return t && t.s === sign; });
  if (pick) sel.value = pick.value;
}
(function wireStaffHome(){
  var a = document.getElementById('shIn'); if (a) a.onclick = function(){ openStaffLog(1); };
  var b = document.getElementById('shOut'); if (b) b.onclick = function(){ openStaffLog(-1); };
  var m = document.getElementById('shMine'); if (m) m.onclick = function(){
    var sh = document.getElementById('staffHome');
    var showing = sh.style.display !== 'none';
    sh.style.display = showing ? 'none' : 'block';
    m.querySelector('span').textContent = showing ? 'back to my screen' : 'see what you logged';
  };
})();
function openModal(idx){
  editing = idx;
  LIFECYCLE = { mode: 'edit', sel: idx };
  document.getElementById('voidBtn').style.display = '';
  var e = state.entries[idx];
  document.getElementById('modalTitle').innerText = e.l;
  document.getElementById('editF0').value = e.l;
  document.getElementById('editF1').value = e.a;
  var sel = document.getElementById('typeSel'); sel.innerHTML = '';
  TYPES.forEach(function(t){ var o = document.createElement('option'); o.value = t.l; o.text = t.l + (t.s > 0 ? ' (in)' : ' (out)'); if (t.l === e.t) o.selected = true; sel.appendChild(o); });
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
var LIFECYCLE = { mode: 'edit', sel: null };
function openAdd(){
  LIFECYCLE = { mode: 'add', sel: null };
  document.getElementById('voidBtn').style.display = 'none';
  document.getElementById('modalTitle').innerText = 'New Entry';
  document.getElementById('editF0').value = '';
  document.getElementById('editF1').value = '';
  var sel = document.getElementById('typeSel'); sel.innerHTML = '';
  TYPES.forEach(function(t){ var o = document.createElement('option'); o.value = t.l; o.text = t.l + (t.s > 0 ? ' (in)' : ' (out)'); sel.appendChild(o); });
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function voidEntry(){
  if (LIFECYCLE.mode !== 'edit' || LIFECYCLE.sel == null) return;
  var e = state.entries[LIFECYCLE.sel];
  var sign = (TYPES.find(function(t){ return t.l === e.t; }) || TYPES[0]).s;
  var opp = TYPES.find(function(t){ return t.s === -sign; }) || TYPES[0];
  state.entries.push({ d: e.d, l: 'VOID: ' + e.l, t: opp.l, ac: e.ac, a: e.a });
  saveLocal(); render(); closeModal(); toast('Voided — reversal added'); PERSIST.schedule();
}
function applyEdit(){
  if (LIFECYCLE.mode === 'add') {
    var l = document.getElementById('editF0').value.trim();
    var amt = Math.abs(parseFloat(document.getElementById('editF1').value));
    if (!l || !amt) { closeModal(); return; }
    var lastDay = state.entries.length ? state.entries[state.entries.length - 1].d : 1;
    state.entries.push({ d: lastDay, l: l, t: document.getElementById('typeSel').value, ac: ACCOUNTS[0], a: amt, by: ENTRY || undefined });
    saveLocal(); render(); closeModal(); toast('Entry added'); PERSIST.schedule();
    return;
  }
  if (LIFECYCLE.sel == null) return;
  var e = state.entries[LIFECYCLE.sel];
  e.l = document.getElementById('editF0').value.trim() || e.l;
  e.a = Math.abs(parseFloat(document.getElementById('editF1').value)) || e.a;
  e.t = document.getElementById('typeSel').value;
  saveLocal(); render(); closeModal(); toast(ENTRY ? 'Saved ✓' : 'Saved'); PERSIST.schedule();
}
function toast(m){ var t = document.getElementById('toast'); t.innerText = m; t.classList.add('open'); setTimeout(function(){ t.classList.remove('open'); }, 2000); }
function renderSpark(bals, threshold){
  var svg = document.getElementById('sparkSvg');
  if (!svg) return;
  var W = 760, H = 96, pad = 8;
  var all = bals.concat([threshold]);
  var min = Math.min.apply(null, all), max = Math.max.apply(null, all);
  if (max === min) { max = min + 1; }
  var n = Math.max(bals.length, 2);
  var pts = bals.map(function(b, i){
    var x = pad + (W - 2 * pad) * (i / (n - 1));
    var y = pad + (H - 2 * pad) * (1 - (b - min) / (max - min));
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  var ty = pad + (H - 2 * pad) * (1 - (threshold - min) / (max - min));
  var area = 'M' + pad + ',' + (H - pad) + ' L' + pts.join(' L') + ' L' + (W - pad) + ',' + (H - pad) + ' Z';
  svg.innerHTML = '<path d="' + area + '" fill="var(--accent)" opacity="0.10"/>' +
    '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<line x1="' + pad + '" y1="' + ty.toFixed(1) + '" x2="' + (W - pad) + '" y2="' + ty.toFixed(1) + '" stroke="#f87171" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.8"/>';
  var range = document.getElementById('sparkRange');
  if (range) range.innerText = (bals.length ? 'Day 1 → Day ' + bals.length + ' · safety line ' + threshold.toLocaleString() : 'No entries yet · safety line ' + threshold.toLocaleString());
}
function buildRecords(){
  return state.entries.map(function(e, idx){ return { day: e.d, label: e.l, type: e.t, account: e.ac, amount: (signOf(e) > 0 ? 1 : -1) * e.a, balance_after: balAfter(idx), logged_by: e.by || undefined }; });
}
async function sync(){
  var btn = document.getElementById('syncBtn'); btn.innerText = 'Syncing…';
  try {
    if (typeof window.__opsDeskSubmit__ === 'function') {
      await window.__opsDeskSubmit__({ records: buildRecords() });
      toast('Synced to OpsDesk');
    } else { toast('Saved locally'); }
  } catch (err) { toast('Sync failed'); }
  btn.innerText = 'Sync Ledger';
}
// Engine 2: the ledger is the console's memory. Boot hydrates from the latest
// confirmed event (applyLoaded merges server records into seeded state); every
// edit auto-persists a full snapshot through the same submit bridge.
function applyLoaded(records){
  if (!records || !records.length) return;
  var known = {};
  state.entries.forEach(function(e){ known[e.l + '|' + e.d] = true; });
  records.forEach(function(r, i){
    if (!r || !r.label) return;
    var amount = Math.abs(parseFloat(r.amount)) || 0;
    var key = r.label + '|' + (parseInt(r.day, 10) || (i + 1));
    var e = state.entries.find(function(x){ return x.l + '|' + x.d === key; });
    if (e){
      e.a = amount; e.t = r.type || e.t; e.ac = r.account || e.ac;
    } else {
      state.entries.push({ l: r.label, a: amount, t: r.type || TYPES[0].l, d: parseInt(r.day, 10) || (i + 1), ac: r.account || ACCOUNTS[0], by: r.logged_by || undefined });
    }
  });
  state.entries.sort(function(x, y){ return x.d - y.d; });
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
  var rows = [['day', 'label', 'type', 'account', 'amount', 'balance_after']];
  state.entries.forEach(function(e, idx){ rows.push([e.d, e.l, e.t, e.ac, (signOf(e) > 0 ? 1 : -1) * e.a, balAfter(idx)]); });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ledger.csv'; a.click();
  toast('Exported CSV');
}
(function boot(){ var s = loadLocal(); if (s && s.entries && s.entries.length) state = s; render(); PERSIST.hydrate(); })();
</script>
</body>
</html>`;
}
