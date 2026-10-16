// Archetype #3: Pipeline — stages (kanban columns) × items (cards) × SLA
// aging intelligence. Same doctrine: the model chooses nouns (stages, item
// titles, owners, ages); ALL behavior lives here as proven code. Contract
// parity: #modal/.open mechanics, #editF0 focus, __opsDeskSubmit__ bridge,
// storage-shim persistence, toast, spotlight dim/hit, #auditBanner.
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { esc, jstr } from "./escape";
import { logoOf } from "./branding";
import { chromeFonts, chromeCss, chromeJs, icon } from "./chrome";

// Schema doctrine: structural twin of the battle-tested TargetBoardSchema —
// scalars first, arrays last, EVERY property required (Gemini 3.x structured
// output rejects objects with non-required properties in some combinations),
// no .default()/.optional() anywhere. Semantic guidance lives in the prompt,
// not in schema descriptions.
export const PipelineSchema = z.object({
  productName: z.string().describe("Short invented product name, e.g. 'JobFlow Pro'"),
  logoText: z.string().min(1),
  tagline: z.string(),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dark: z.boolean(),
  searchHint: z.string(),
  advisory: z.string(),
  slaDays: z.number().int().positive(),
  stages: z.array(z.object({ label: z.string() })).min(2).max(8).describe("Ordered workflow stages, verbatim from the prompt"),
  items: z.array(z.object({
    title: z.string(),
    stageIdx: z.number().int().min(0),
    owner: z.string(),
  })).min(4).max(60).describe("Seed job cards. COUNT RULE: if the prompt states N open jobs/orders (even 'about N' or 'around N'), the array MUST contain exactly N items — invent realistic titles/owners to reach the count"),
  parts: z.array(z.object({ name: z.string(), rate: z.number().positive() })).max(20).optional().describe("Parts catalog with rates in rupees — ONLY for repair/service domains that bill parts. Name + typical rate"),
  repairs: z.array(z.object({ card: z.string(), part: z.string(), qty: z.number().positive() })).max(40).optional().describe("Parts used per job card — ONLY together with parts. card must EXACTLY match an items title; part must EXACTLY match a parts name; qty is units consumed. Include for most repair cards"),
  ownerStages: z.array(z.object({ label: z.string() })).max(4).optional().describe("Stage labels that ONLY the owner may move cards INTO — approvals, payment, delivery handover, QC sign-off. Labels verbatim from stages. Skip entirely if every stage is worker-moveable"),
  voice: z.object({
    boardTitle: z.string().describe("Insider name for this board, e.g. 'Shop Floor Board', 'Job Board', 'Follow-up Desk'"),
    itemNoun: z.string().describe("What one card is called here, e.g. 'job card', 'order', 'complaint'"),
    searchExamples: z.array(z.string()).max(5).describe("What the owner types, e.g. 'Suresh', 'stitching', 'pending'"),
    guidelines: z.array(z.object({ title: z.string(), detail: z.string() })).max(3).describe("Trade coaching for keeping work flowing — in THIS trade's words"),
  }).describe("Domain voice — the board must read like this trade's own job board").optional(),
  heuristics: z.object({
    starvedStageIdx: z.number().int().min(0).describe("Stage index that being EMPTY signals upstream jam (usually first)"),
    agingDays: z.number().int().min(1).describe("Days in stage beyond which a card is 'aging' even if not breached"),
  }).describe("Judgment as numbers — drives starved-stage and aging verdicts").optional(),
});

export type PipelineConfig = z.infer<typeof PipelineSchema>;

export async function extractPipelineConfig(userPrompt: string): Promise<PipelineConfig> {
  return generateWithRepair<PipelineConfig>({
        prompt: `A manager described a workflow/process they track. Extract the pipeline config.

MANAGER: "${userPrompt}"

Rules:
- List stages verbatim in order (2-8 stages).
- items: if the prompt names none, invent 8-12 realistic ones for the domain. Spread them across ALL stages; the busiest working stage gets the most. (Aging days are seeded by the platform — do not provide them.)
- owner: person responsible; use the empty string "" if unknown.
- slaDays: max days an item may sit in one stage before breach; set 3-10 for most service/workflow domains.
- accentHex: a #rrggbb hex color suited to the domain. dark: true unless told otherwise.
- tagline: one short line. searchHint: what to search. advisory: one domain best-practice tip for keeping work flowing. productName: invented, e.g. 'JobFlow Pro'.
- VOICE — make the board speak this trade's language: boardTitle (insider name), itemNoun (what one card is called here), searchExamples (real names/terms typed here), guidelines (2-3 coaching tips with this trade's vocabulary and reasons).
- HEURISTICS — judgment as numbers: starvedStageIdx (stage index that being EMPTY signals upstream jam, usually 0), agingDays (days in stage that counts as aging even before SLA breach).
- PARTS — only for repair/service domains that bill parts: catalog of part names with rates in rupees, plus repairs (which card used which part, how many). card/part names must match EXACTLY. Skip parts and repairs entirely otherwise.
- OWNERSTAGES — only if some stages are owner-only gates (payment, delivery handover, approval): list those stage labels verbatim. Skip entirely otherwise.`,
      },
      PipelineSchema,
      5);
}

export function assemblePipeline(cfg: PipelineConfig): string {
  const theme = cfg.dark
    ? { bg: "#0f172a", surface: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", input: "#0b1220" }
    : { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#ffffff" };
  const sJson = jstr(cfg.stages.map(s => s.label));
  // Aging seed — deterministic (Gemini 3.x rejects arrays-of-objects with ≥4
  // properties in structured output, so the model provides {title, stageIdx,
  // owner} only; the platform seeds ages). Item 0 always breaches so the SLA
  // banner demonstrates on first load; the rest rotate a fixed pattern.
  const AGE_PATTERN = [1, 2, 0, 3, 1, 4, 0, 2];
  const iJson = jstr(cfg.items.map((i, idx) => ({ t: i.title, s: i.stageIdx, o: i.owner || "", d: idx === 0 ? cfg.slaDays + 2 : AGE_PATTERN[idx % 8] })));
  // Voice + heuristics: the trade's words and judgment-as-numbers. Optional
  // with generic fallbacks so pre-voice configs keep assembling.
  const V = cfg.voice ?? { boardTitle: "Stage Flow", itemNoun: "job card", searchExamples: [] as string[], guidelines: [] as { title: string; detail: string }[] };
  const H = cfg.heuristics ?? null;
  const searchPh = (V.searchExamples.length ? V.searchExamples.join(", ") : cfg.searchHint);
  // Extensions: parts join (catalog + per-card usage → deterministic bill
  // totals) and owner-gated stages. Both optional — pre-extension configs
  // assemble byte-identical (empty arrays gate every new DOM node/JS path).
  const PARTS = cfg.parts ?? [];
  const USES = (cfg.repairs ?? []).filter(r => PARTS.some(p => p.name === r.part) && cfg.items.some(i => i.title === r.card));
  const GATED = (cfg.ownerStages ?? []).map(s => cfg.stages.findIndex(st => st.label === s.label)).filter(i => i >= 0);
  const hasParts = PARTS.length > 0 && USES.length > 0;
  const pjJson = jstr(PARTS.map(p => ({ n: p.name, r: p.rate })));
  const ujJson = jstr(USES.map(u => ({ c: u.card, p: u.part, q: u.qty })));

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
.kpi:nth-child(3) { border-left:3px solid var(--info); }
.kpi:nth-child(4) { border-left:3px solid var(--danger); }
.kpi .label { font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:1px; font-weight:600; display:flex; align-items:center; gap:5px; }
.kpi .val { font-size:24px; font-weight:800; letter-spacing:-0.02em; margin-top:4px; }
.badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid; font-weight:700; white-space:nowrap; }
.badge.ok { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
.badge.warn { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
.badge.breach { color:#f87171; border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.1); }
.banner { display:none; margin-bottom:12px; padding:10px 14px; border-radius:10px; border:1px solid rgba(248,113,113,.35); background:rgba(248,113,113,.08); color:#f87171; font-size:13px; font-weight:600; align-items:center; gap:10px; }
.banner.open { display:flex; }
.kanban { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(200px,1fr); gap:12px; overflow-x:auto; align-items:start; padding-bottom:8px; }
.col { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px; min-height:180px; }
.col h4 { margin:0 0 10px; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); display:flex; align-items:center; gap:8px; }
.pcard { background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:8px 10px; margin-bottom:8px; cursor:pointer; transition:all .12s; }
.pcard:hover { border-color:${cfg.accentHex}88; transform:translateY(-1px); }
.pcard .t { font-weight:700; font-size:13px; margin-bottom:4px; }
.pcard .m { font-size:11px; color:var(--muted); display:flex; justify-content:space-between; gap:6px; }
.pcard.dim { opacity:.25; filter:saturate(.4); }
.pcard.hit { border-color:${cfg.accentHex}; box-shadow:0 0 0 2px ${cfg.accentHex}55; }
.pcard .bill { font-size:10px; font-weight:800; color:var(--accent); }
.modal { position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:center; justify-content:center; z-index:50; } .modal.open { display:flex; }
.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--accent); color:#000; padding:10px 20px; border-radius:10px; font-weight:700; display:none; z-index:60; } .toast.open { display:block; }
.sync-chip { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid var(--border); color:var(--muted); font-weight:600; white-space:nowrap; } .sync-chip:empty { display:none; }
.meta-chip { font-size:10px; padding:2px 8px; border:1px solid var(--border); border-radius:999px; color:var(--muted); letter-spacing:.8px; font-weight:600; white-space:nowrap; }
.glist { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:8px; margin-bottom:12px; }
.gi { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 12px; font-size:12px; }
.gi b { display:block; font-size:12px; margin-bottom:2px; }
.gi span { color:var(--muted); }
#verdict { flex:1; display:none; align-items:center; gap:14px; border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:var(--r-md); padding:12px 18px; background:var(--surface); min-height:64px; font-size:13.5px; font-weight:600; line-height:1.5; }
/* Entry mode — staff view: scoped to the signed-in worker's cards. */
.scope-hint { display:none; font-size:12px; font-weight:700; color:var(--accent); }
body.entry .scope-hint { display:inline; }
body.entry .searchwrap, body.entry #syncBtn, body.entry button[onclick="exportCsv()"], body.entry #auditBanner, body.entry .grid-4 { display:none; }
body.entry #verdict { display:none !important; }
/* ---- Staff Home: the worker's OWN screen. Their cards as one big
   tappable action each; stage moves are the whole job, so a card's primary
   tap ADVANCES it — no forms, no stage vocabulary. ---------------------- */
#staffHome { display:none; padding:4px 22px 64px; max-width:640px; margin:0 auto; }
body.entry #staffHome { display:block; }
body.entry .hero, body.entry .stage, body.entry .footnotes, body.entry .lifecycle { display:none; }
body.entry main#mapView { padding-top:4px; }
.sh-greet { margin:10px 0 4px; }
.sh-hi { font-size:27px; font-weight:800; letter-spacing:-0.02em; display:block; }
.sh-sub { color:var(--muted); font-size:13.5px; display:block; margin-top:3px; }
.sh-cards { display:grid; gap:12px; margin:18px 0 6px; }
.sh-card { display:flex; align-items:center; gap:14px; width:100%; text-align:left; background:var(--surface); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:14px; padding:16px 18px; color:var(--text); cursor:pointer; font:inherit; }
.sh-card:active { transform:scale(.98); }
.sh-card.breach { border-left-color:#f87171; }
.sh-name { font-weight:700; font-size:15.5px; display:block; }
.sh-goal { color:var(--muted); font-size:12.5px; display:block; margin-top:3px; }
.sh-val { margin-left:auto; text-align:right; }
.sh-next { display:block; font-weight:800; font-size:13.5px; color:var(--accent); }
.sh-note { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12.5px; margin-top:16px; }
@media (max-width:760px) { .grid-4 { grid-template-columns:repeat(2,1fr); } }
.rail-wrap { border:1px solid var(--border); border-radius:12px; background:var(--surface); padding:14px 16px 10px; margin-bottom:14px; }
.rail-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.rail-title { font-size:11px; font-weight:700; letter-spacing:1px; color:var(--muted); text-transform:uppercase; }
.rail { display:flex; align-items:center; gap:6px; }
.rail-node { display:flex; flex-direction:column; align-items:center; gap:5px; min-width:64px; }
.rail-bubble { display:flex; align-items:center; justify-content:center; min-width:38px; height:38px; border-radius:12px; border:1px solid var(--border); background:var(--bg); font-weight:800; font-size:14px; transition:box-shadow .15s ease; }
.rail-bubble.is-bneck { border-color:${cfg.accentHex}88; background-image:linear-gradient(135deg, ${cfg.accentHex}1f, transparent 65%); box-shadow:0 6px 18px -8px ${cfg.accentHex}aa; }
.rail-name { font-size:10px; color:var(--muted); letter-spacing:.4px; white-space:nowrap; max-width:110px; overflow:hidden; text-overflow:ellipsis; }
.rail-arrow { color:var(--muted); opacity:.55; flex:none; padding-bottom:16px; }
.rail-legend { display:flex; justify-content:flex-end; gap:12px; margin-top:10px; font-size:10px; color:var(--muted); }
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
.col { border-radius:var(--r-md); }
.pcard { border-radius:var(--r-sm); }
.rail-wrap { border-radius:var(--r-lg); }
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
  <span class="meta-chip mono">${cfg.stages.length} STAGES · SLA ${cfg.slaDays}D</span>
  <div class="searchwrap"><input id="search" class="input" placeholder="${esc(searchPh)}" aria-label="Search" oninput="render()"><span class="kbd">⌘K</span></div>
  <button class="btn" onclick="exportCsv()">${icon("download")} Export CSV</button>
  <button id="syncBtn" class="btn primary" onclick="sync()">${icon("upload")} Sync Board</button>
  <span id="syncState" class="sync-chip"></span>
</header>
<section class="hero">
  <div class="hero-side">
    <span class="hero-label">Stage flow · SLA ${cfg.slaDays}d per stage</span>
    <h1 class="hero-title">${esc(V.boardTitle || cfg.tagline)}</h1>
  </div>
  <div id="verdict"></div>
</section>
<section class="grid-4">
  <div class="kpi"><span class="label">${icon("grid", 13)} Cards in flight</span><div class="val mono" id="kpiTotal">0</div></div>
  <div class="kpi"><span class="label">${icon("check", 13)} Completed (last stage)</span><div class="val mono tint-ok" id="kpiDone">0</div></div>
  <div class="kpi"><span class="label">${icon("clock", 13)} Avg days in stage</span><div class="val mono tint-info" id="kpiAge">0.0d</div></div>
  <div class="kpi"><span class="label">${icon("alert", 13)} SLA breached</span><div class="val mono tint-danger" id="kpiWarn">0</div></div>
</section>
<main id="mapView">
  <section id="staffHome">
    <div class="sh-greet"><span class="sh-hi" id="shHi"></span><span class="sh-sub" id="shSub"></span></div>
    <div class="sh-cards" id="shCards"></div>
    <div class="sh-note">${icon("check", 14)} <span>Tap a card when it moves — everything saves on its own.</span></div>
  </section>
  <div id="railWrap" class="rail-wrap">
    <div class="rail-head"><span class="rail-title">Stage Flow</span><span class="mono muted" style="font-size:11px">SLA ${cfg.slaDays}d per stage</span></div>
    <div class="rail" id="stageRail"></div>
    <div class="rail-legend"><span>${icon("alert", 12)} glow = bottleneck</span><span>${icon("clock", 12)} >${cfg.slaDays}d in stage = breach</span></div>
  </div>
  <div class="lifecycle">
    <span id="scopeHint" class="scope-hint"></span>
    <button class="btn primary" onclick="openAdd()">${icon("plus")} New Card</button>
  </div>
  <div id="auditBanner" class="banner"><span>⚠</span><span id="auditText"></span></div>
  <div class="stage">
    <div id="kanban" class="kanban"></div>
  </div>
  <div class="footnotes">
    <div class="muted advisory">${icon("lightbulb", 13)} ${cfg.advisory}</div>
    ${V.guidelines.length ? `<div class="glist">${V.guidelines.map(g => `<div class="gi"><b>${g.title}</b><span>${g.detail}</span></div>`).join("")}</div>` : ""}
  </div>
  ${hasParts ? `<section id="partsSec" class="footnotes" style="padding-top:0">
    <div class="rail-title">Parts &amp; Rates</div>
    <div class="glist" style="margin-top:10px">
      ${PARTS.map(p => `<div class="gi"><b>${p.name}</b><span class="mono">₹${p.rate.toLocaleString("en-IN")}</span></div>`).join("")}
    </div>
  </section>` : ""}
</main>
<div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
  <div class="card" style="width:min(440px,92vw);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px">      <h3 style="margin:0 0 12px" id="modalTitle">Card</h3>
    ${hasParts ? `<div id="partsLine" class="parts-line muted" style="display:none;font-size:12px;margin:-6px 0 10px"></div>` : ""}
    <input id="editF0" class="input" style="width:100%;margin-bottom:10px" placeholder="Title" aria-label="Title">
    <input id="editF1" class="input" style="width:100%;margin-bottom:10px" placeholder="Owner" aria-label="Owner">
    <select id="stageSel" class="input" aria-label="Stage" style="width:100%;margin-bottom:10px"></select>
    <input id="editF2" class="input" type="number" inputmode="numeric" enterkeyhint="done" style="width:100%;margin-bottom:10px" placeholder="Days in stage" aria-label="Days in stage">
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn danger-ghost" id="completeBtn" onclick="completeCard()" style="display:none">${icon("check")} Complete</button>
      <button class="btn danger-ghost" id="voidBtn" onclick="voidCard()" style="display:none">${icon("archive")} Remove</button>
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="applyEdit()">Apply</button>
    </div>
  </div>
</div>
<div id="toast" class="toast"></div>
${chromeJs({ syncLabel: 'Sync Board' })}
<script>
var STAGES = ${sJson};
var SLA = ${cfg.slaDays};
var state = { items: ${iJson} }, editing = null;
var HZ = ${H ? jstr({ starved: H.starvedStageIdx, aging: H.agingDays }) : "null"};
var UNIT = ${jstr(V.itemNoun)};
var PARTS = ${pjJson};
var USES = ${ujJson};
var GATED = ${jstr(GATED)};
function partsOf(t){ return USES.filter(function(u){ return u.c === t; }); }
function billOf(t){ var s = 0; partsOf(t).forEach(function(u){ var p = PARTS.find(function(x){ return x.n === u.p; }); if (p) s += p.r * u.q; }); return s; }
function isGated(si){ return GATED.indexOf(si) !== -1; }
function ageClass(d){ return d > SLA ? 'breach' : (d >= 3 ? 'warn' : 'ok'); }
function render(){
  var kb = document.getElementById('kanban'); kb.innerHTML = '';
  var Q = (document.getElementById('search').value || '').toLowerCase();
  var items = mineNow(); // entry mode: only the signed-in worker's cards
  var counts = STAGES.map(function(){ return 0; }), breached = 0, ageSum = 0, done = 0;
  items.forEach(function(it){
    counts[it.s]++; ageSum += it.d;
    if (it.d > SLA) breached++;
    if (it.s === STAGES.length - 1) done++;
  });
  var maxC = Math.max.apply(null, counts), bneck = counts.indexOf(maxC);
  renderRail(counts, bneck);
  STAGES.forEach(function(label, si){
    var col = document.createElement('div'); col.className = 'col';
    var bn = (counts[si] === maxC && maxC >= 2) ? ' <span class="badge warn">⚠ BOTTLENECK</span>' : '';
    col.innerHTML = '<h4>' + label + ' <span class="badge ' + (si === STAGES.length - 1 ? 'ok' : 'warn') + '">' + counts[si] + '</span>' + bn + '</h4>';
    items.forEach(function(it){
      if (it.s !== si) return;
      var idx = state.items.indexOf(it); // real index — openEditSel must resolve
      var hay = (it.t + ' ' + (it.o || '') + ' ' + label).toLowerCase();
      var c = document.createElement('div');
      c.className = 'pcard' + (Q ? (hay.indexOf(Q) !== -1 ? ' hit' : ' dim') : '');
      c.innerHTML = '<div class="t">' + it.t + '</div><div class="m"><span>' + (it.o || '—') + '</span><span class="badge ' + ageClass(it.d) + '">' + it.d + 'd</span>' + (billOf(it.t) > 0 ? ' <span class="bill">₹' + billOf(it.t) + '</span>' : '') + '</div>';
      c.onclick = (function(i, el){ return function(){ openEditSel(i, el); }; })(idx, c);
      col.appendChild(c);
    });
    kb.appendChild(col);
  });
  document.getElementById('kpiTotal').innerText = items.length;
  document.getElementById('kpiDone').innerText = done;
  document.getElementById('kpiAge').innerText = (items.length ? (ageSum / items.length) : 0).toFixed(1) + 'd';
  document.getElementById('kpiWarn').innerText = breached;
  var ab = document.getElementById('auditBanner');
  if (ab){
    var firstBreach = items.find(function(it){ return it.d > SLA; });
    ab.classList.toggle('open', breached > 0);
    if (breached > 0 && firstBreach) document.getElementById('auditText').innerText = breached + ' card' + (breached > 1 ? 's' : '') + ' breached SLA (>' + SLA + ' days in stage) — starting with “' + firstBreach.t + '” in ' + STAGES[firstBreach.s];
  }
  var vd = document.getElementById('verdict');
  if (vd){
    if (!HZ){ vd.style.display = 'none'; }
    else {
      var bits = [];
      var starved = HZ.starved;
      if (counts[starved] === 0 && maxC >= 2){
        bits.push('<span style="color:#fbbf24">' + STAGES[starved] + ' is empty while ' + STAGES[bneck] + ' holds ' + maxC + ' — upstream jam, pull work forward</span>');
      }
      var aging = items.filter(function(it){ return it.d >= HZ.aging && it.d <= SLA; });
      if (aging.length){
        var oldestA = aging.reduce(function(a, b){ return b.d > a.d ? b : a; });
        bits.push('<span>' + aging.length + ' ' + (UNIT || 'card') + (aging.length > 1 ? 's' : '') + ' aging ≥' + HZ.aging + 'd · oldest “' + oldestA.t + '” at ' + oldestA.d + 'd in ' + STAGES[oldestA.s] + '</span>');
      }
      if (bits.length){ vd.innerHTML = bits.join('<br>'); vd.style.display = 'flex'; vd.style.borderLeftColor = '#fbbf24'; }
      else { vd.style.display = 'none'; }
    }
  }
}
/* Entry mode: scoping to ONE worker (fleet doctrine — filter at render,
   never mutate state, so click indices stay real). Strict case-insensitive
   match against card owners; an unrecognized name stays in owner view. */
var ENTRY = null;
function setEntry(n){
  var q = String(n || '').trim().toLowerCase();
  if (!q) return;
  ENTRY = state.items.some(function(it){ return (it.o || '').trim().toLowerCase() === q; }) ? String(n).trim() : null;
  if (ENTRY){
    document.body.classList.add('entry');
    var hint = document.getElementById('scopeHint');
    if (hint) hint.textContent = 'Showing only ' + ENTRY + '\u2019s cards';
    renderStaffHome();
  }
}
function mineNow(){ return ENTRY ? state.items.filter(function(it){ return (it.o || '').trim().toLowerCase() === ENTRY.toLowerCase(); }) : state.items; }
/* Staff Home — the worker's cards as one-tap actions. The primary tap on a
   card ADVANCES it one stage (their whole job); Undo appears right after.
   Breaching cards shout in red; done cards slide off the list. */
function renderStaffHome(){
  if (!ENTRY) return;
  var hi = document.getElementById('shHi'); if (!hi) return;
  hi.textContent = 'Hi ' + ENTRY;
  var mine = mineNow();
  var done = mine.filter(function(it){ return it.s === STAGES.length - 1; }).length;
  document.getElementById('shSub').textContent = mine.length ? done + ' of ' + mine.length + ' finished — keep it moving' : 'No cards yet — the boss will add yours here';
  document.getElementById('shCards').innerHTML = mine.length ? mine.map(function(it){
    var idx = state.items.indexOf(it);
    var breach = it.d > SLA;
    var next = STAGES[Math.min(it.s + 1, STAGES.length - 1)];
    var finished = it.s === STAGES.length - 1;
    return '<div class="sh-card' + (breach ? ' breach' : '') + '" data-idx="' + idx + '">'
      + '<span><span class="sh-name">' + it.t + '</span><span class="sh-goal">' + STAGES[it.s] + (breach ? ' · too long in stage — move it' : '') + '</span></span>'
      + '<span class="sh-val"><span class="sh-next">' + (finished ? 'Done ✓' : 'Move to ' + next + ' →') + '</span></span></div>';
  }).join('') : '';
}
function staffHomeAdvance(idx){
  var it = state.items[idx];
  if (!it || it.s >= STAGES.length - 1) return;
  if (isGated(it.s + 1)){ toast('Needs boss approval — ask the owner'); return; }
  it.s = it.s + 1; it.d = 0;
  saveLocal(); render(); toast('Moved to ' + STAGES[it.s] + ' ✓'); PERSIST.schedule();
}
document.getElementById('shCards').addEventListener('click', function(ev){
  var c = ev.target.closest('.sh-card'); if (!c || !ENTRY) return;
  var idx = parseInt(c.getAttribute('data-idx'), 10);
  if (c.getAttribute('data-done') !== '1') staffHomeAdvance(idx);
});
function openModal(idx){ openEditSel(idx); }
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
var LIFECYCLE = { mode: 'edit', target: null, sel: null, card: null };
function openAdd(){
  LIFECYCLE = { mode: 'add', target: null, sel: null, card: null };
  document.getElementById('modalTitle').innerText = 'New Job Card';
  document.getElementById('editF0').value = '';
  document.getElementById('editF1').value = ENTRY || ''; // entry mode: own the card you add
  var sel = document.getElementById('stageSel'); sel.innerHTML = '';
  STAGES.forEach(function(s, i){ var o = document.createElement('option'); o.value = i; o.text = s; if (i === 0) o.selected = true; sel.appendChild(o); });
  document.getElementById('editF2').value = '0';
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function openEditSel(sel, cardEl){
  if (ENTRY && (state.items[sel] || {}).o !== ENTRY) return; // staff touch only their own cards
  var it = state.items[sel];
  LIFECYCLE = { mode: 'edit', target: sel, sel: sel, card: cardEl || null };
  var pl = document.getElementById('partsLine');
  if (pl){
    var plParts = partsOf(it.t);
    if (plParts.length){
      pl.style.display = 'block';
      pl.innerHTML = plParts.map(function(u){ var p = PARTS.find(function(x){ return x.n === u.p; }); return p ? u.q + ' × ' + p.n + ' — ₹' + (p.r * u.q) : ''; }).filter(Boolean).join(' · ') + ' · <b>Bill: ₹' + billOf(it.t) + '</b>';
    } else { pl.style.display = 'none'; }
  }
  var cb = document.getElementById('completeBtn'), vb = document.getElementById('voidBtn');
  if (cb) cb.style.display = (it.s < STAGES.length - 1) ? '' : 'none';
  if (vb) vb.style.display = '';
  document.getElementById('modalTitle').innerText = it.t;
  document.getElementById('editF0').value = it.t;
  document.getElementById('editF1').value = it.o || '';
  var sel2 = document.getElementById('stageSel'); sel2.innerHTML = '';
  STAGES.forEach(function(s, i){ var o = document.createElement('option'); o.value = i; o.text = s; if (i === it.s) o.selected = true; sel2.appendChild(o); });
  document.getElementById('editF2').value = it.d;
  document.getElementById('modal').classList.add('open');
  document.getElementById('editF0').focus();
}
function completeCard(){
  if (LIFECYCLE.mode !== 'edit' || LIFECYCLE.sel == null) return;
  var it = state.items[LIFECYCLE.sel];
  it.s = STAGES.length - 1; it.d = 0;
  saveLocal(); render(); closeModal(); toast('Completed'); PERSIST.schedule();
}
function voidCard(){
  if (LIFECYCLE.mode !== 'edit' || LIFECYCLE.sel == null) return;
  state.items.splice(LIFECYCLE.sel, 1);
  saveLocal(); render(); closeModal(); toast('Removed'); PERSIST.schedule();
}
function applyEdit(){
  if (LIFECYCLE.mode === 'add') {
    var t = document.getElementById('editF0').value.trim();
    if (!t) { closeModal(); return; }
    state.items.push({ t: t, o: document.getElementById('editF1').value.trim(), s: parseInt(document.getElementById('stageSel').value, 10) || 0, d: 0 });
    saveLocal(); render(); closeModal(); toast('Card added'); PERSIST.schedule();
    return;
  }
  if (LIFECYCLE.sel == null) return;
  var it = state.items[LIFECYCLE.sel];
  var newStage = parseInt(document.getElementById('stageSel').value, 10);
  it.t = document.getElementById('editF0').value.trim() || it.t;
  it.o = document.getElementById('editF1').value.trim();
  if (newStage !== it.s){
    if (ENTRY && isGated(newStage)){ toast('Needs boss approval — ask the owner'); return; } // one-way door stays shut for staff
    it.d = 0;
  } else it.d = parseInt(document.getElementById('editF2').value, 10) || 0;
  it.s = newStage;
  saveLocal(); render(); closeModal(); toast(ENTRY ? 'Saved ✓' : 'Saved'); PERSIST.schedule();
}
var IC_ZAP = '${icon("zap", 12)}';
function renderRail(counts, bneck){
  var rail = document.getElementById('stageRail');
  if (!rail) return;
  rail.innerHTML = STAGES.map(function(label, si){
    var node = '<div class="rail-node"><div class="rail-bubble mono' + (si === bneck ? ' is-bneck' : '') + '">' + counts[si] + '</div><div class="rail-name">' + label + '</div></div>';
    var arrow = si < STAGES.length - 1 ? '<span class="rail-arrow">' + IC_ZAP + '</span>' : '';
    return node + arrow;
  }).join('');
}
function buildRecords(){
  return state.items.map(function(it){ return { title: it.t, stage: STAGES[it.s], owner: it.o, days_in_stage: it.d }; });
}
// Engine 2: the ledger is the console's memory. Boot hydrates from the latest
// confirmed event (applyLoaded merges server records into seeded state); every
// edit auto-persists a full snapshot through the same submit bridge.
function applyLoaded(records){
  if (!records || !records.length) return;
  records.forEach(function(r){
    if (!r || !r.title) return;
    var si = STAGES.indexOf(r.stage);
    if (si < 0) return;
    var it = state.items.find(function(x){ return x.t === r.title; });
    var d = parseInt(r.days_in_stage, 10) || 0;
    if (it){ it.s = si; it.o = r.owner || ''; it.d = d; }
    else state.items.push({ t: r.title, s: si, o: r.owner || '', d: d });
  });
  saveLocal();
}
function exportCsv(){
  var rows = [['title', 'stage', 'owner', 'days_in_stage']];
  state.items.forEach(function(it){ rows.push([it.t, STAGES[it.s], it.o || '', it.d]); });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\\n')], { type:'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pipeline.csv'; a.click();
  toast('Exported CSV');
}
(function boot(){ var s = loadLocal(); if (s && s.items && s.items.length) state = s; render(); PERSIST.hydrate(false); })();
</script>
</body>
</html>`;
}
