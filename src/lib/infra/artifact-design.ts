// Chassis design layer — Chassis Craft Pass slice (Section B). v3.
//
// Doctrine (matches chrome.ts): the platform owns look-and-feel as compiled
// code; the console's extracted nouns and behavior are never touched. This
// layer is a THIRD <style> inserted after the console's own <style> and
// chrome's, so its rules win the cascade without editing any assembler
// template, id, or <script> — behavior is byte-identical by construction.
//
// Technique provenance (docs/ui-intake.md rows 3, 4, 10, 14, 16):
// transitions.dev (compositor-only animation), emilkowalski/skills
// (decelerate eases, meaning over decoration), designspells (press/hit as
// meaning), react-bits/Nexvyn (spring computed to keyframes, no GSAP),
// taste-skill (dials → constants).
//
// v3 LESSON (from the first side-by-side): interaction-only deltas are
// invisible at rest, and an identity that "changes" a radius to the value
// the assembler already uses is a no-op. The chassis therefore carries a
// visible AT-REST layer — numeral scale, radius language, depth — plus the
// interaction polish. Every at-rest rule changes a value the assembler
// actually emits (verified against each template).
//
// MOTION SAFETY RULE: these consoles rebuild dynamic lists via innerHTML on
// every render (each search keystroke). CSS *animations* on list items would
// replay per keystroke — noise, not meaning. Animations are allowed ONLY on
// persistent elements (KPI numerals, modal card); list feedback is
// transition/state-Δ driven; every animation sits inside
// @media (prefers-reduced-motion: no-preference).

export type ChassisArchetype =
  | "spatial" | "target-board" | "pipeline" | "ledger" | "temporal" | "fleet"
  | "queue" | "checklist" | "roster" | "calendar";

export interface ChassisOpts {
  dark: boolean;
  accent: string;
  archetype: ChassisArchetype;
}

// Design tokens — radius scale deliberately UNLIKE the assembler's default
// (8/10/12px): the chassis speaks in 10/14/999px so the shift is visible.
// Durations/easings are constants, not sliders (taste-skill dials).
const TOKENS = `
:root {
  --ch-radius-sm: 10px;
  --ch-radius-md: 14px;
  --ch-radius-pill: 999px;
  --ch-dur-fast: 140ms;
  --ch-dur-base: 200ms;
  --ch-dur-slow: 320ms;
  --ch-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ch-focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
}`;

// Motion bank — the only keyframes in the platform. Persistent elements
// only; compositor-only properties; decelerate ease; short durations.
const MOTION_BANK = `
@keyframes ch-value-roll {
  from { opacity: 0; transform: translateY(0.35em); }
  to   { opacity: 1; transform: none; }
}
@keyframes ch-pop {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to   { opacity: 1; transform: none; }
}`;

// AT-REST layer — v4 "legible identity". v3's lesson: 2–4px radius deltas
// and 5%-alpha sheens are invisible; the only rule that registered was the
// numeral jump. Values here are chosen to be unmistakable at arm's length
// while staying operator-sober: 18px cards, 12px controls, accent-tinted
// borders, real elevation, an accent line under the sticky header.
// NOTE: header border itself is an inline style — box-shadow is the only
// channel that survives it (inline styles beat stylesheet rules).
const AT_REST = `
.card, .col, .acard, .pod-card, .dist-wrap, .rail-wrap, .spark-wrap, .ring-wrap { border-radius: 18px; }
.pcard, .input, .btn { border-radius: 12px; }
.card, .col, .acard, .pod-card {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
  box-shadow: 0 18px 40px -22px rgba(0, 0, 0, 0.75), 0 2px 10px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.07);
}
.kpi .val { font-size: 26px; font-weight: 800; letter-spacing: -0.035em; font-variant-numeric: tabular-nums; }
.kpi .label { letter-spacing: 1.2px; }
header { box-shadow: inset 0 -2px 0 var(--accent); }
h1, h2, h3, h4 { letter-spacing: -0.01em; }`;

// Shared micro-interactions — meaning-carrying feedback. Static styling or
// state-Δ transitions only; safe on innerHTML-rebuilt lists. Mobile-native
// gate: tap-highlight off, touch-action manipulation, 16px inputs.
const SHARED = `
* { -webkit-tap-highlight-color: transparent; }
button, .cell, .pcard, .acard, .bcell, .chip, .pod-card { touch-action: manipulation; }
.input { font-size: 16px; }
:focus-visible { outline: none; box-shadow: var(--ch-focus-ring); }
.cell:active, .btn:active, .pcard:active, .acard:active, .bcell:active,
.chip:active, .pod-card:active { transform: scale(0.97); transition-duration: 60ms; }
.modal { backdrop-filter: blur(2px); }
@supports not (backdrop-filter: blur(2px)) { .modal { backdrop-filter: none; } }`;

// Animated layer — only under no-preference. KPI numerals roll in on load
// (persistent strip); modal pops when .open is ADDED (class state-Δ).
const MOTION = `
@media (prefers-reduced-motion: no-preference) {
${MOTION_BANK}
.kpi .val { animation: ch-value-roll var(--ch-dur-base) var(--ch-ease-out) both; }
.modal.open > .card, .modal.open .card[style] { animation: ch-pop var(--ch-dur-base) var(--ch-ease-out); }
}`;

// Per-archetype identity files — each shifts one visible AT-REST signature
// (shape language or numeral treatment) on verified selectors, plus one
// state-Δ width transition where the assembler has none.
const IDENTITIES: Record<ChassisArchetype, string> = {
  // spatial — dense-grid readouts: unit cards go 16px + visible sheen.
  spatial: `
.unit-card { border-radius: 16px; background-image: linear-gradient(180deg, rgba(255,255,255,.08), transparent 55%); }
.unit-card .mono { font-weight: 700; }`,

  // target-board — hero numerals: podium percentages at display size,
  // achievement bars become thick pill gauges that re-fill on edit.
  "target-board": `
.pod-pct { font-size: 26px; }
.bar { height: 10px; border-radius: var(--ch-radius-pill); }
.bar > div { transition: width var(--ch-dur-slow) var(--ch-ease-out); }
.pod-card.first { border-left: 3px solid var(--accent); }`,

  // pipeline — lane rhythm: stage bubbles become full pills, lanes 16px.
  pipeline: `
.rail-bubble { border-radius: var(--ch-radius-pill); }
.col { border-radius: 16px; }
.pcard { border-radius: 12px; }`,

  // ledger — table rhythm: amounts carry real weight (they are the point
  // of a khata); KPI digits inherit the display scale from AT_REST.
  ledger: `
.amt { font-weight: 800; }
.erow { transition: background var(--ch-dur-fast) var(--ch-ease-out); }`,

  // temporal — timeline slots: bookings and empty slots become full pills.
  temporal: `
.bcell, .empty { border-radius: var(--ch-radius-pill); }`,

  // fleet — gauge readouts: service bars become thick pill gauges, the
  // status-mix ribbon becomes a pill, asset cards go 16px with sheen.
  fleet: `
.svcbar { height: 8px; border-radius: var(--ch-radius-pill); }
.svcbar div { transition: width var(--ch-dur-slow) var(--ch-ease-out); }
.dist { border-radius: var(--ch-radius-pill); }
.acard { border-radius: 16px; background-image: linear-gradient(180deg, rgba(255,255,255,.08), transparent 55%); }`,

  // queue — ticker identity: the now-serving numeral is the hero, tokens are
  // full pills, queue cards get the sheen treatment.
  queue: `
.now-num { font-size: 40px; }
.token, .qrow { border-radius: var(--ch-radius-pill); }
.qcard { border-radius: 16px; background-image: linear-gradient(180deg, rgba(255,255,255,.08), transparent 55%); }`,

  // checklist — form identity: check rows become crisp 14px cards, the score
  // numeral inherits the display scale, pass/fail pills go full pill.
  checklist: `
.ck-item { border-radius: 14px; }
.ck-score { font-size: 34px; }
.ck-pass, .ck-fail { border-radius: var(--ch-radius-pill); }
.rnd-card { border-radius: 16px; background-image: linear-gradient(180deg, rgba(255,255,255,.08), transparent 55%); }`,

  // roster — grid identity: attendance cells go pill-shaped, payout KPIs
  // inherit the display scale, worker cards get the sheen.
  roster: `
.att-cell { border-radius: var(--ch-radius-pill); }
.pay-val { font-size: 26px; }
.wcard { border-radius: 16px; background-image: linear-gradient(180deg, rgba(255,255,255,.08), transparent 55%); }`,

  // calendar — timeline identity: event blocks and date cells become pills,
  // renewal rows get 16px cards with the sheen.
  calendar: `
.ev-block, .cal-cell { border-radius: var(--ch-radius-pill); }
.renew-row { border-radius: 16px; background-image: linear-gradient(180deg, rgba(255,255,255,.08), transparent 55%); }`,
};

// Reduce branch: vestibular safety. Animations off; press transforms
// neutralized; focus rings and color states survive.
const REDUCE = `
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  .cell:active, .btn:active, .pcard:active, .acard:active, .bcell:active,
  .chip:active, .pod-card:active { transform: none; }
}`;

const SENTINEL = "/* chassis:v4 */";

/** Chassis layer CSS for one console. Insert AFTER console's + chrome's. */
export function chassisCss(opts: ChassisOpts): string {
  void opts.dark;
  void opts.accent; // themed via the console's own vars — never re-declared
  return `<style id="ops-chassis">
${SENTINEL}
${TOKENS}
${AT_REST}
${MOTION}
${SHARED}
${IDENTITIES[opts.archetype]}
${REDUCE}
</style>`;
}

/**
 * Layer the chassis onto an assembled console with zero assembler edits:
 * spliced in before </head> so it lands after the console's <style> and
 * chrome's (cascade order = console < chrome < chassis). Idempotent via
 * sentinel. The console's <script> is untouched — behavior is byte-identical.
 */
export function withChassis(html: string, opts: ChassisOpts): string {
  if (html.includes(SENTINEL)) return html;
  if (!html.includes("</head>")) return html; // not a full document — refuse
  return html.replace("</head>", `${chassisCss(opts)}</head>`);
}
