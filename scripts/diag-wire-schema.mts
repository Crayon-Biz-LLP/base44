// Diagnostic #3: A/B test wire-level structured outputs.
//   default:            responseSchema derived from Zod is sent on the wire (production behavior)
//   DIAG_JSON_MODE=1:   providerOptions.google.structuredOutputs=false → JSON mime only,
//                       schema enforced client-side by Zod after the call.
// Uses the VERBATIM production system prompt from src/app/api/chat/route.ts.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { ManifestSchema } from "../src/lib/domain/manifest";

const prompt = process.argv[2] || "petty cash log";
const modelId = process.env.DIAG_MODEL || "gemini-3.1-flash-lite";
const samples = Number(process.env.DIAG_SAMPLES || "1");
const jsonMode = process.env.DIAG_JSON_MODE === "1";

const SinglePassSchema = z.object({
  needs_clarification: z.boolean().describe("True if prompt lacks names, targets, or details"),
  clarification_question: z.string().optional().describe("Ask in the input language (e.g. Hinglish if input is Hinglish)"),
  form_title: z.string().optional(),
  ui_schema: ManifestSchema.optional(),
});

// Verbatim from src/app/api/chat/route.ts
const context = `CRITICAL CONTEXT:
- Today is Wed, September 16, 2026 at 6:20:30 PM IST.
- Timezone is Asia/Kolkata.
- Default currency is INR (₹).
`;
const system = `You are the Architect for the 'Autonomous Operations Desk'. Build the complete form spec AND operational intelligence contract in a single pass.
${context}

RULES:
1. Classify the domain: Sales Tracker, Roster/Schedule, Checklist, Task Status, Inventory, etc.
2. If vague (e.g. "make a schedule" without days/roles, "2 staff ka target" without names/targets): set needs_clarification=true and ask in the user's language.
3. If clear, emit 'ui_schema' and MUST include 'intelligence' block mapped to the domain:
   - Named people/products -> ALWAYS emit 'entities' array.
   - Sales/Metrics -> 'invariants' (e.g. numeric targets), 'analytics' (est_value), 'deadline'.
   - Roster/Schedule -> 'entities', 'coverage' (required fill counts), 'uniqueness' (scope: "grid" for no double-booking), 'deadline'.
   - Checklist -> 'invariants' (op: "not_empty"), 'analytics' (completion_rate).
   - Task Status -> 'status_matrix' (escalate pending counts).
   - Invoice -> "intelligence": { "repeatable": {"enabled": true}, "formulas": [{"targetKey": "total", "expression": "sum(amount)"}] }

DESIGN PRINCIPLES (Visual V5):
- HIGHLIGHT THE HERO: Every workflow has one primary number that matters most (e.g. Total Cash, Grand Total). Mark that field with "visual": {"variant": "hero"}.
- SPEED UP FREQUENT ACTIONS: For numeric targets or currency, add "quickChips" (e.g. [100, 500, 2000]).
- ASSIGN LOGICAL ICONS & ACCENTS: Use "emerald" for cash/revenue, "amber" for variances/returns, "blue" for targets. Use bundled icons ("wallet", "receipt", "clock", "users", "alertTriangle").
- MOBILE COGNITIVE LOAD: Keep primary cards under 6 fields. Use "compact" for dense secondary data.

CRITICAL JSON RULES:
- layout_type MUST be exactly "list" or "grid". Do not use "form" or "invoice".
- ALL properties in ui_schema and intelligence MUST be properly formatted JSON Objects or Arrays of Objects, NEVER strings.
- CORRECT: "rows": [{"label": "Ramesh", "target": 20}]
- INCORRECT: "rows": ["Ramesh"]
- CORRECT: "intelligence": { "entities": [{"label": "Ramesh"}] }
- INCORRECT: "intelligence": "entities: Ramesh"

EXAMPLE 1 (Roster): "roster for 3 volunteers (Ramesh, Priya, Anil) on Sunday, slots Beginners (1)"
{
  "needs_clarification": false,
  "ui_schema": {
    "layout_type": "grid",
    "rows": [{"dateRule": "Sundays"}],
    "columns": [{"label": "Beginners"}],
    "intelligence": {
      "entities": [{"label": "Ramesh"}, {"label": "Priya"}, {"label": "Anil"}],
      "coverage": [{"scope": "column", "key": "beginners", "count": 1, "label": "Beginners needs 1"}],
      "uniqueness": {"scope": "grid", "label": "No double booking", "severity": "warning"}
    }
  }
}

EXAMPLE 2 (Sales): "daily sales targets for 2 staff, Ramesh 20, Suresh 15"
{
  "needs_clarification": false,
  "ui_schema": {
    "layout_type": "grid",
    "rows": [{"label": "Ramesh", "target": 20}, {"label": "Suresh", "target": 15}],
    "columns": [{"label": "Sales", "type": "number"}],
    "intelligence": {
      "entities": [{"label": "Ramesh", "key": "ramesh"}, {"label": "Suresh", "key": "suresh"}],
      "invariants": [{"leftKey": "sales", "op": "gte", "rightValue": 0, "errorMessage": "Sales must be positive"}],
      "analytics": [{"kind": "est_value", "label": "Estimated Value"}]
    }
  }
}

EXAMPLE 3 (Invoice): "invoice form"
{
  "needs_clarification": false,
  "ui_schema": {
    "layout_type": "grid",
    "rows": [{"label": "Line Item"}],
    "columns": [{"label": "Item"}, {"label": "Amount", "type": "currency"}],
    "intelligence": {
      "repeatable": {"enabled": true},
      "formulas": [{"targetKey": "total", "expression": "sum(amount)", "scope": "column"}],
      "sequence": [{"key": "invoiceId", "start": 1000}]
    }
  }
}`;

let wireChecked = false;
const origFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  if (!wireChecked && init?.body) {
    wireChecked = true;
    try {
      const body = JSON.parse(init.body);
      const gc = body.generationConfig ?? {};
      console.log(`[wire] mode=${jsonMode ? "JSON-only" : "structured-outputs"} responseMimeType=${gc.responseMimeType} responseSchema=${gc.responseSchema ? "SENT (" + JSON.stringify(gc.responseSchema).length + " chars)" : "omitted"}`);
    } catch {}
  }
  return origFetch(input, init);
};

const provider = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

let ok = 0;
for (let i = 1; i <= samples; i++) {
  const t0 = Date.now();
  try {
    const { object } = await generateObject({
      model: provider(modelId),
      schema: SinglePassSchema,
      ...(jsonMode ? { providerOptions: { google: { structuredOutputs: false } } } : {}),
      system,
      messages: [{ role: "user", content: prompt }],
    });
    ok++;
    const ui = object.ui_schema as any;
    console.log(`  run ${i}: SUCCESS in ${Date.now() - t0}ms — layout=${ui?.layout_type} rows=${JSON.stringify(ui?.rows)?.slice(0, 80)} fields=${Array.isArray(ui?.fields) ? ui.fields.length : typeof ui?.fields}`);
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string; text?: string };
    console.log(`  run ${i}: FAILED in ${Date.now() - t0}ms — ${err.name}: ${(err.message || "").slice(0, 160)}`);
    if (err.text) console.log(`    raw >> ${String(err.text).slice(0, 500).replace(/\n+/g, " ")}`);
  }
}
console.log(`RESULT [${modelId} ${jsonMode ? "JSON-mode" : "structured"}] ${ok}/${samples} valid`);
