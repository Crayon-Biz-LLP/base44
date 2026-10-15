// Engine 1 — Studio: world-class front-end generation, ZERO contract weight.
// Evidence from the A/B sessions: flash-lite matches Canvas-class anatomy when
// unconstrained by manifest/key/persistence rules, and drops elements when
// overloaded. So Studio gets: user's words + one exemplar skeleton + craft
// rules. Field binding, keys, backend wiring belong to Engine 2, not here.
import { generateText } from "ai";
import { getModel, aiKeys, isQuotaError } from "./ai";
import { pickStudioExemplar } from "./studio-exemplars";

// Canonical ids from the exemplar. Studio must keep them; the deterministic
// scorer (and later Engine 2's wiring) targets exactly these.
const CANONICAL_IDS = [
  "search", "syncBtn", "kpiUtil", "barUtil",
  "mapView", "detailView", "listView", "modal", "toast",
];

export function studioAnatomyScore(html: string): number {
  if (!html) return 0;
  let score = 0;
  for (const id of CANONICAL_IDS) {
    if (html.includes(`id="${id}"`)) score++;
  }
  // Theme vars + craft floor
  if (/--bg:\s*#/.test(html)) score++;
  if (/JetBrains Mono|'Inter'/.test(html)) score++;
  // Demo seed present
  if (/seedDemo|Clear demo data/i.test(html)) score++;
  return score; // max 12
}

function buildStudioPrompt(userPrompt: string): string {
  const exemplar = pickStudioExemplar(userPrompt);
  return `You are a world-class product designer and front-end engineer building a MANAGEMENT CONSOLE — a dashboard app the operator lives in daily. The user described their operation:

---
${userPrompt}
---

Build the console they need, NOT a data-entry form. Editing happens inline (tap a unit → editor) and is never the main screen.

Below is a REFERENCE CONSOLE skeleton. Imitate its STRUCTURE and keep its canonical element ids exactly as written; adapt ALL content, palette, KPIs, labels and copy to the user's domain. The [ADAPT: ...] comments tell you what to specialize.

${exemplar}

CRAFT RULES (non-negotiable):
- Keep these exact element ids: ${CANONICAL_IDS.map((i) => `"${i}"`).join(", ")}.
- DARK, GENRE-APPROPRIATE THEME via 4-6 CSS variables on :root. Inter + JetBrains Mono (Google Fonts <link> allowed). Tabular numerals for all stats. Custom scrollbar, accent ::selection.
- **ZERO RUNTIME DEPENDENCIES (hard rule)**: NO Tailwind CDN, no framework <script>, no external JS — they do not run in the host preview and their failure deletes your entire layout. ALL CSS — including all grid/flex layout — lives inline in your <style> block; extend the reference console's layout primitives (.row, .spread, .grid-6, .grid-auto, .card, .btn, .input, .muted, .dot) with your own classes as needed.
- KPI strip: 6 live cards — Utilization % WITH progress bar, total units, 3 per-category counts with colored dots, one more of your choosing.
- The physical/operational structure the user described is the primary view: every unit visible and tappable. A detail inspector view shows one unit with its own stats and guidance. A flat list view with search + sort.
- Demo seed: on first boot (no localStorage), pre-populate a believable operating day — realistic names, values, a sensible category mix, NOT zeros. Include a "Clear demo data" action.
- Every edit re-renders and persists to localStorage. Search filters live. Toast confirms actions.
- Mobile: touch targets min 48px, KPI grid collapses gracefully.
- Single self-contained HTML file, all CSS/JS inline. No CDN scripts (see zero-runtime rule). No external calls, no audio.

Output ONLY the complete HTML document starting with <!DOCTYPE html>. No explanations, no markdown fences.`;
}

// Best-of-N: roll, score against canonical anatomy, ship the best. Early-exit
// on a perfect score. Cost stays bounded (default 2 rolls; env STUDIO_ROLLS).
export async function generateStudioConsole(opts: {
  userPrompt: string;
}): Promise<string | undefined> {
  const prompt = buildStudioPrompt(opts.userPrompt);
  const rolls = Math.max(1, Number(process.env.STUDIO_ROLLS) || 2);
  let best: { html: string; score: number } | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < rolls && attempt < aiKeys.length * 2; attempt++) {
    try {
      const { text } = await generateText({
        model: getModel(attempt),
        prompt,
        temperature: 0.6, // Studio is a creative task — more freedom than the contract path
      });

      let html = text.trim();
      const fence = html.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
      if (fence) html = fence[1].trim();

      if (!html.toLowerCase().startsWith("<!doctype html") && !html.toLowerCase().startsWith("<html")) {
        console.warn("[Studio] Roll", attempt + 1, "not HTML, discarding:", html.slice(0, 120));
        continue;
      }

      // Deterministic enforcement of the zero-dependency rule: strip any CDN
      // script the model added anyway (they never run in the sandbox, and a
      // dead <script src> invites silent layout collapse).
      html = html.replace(/<script[^>]*src=[^>]*><\/script>/gi, "");
      html = html.replace(/<link[^>]*fonts\.googleapis[^>]*>/gi, "");
      html = html.replace(/<link[^>]*fonts\.gstatic[^>]*>/gi, "");

      const score = studioAnatomyScore(html);
      console.log(`[Studio] Roll ${attempt + 1}/${rolls} scored ${score}/12 (len ${html.length})`);
      if (!best || score > best.score) best = { html, score };
      if (best.score >= 12) break;
    } catch (e) {
      console.warn(`[Studio] Roll ${attempt + 1}/${rolls} failed:`, e);
      lastError = e;
      if (isQuotaError(e)) continue;
      continue;
    }
  }

  if (best) {
    console.log(`[Studio] Shipped best roll at ${best.score}/12`);
    return best.html;
  }
  console.warn("[Studio] Generation failed:", lastError);
  return undefined;
}
