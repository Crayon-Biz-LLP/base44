import { generateText } from "ai";
import { getModel, aiKeys, isQuotaError } from "./ai";
import type { Manifest } from "@/lib/domain/manifest";

// ---- Deterministic design-system preamble --------------------------------
// Polish is guaranteed by code, not by the model's taste: every generated
// artifact gets the same font stack, design tokens and .ops-* component kit.
// The prompt only chooses genre/arrangement and overrides the CSS variables
// to theme. Idempotent — never duplicates the kit or the font links.

const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">`;

const ACCENT_HEX: Record<string, string> = {
  emerald: "#10b981",
  amber: "#f59e0b",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  neutral: "#0ea5e9",
};

// Deterministic default accent: the first accent declared on any field visual
// (grid columns / list fields). Falls back to sky blue.
export function deriveAccentHex(schema: Manifest): string {
  const candidate = schema as { columns?: unknown; fields?: unknown; rows?: unknown };
  const groups = [candidate?.columns, candidate?.fields, candidate?.rows];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      const hex = ACCENT_HEX[(item as { visual?: { accent?: string } })?.visual?.accent ?? ""];
      if (hex) return hex;
    }
  }
  return ACCENT_HEX.neutral;
}

export function designPreamble(accentHex: string): string {
  return `<style id="ops-ds">
:root {
  --ops-accent: ${accentHex};
  --ops-accent-soft: color-mix(in srgb, var(--ops-accent) 12%, transparent);
  --ops-bg: #f8fafc;
  --ops-surface: #ffffff;
  --ops-border: #e2e8f0;
  --ops-text: #0f172a;
  --ops-muted: #64748b;
  --ops-radius: 16px;
  --ops-font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --ops-font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
}
body { background: var(--ops-bg); color: var(--ops-text); font-family: var(--ops-font-sans); -webkit-font-smoothing: antialiased; }
.ops-card { background: var(--ops-surface); border: 1px solid var(--ops-border); border-radius: var(--ops-radius); padding: 1.25rem; box-shadow: 0 1px 2px rgb(15 23 42 / 0.06), 0 8px 24px rgb(15 23 42 / 0.05); }
.ops-hero { font-family: var(--ops-font-mono); font-variant-numeric: tabular-nums; font-weight: 700; font-size: clamp(2.5rem, 8vw, 3.5rem); letter-spacing: -0.02em; text-align: center; width: 100%; background: transparent; border: 2px solid var(--ops-accent); border-radius: 14px; padding: 0.75rem 1rem; color: var(--ops-text); outline: none; }
.ops-hero:focus { box-shadow: 0 0 0 4px var(--ops-accent-soft); }
.ops-chip { min-height: 48px; padding: 0 1.1rem; border-radius: 999px; border: 1px solid var(--ops-border); background: var(--ops-surface); color: var(--ops-text); font-weight: 600; font-size: 1rem; transition: background 0.15s, border-color 0.15s; }
.ops-chip:active { background: var(--ops-accent-soft); border-color: var(--ops-accent); }
.ops-btn { min-height: 48px; padding: 0 1.4rem; border-radius: 12px; font-weight: 700; border: 1px solid var(--ops-border); background: var(--ops-surface); color: var(--ops-text); }
.ops-btn-primary { background: var(--ops-accent); border-color: var(--ops-accent); color: #ffffff; }
.ops-pill { display: inline-flex; align-items: center; gap: 0.35rem; min-height: 28px; padding: 0 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
.ops-pill-ok { background: #dcfce7; color: #166534; }
.ops-pill-warn { background: #fef3c7; color: #92400e; }
.ops-pill-err { background: #fee2e2; color: #991b1b; }
.ops-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; }
.ops-mono { font-family: var(--ops-font-mono); font-variant-numeric: tabular-nums; }
.ops-glow { box-shadow: 0 0 28px var(--ops-accent-soft); }
input, select, textarea { font-family: inherit; }
::selection { background: var(--ops-accent); color: #ffffff; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: var(--ops-border); border-radius: 999px; }
</style>`;
}

const KIT_SENTINEL = "--ops-font-sans: 'Inter'";

export function injectDesignPreamble(html: string, accentHex: string): string {
  const hasRealKit = html.includes(KIT_SENTINEL);
  if (hasRealKit) return html;
  const fonts = /fonts\.googleapis\.com/i.test(html) ? "" : `\n${FONT_LINKS}`;
  const block = `${fonts}\n${designPreamble(accentHex)}`;
  // The model may imitate the kit (writing its own id="ops-ds" block without
  // fonts/chips/focus states). A real kit carries the sentinel; an imitation
  // is stripped and replaced with the deterministic one.
  if (/<style id="ops-ds">[\s\S]*?<\/style>/i.test(html)) {
    return html.replace(/<style id="ops-ds">[\s\S]*?<\/style>/i, designPreamble(accentHex)).replace(/<head[^>]*>/i, (m) => `${m}${fonts}`);
  }
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${block}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}${block}`);
  return `${block}\n${html}`;
}

// Deterministic save-time enrichment: injects the design kit and ensures every
// generated artifact exposes the decimal keyboard on mobile. Idempotent —
// never duplicates the preamble or an existing inputmode.
export function enrichArtifact(html: string, opts?: { accentHex?: string }): string {
  const withKit = injectDesignPreamble(html, opts?.accentHex ?? ACCENT_HEX.neutral);
  return withKit.replace(
    /<input(?=[^>]*\btype="number")(?![^>]*\binputmode\s*=)[^>]*>/gi,
    (tag) => tag.replace(/>\s*$/, ' inputmode="decimal" enterKeyHint="done">')
  );
}

// ---- Deterministic console-anatomy scoring ---------------------------------
// Best-of-N gate against flash-lite variance: with a long contract prompt the
// model drops 2–3 anatomy elements per roll at random. Every check below is
// greppable — no LLM judging. Higher is better; max 10.
export function scoreArtifact(html: string): number {
  if (!html) return 0;
  let score = 0;
  // 1. Real design kit (sentinel) — polish floor.
  if (html.includes("--ops-font-sans: 'Inter'")) score++;
  // 2. KPI strip: >=3 live-computed stat hooks (ids/classes the JS updates).
  const kpiHooks = (html.match(/id="(kpi|stat|util|total|filled|count|occup)[A-Za-z]*"/gi) || []).length;
  if (kpiHooks >= 3) score++;
  // 3. Domain search bar with a teaching placeholder.
  if (/<input[^>]*id="[^"]*search[^"]*"[^>]*placeholder=/i.test(html) || /<input[^>]*placeholder=[^>]*id="[^"]*search/i.test(html)) score++;
  // 4. Multi-view: tabs or master-detail inspector.
  if (/viewTab|tab-btn|data-tab|switchView|inspector|detail-panel/i.test(html)) score++;
  // 5. Filter pills / legend chips.
  if (/filter-pill|filter-btn|legend|data-filter/i.test(html)) score++;
  // 6. Inline editor (modal/popover) instead of a bare form.
  if (/modal|popover|dialog/i.test(html)) score++;
  // 7. Theme override of the kit variables (genre-appropriate look).
  if (/--ops-bg:\s*#(0|1|2|3)/i.test(html)) score++;
  // 8. Export/audit-style header actions.
  if (/Export CSV|Export|Audit/i.test(html)) score++;
  // 9. Persistence: boot load + localStorage backup (app semantics).
  if (html.includes("__opsDeskLoad__") && /localStorage/i.test(html)) score++;
  // 10. Demo seed: believable first impression, not zeros.
  if (/demo|sample data|seed/i.test(html)) score++;
  return score;
}

export async function generateArtifact(opts: {
  userPrompt: string;
  title: string;
  schema: Manifest;
}): Promise<string | undefined> {
  const schemaJson = JSON.stringify(opts.schema, null, 2);

  const prompt = `You are building a MANAGEMENT CONSOLE — a dashboard app the operator lives in daily — for a business operator. The user described their operation:

---
${opts.userPrompt}
---

Build the console they need, NOT a data-entry form. Editing happens inline inside the console (tap a unit → edit) and is never the main screen.

REQUIRED CONSOLE ANATOMY:
1. Header: invented product name + logo tile, a domain search bar (placeholder teaches the domain), primary actions (e.g. Export CSV, a domain-specific audit button).
2. KPI STRIP: 5–6 stat cards computed live from current state (totals, utilization % with progress bar, per-category breakdowns with colored dots).
3. VIEWS: (a) visual overview of the physical/operational structure — every unit visible as a tappable card; (b) detail inspector for a single unit with its own stats and guidance; (c) flat list with search + sort. Use tabs or a master-detail split.
4. FILTER PILLS over key categories + a color legend row.
5. EDITING: click any unit → inline editor (modal/popover) → unit updates in place and KPIs recompute.
6. ADVISORY INTELLIGENCE: 2–3 domain best-practice cues rendered in the UI.

Two sources of truth, with different jobs:
- **THE USER'S OWN WORDS are authoritative for WHAT the console is and HOW it is organized.** Build exactly the interface they describe. If they describe physical space — racks, rows, slots, bins, tables, rooms, bays — embody that structure as the primary interface (a visual map of tappable/fillable units), NEVER a flat form or log that ignores the structure they described.
- **THE MANIFEST is authoritative for DATA INTEGRITY.** Field keys (name="/data-key=" MUST use the exact manifest keys — never rename), labels, and business rules (repeatable rows, formulas, sequences, statuses, invariants). If the interface you built has structure the manifest doesn't model 1:1, keep your interface AND still use the manifest keys for the fields it does define; introduce location fields for the spatial parts.

MANIFEST (data contract):
${schemaJson}

    Write a SINGLE self-contained HTML file implementing ${opts.title || "the app"}:
- Inline CSS + JS (you may load Tailwind CDN). The fonts Inter + JetBrains Mono and a design-token stylesheet (id="ops-ds") are ALREADY injected into <head> — build with them; never remove or duplicate them.
- **GENRE BEFORE FORM**: Pick the visual genre the domain deserves. NEVER default to a plain form/table when the domain has physical or visual structure. Non-exhaustive examples: invoice → premium printable document; pipeline/orders → kanban board; racks/bins/slots/tables/rooms → interactive spatial map with tap-to-edit slots; cash/money → ledger with a reconciliation banner; targets → KPI dashboard; roster → planning board. If nothing fits, invent the genre.
- **DESIGN SYSTEM (compose, don't restyle)**: every surface is built from the injected kit: CSS variables (--ops-accent, --ops-bg, --ops-surface, --ops-border, --ops-text, --ops-muted) and classes .ops-card, .ops-hero, .ops-chip, .ops-btn, .ops-btn-primary, .ops-pill (plus -ok/-warn/-err variants), .ops-kpis, .ops-mono, .ops-glow. To theme the app, override the variables in ONE :root rule (e.g. a factory floor → dark industrial background with a domain accent) instead of scattering raw colors. NEVER re-declare .ops-* classes themselves — theme ONLY by overriding the variables; you may add your OWN new classes freely.
- **BRANDING**: Invent a short domain-derived product name for the header with a small accent logo tile.
  - Emphasize "hero" variant fields with a large, centered display using .ops-hero (e.g. big currency counter).
  - Provide "quick_tap" denomination/suggestion chips styled with .ops-chip below the input if 'quickChips' are present in the manifest (e.g. [100, 500, 2000]).
  - Render status pills with .ops-pill plus the -ok/-warn/-err variant matching their severity or intent.
  - Never display more than 6 primary fields without grouping them into clean, padded .ops-card cards.
  - Make mobile touch targets large (min 48px) — .ops-chip and .ops-btn already comply.
  - EVERY number/currency <input> MUST include inputmode="decimal" and enterKeyHint="done"; hero numeric inputs use .ops-hero (large, centered, bold against the accent color).
- Every input/select/textarea: name="<key>", data-key="<key>" (manifest keys). Visible labels should match the manifest label when a defined field is presented; spatial UIs should ALSO show positional labels (e.g. "Rack 3 · Row 7").
- Repeatable rows: an "Add" button appends a new line item. Formulas: computed live (row total = qty x amount, grand total = sum of rows). Sequences/invoice numbers auto-increment.
- **PERSISTENCE (mandatory for app semantics)**: The console is a real app — it must NOT forget data on reload.
  - On boot: call await window.__opsDeskLoad__(); if boot.records is a non-empty array, rehydrate ALL console state from it (records carry location fields like rackId/rowNumber) and render. If boot fails or is empty AND localStorage has saved state, restore from localStorage instead.
  - After every edit: persist the full current state to localStorage (key: 'opsdesk_state_<workflowId>') so edits survive reload even without a sync.
  - On Save/Sync: call window.__opsDeskSubmit__(data). On success, refresh the localStorage backup with the synced snapshot.
- **DEMO SEED**: On very first boot (no loaded records AND no localStorage), pre-populate realistic sample data for the domain (a believable operating day, not zeros — e.g. a factory console shows most racks stocked with sensible materials/grades/thicknesses). Include a visible 'Clear demo data' action that wipes to empty.
- A prominent "Save" / "Sync" button. The console runs on local state; on Save/Sync, gather all data and call window.__opsDeskSubmit__(data), where 'data' is:
   (a) { records: [ { <key>: <value>, ... } ] } — one object per row/line-item (grids, dynamic forms, and spatial slot-fills — for racks/rows/slots emit one record per slot including its location fields, e.g. rackId and rowNumber). Include rowLabel and rowKey.
   (b) { actuals: { <rowKey>: { <colKey>: <value> } } } — ONLY when rows/columns are exactly the static manifest rows/columns. Use the exact manifest row KEY (e.g. k20261004), NOT the human-readable label.
   window.__opsDeskSubmit__ returns a Promise that resolves ONLY after the store has saved the data. Use it honestly: await the promise, show a success message only when it resolves, and show an error message when it rejects. NEVER show "saved" before the promise resolves.
- Defaults: leave numeric fields EMPTY (value="") unless the manifest dictates a seed value. Do NOT default quantity/qty to 1 or amount/price to 0 — a blank new entry must look blank, not like ₹0 or 1 unit.
- NO <form action>, fetch, or window.location for submission. The ONLY save path is window.__opsDeskSubmit__.
- No audio, autoplay, or external server calls. Images via data URI or emoji only.

Output ONLY the complete HTML document starting with <!DOCTYPE html>. No explanations, no markdown code fences.`;

  try {
    // Best-of-N against flash-lite variance: with a long contract prompt the
    // model drops 2–3 anatomy elements per roll at random. Roll ARTIFACT_ROLLS
    // times (default 3), score each output deterministically, ship the highest.
    // Key rotation is preserved per-roll; early-exit on a perfect console.
    const rolls = Math.max(1, Number(process.env.ARTIFACT_ROLLS) || 3);
    let best: { html: string; score: number } | null = null;
    let lastError: unknown = null;

    for (let roll = 0; roll < rolls; roll++) {
      try {
        const { text } = await generateText({
          model: getModel(roll),
          prompt,
          temperature: 0.4,
        });

        let html = text.trim();
        const fence = html.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
        if (fence) html = fence[1].trim();

        if (!html.toLowerCase().startsWith("<!doctype html") && !html.toLowerCase().startsWith("<html")) {
          console.warn("[Artifact] Roll", roll + 1, "output does not look like HTML, discarding:", html.slice(0, 200));
          continue;
        }

        const enriched = enrichArtifact(html, { accentHex: deriveAccentHex(opts.schema) });
        const score = scoreArtifact(enriched);
        console.log(`[Artifact] Roll ${roll + 1}/${rolls} scored ${score}/10 (len ${enriched.length})`);

        if (!best || score > best.score) best = { html: enriched, score };
        if (best.score >= 10) break; // perfect console — no need for more rolls
      } catch (e) {
        console.warn(`[Artifact] Roll ${roll + 1}/${rolls} failed:`, e);
        lastError = e;
        if (isQuotaError(e)) continue;
        continue; // non-quota failure on one roll — try the next
      }
    }

    if (best) {
      console.log(`[Artifact] Shipped best roll at ${best.score}/10`);
      return best.html;
    }
    console.warn("[Artifact] Generation failed, falling back to manifest renderer:", lastError);
    return undefined;
  } catch (e) {
    console.warn("[Artifact] Generation failed:", e);
    return undefined;
  }
}