// Chrome — the platform's design system, compiled. Every assembler inherits
// fonts, elevation, motion, semantic tints, and icons from here so console
// identity is deterministic code, never model-authored (same doctrine as
// behavior: the model proposes nouns; the platform derives look and feel).
//
// Usage inside an assembler template literal:
//   <head> … ${chromeFonts()} … </head>
//   </style> ${chromeCss(cfg.dark, cfg.accentHex)} <style>? — insert AFTER the
//   console's own <style> block so chrome layers on top without touching ids.

export type IconName =
  | "search" | "download" | "upload" | "check" | "alert" | "clock" | "wrench"
  | "calendar" | "users" | "truck" | "grid" | "chart" | "money" | "x"
  | "lightbulb" | "zap" | "trend-up" | "shield" | "plus" | "archive";

const PATHS: Record<IconName, string> = {
  search: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>`,
  download: `<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>`,
  upload: `<path d="M12 21V9m0 0l-4 4m4-4l4 4M4 3h16"/>`,
  check: `<path d="M20 6L9 17l-5-5"/>`,
  alert: `<path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>`,
  wrench: `<path d="M14.7 6.3a4.5 4.5 0 00-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 006-6l-2.8 2.8-2.2-2.2 2.8-2.8z"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>`,
  users: `<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.6a3.5 3.5 0 010 6.8M22 20a6.5 6.5 0 00-4.5-6.2"/>`,
  truck: `<path d="M1 8h13v8H1zM14 11h4l3 3v2h-7zM6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z"/>`,
  grid: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`,
  chart: `<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>`,
  money: `<circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.4-1.3-2-3-2s-3 .6-3 1.8 1.2 1.7 3 2 3 .9 3 2.2-1.3 1.8-3 1.8-3-.6-3-2"/>`,
  x: `<path d="M18 6L6 18M6 6l12 12"/>`,
  lightbulb: `<path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0012 3z"/>`,
  zap: `<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>`,
  "trend-up": `<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>`,
  shield: `<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  archive: `<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4"/>`,
};

/** Inline stroke SVG (currentColor, sized in px). Safe inside innerHTML. */
export function icon(name: IconName, size = 16, cls = "ic"): string {
  const d = PATHS[name].replace(/<path /g, `<path stroke-linecap="round" stroke-linejoin="round" `);
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${d}</svg>`;
}

/** Actually load the display faces every console references. */
export function chromeFonts(): string {
  return (
    `<link rel="preconnect" href="https://fonts.googleapis.com">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">`
  );
}

/** Darken (#rrggbb) by pct (0–100). For gradient endpoints. */
export function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - pct / 100))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Layered chrome CSS. Insert as a second <style> AFTER the console's own so
 * these rules win without touching console ids/behavior. Uses the console's
 * existing CSS vars (--bg --surface --border --text --muted --accent).
 */
export function chromeCss(dark: boolean, accent: string): string {
  const ghost = dark ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.65)";
  const cardShadow = dark ? "0 12px 32px -14px rgba(0,0,0,.6)" : "0 10px 28px -14px rgba(15,23,42,.22)";
  const hexA = (a: string) => accent + a;
  return `<style>
:root { --ok:#34d399; --warn:#fbbf24; --danger:#f87171; --info:#38bdf8; --accent-soft:${hexA("1f")}; }
body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.tint-accent { color:${accent}; } .tint-ok { color:var(--ok); } .tint-warn { color:var(--warn); }
.tint-danger { color:var(--danger); } .tint-info { color:var(--info); }
.card {
  background-image: linear-gradient(180deg, ${ghost}, transparent 58%);
  box-shadow: ${cardShadow}, inset 0 1px 0 ${dark ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.8)"};
  transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
}
.card:hover { transform: translateY(-1px); border-color:${hexA("66")}; }
.btn { transition: transform .14s ease, border-color .14s ease, box-shadow .14s ease, filter .14s ease; }
.btn:hover { transform: translateY(-1px); border-color:${hexA("88")}; box-shadow: 0 6px 16px -8px ${hexA("aa")}; }
.btn:active { transform: translateY(0); box-shadow: none; }
.btn.primary:hover { filter: brightness(1.08); box-shadow: 0 8px 20px -8px ${hexA("cc")}; }
.input { transition: border-color .14s ease, box-shadow .14s ease; }
.input:focus { outline: none; border-color:${accent}; box-shadow: 0 0 0 3px ${hexA("26")}; }
.kpi { background-image: linear-gradient(180deg, ${ghost}, transparent 55%); }
.kpi .label { font-weight: 600; }
.kpi .val { letter-spacing: -0.02em; }
.brand-tile {
  background-image: linear-gradient(135deg, ${accent}, ${shade(accent, 32)});
  box-shadow: 0 8px 20px -8px ${hexA("cc")}, inset 0 1px 0 rgba(255,255,255,.28);
}
.modal.open .card { animation: chrome-pop .18s ease-out; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  .btn:active, .cell:active, .pcard:active, .rcard:active, .acard:active, .tcard:active { transform: none; }
}
@keyframes chrome-pop { from { opacity: 0; transform: scale(.965) translateY(6px); } to { opacity: 1; transform: none; } }
.toast { box-shadow: 0 12px 32px -12px ${hexA("ee")}; }
svg.ic { vertical-align: -3px; }
.meta-chip { font-size:10px; padding:2px 8px; border:1px solid var(--border); border-radius:999px; color:var(--muted); letter-spacing:.8px; font-weight:600; white-space:nowrap; }
.dot { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:5px; vertical-align:1px; }
.lifecycle { display:flex; gap:8px; margin-bottom:14px; }
.lifecycle .btn { display:inline-flex; align-items:center; gap:6px; }
.btn.danger-ghost { color:var(--danger); border-color:rgba(248,113,113,.4); }
.btn.danger-ghost:hover { border-color:rgba(248,113,113,.8); box-shadow:0 6px 16px -8px rgba(248,113,113,.5); }
.bar > div { background-image: linear-gradient(90deg, ${accent}, ${shade(accent, 18)}); }
.cell, .pcard, .rcard, .acard, .tcard { transition: transform .14s ease, border-color .14s ease, box-shadow .14s ease, opacity .2s ease; }
.cell:hover, .pcard:hover, .rcard:hover, .acard:hover, .tcard:hover { border-color:${hexA("88")}; }
</style>`;
}

/**
 * The console persistence + sync runtime — the plumbing every archetype used to
 * hand-copy (saveLocal/loadLocal/toast/sync/PERSIST). Emitted as its own
 * <script> BEFORE the console's own <script>, so it shares global scope with
 * the console's hoisted hooks: `state`, `buildRecords()`, `applyLoaded()`,
 * `render()`, `setEntry()`, `ENTRY`, and the `#syncBtn`/`#syncState` chrome.
 * Console-supplied: only the Sync button label.
 */
export function chromeJs(o: { syncLabel: string }): string {
  return `<script>
var LS_KEY = 'opsdesk_console_state';
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
function loadLocal(){ try{ var r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function toast(m){ var t = document.getElementById('toast'); t.innerText = m; t.classList.add('open'); setTimeout(function(){ t.classList.remove('open'); }, 2000); }
async function sync(){
  var btn = document.getElementById('syncBtn'); btn.innerText = 'Syncing…';
  try {
    if (typeof window.__opsDeskSubmit__ === 'function') {
      await window.__opsDeskSubmit__({ records: buildRecords() });
      toast('Synced to OpsDesk');
    } else { toast('Saved locally'); }
  } catch (e) { toast('Sync failed'); }
  btn.innerText = '${o.syncLabel}';
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
</script>`;
}
