// One-shot pipeline run for the sheet-laser rack prompt.
// Replicates POST /api/chat verbatim (system prompt, repair loop, guardrails,
// artifact generation, DB save) without needing an authenticated session.
// Usage: npx tsx scripts/one-shot-rack.mts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Manifest } from "../src/lib/domain/manifest";
import type { DateRule } from "../src/lib/domain/cube/dates";

// 1. Environment first (same pattern as backfill-app.mts) — must precede the
// dynamic imports below, since ai.ts reads keys at module scope.
for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { db } = await import("../src/db/index");
const { tenants, workflows } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");
const { generateWithRepair } = await import("../src/lib/consoles/repair");
const { generateArtifact } = await import("../src/lib/pipeline/artifact");
const { ensureCanonicalKeys, deriveKey } = await import("../src/lib/domain/manifest");
const { applyGuardrails, validateIntegrity, validateAgainstPrompt } = await import("../src/lib/domain/guardrails");
const { resolveDateRule } = await import("../src/lib/domain/cube/dates");
const { z } = await import("zod");

const RACK_PROMPT = `I run a sheet lazer cutting factory. I have sheet stacking racks, 8 rows per rack and 30 such racks, i want to track what material, grade and thickness is stored in each of the rows in these 30 racks. Eventually I want to manage the storage efficiently. Build me a form or an app for this.`;

type LooseRow = { label?: string; key?: string; dateRule?: DateRule };
type LooseSchema = {
  layout_type?: string;
  intelligence?: { entities?: unknown[] };
  rows?: LooseRow[];
  columns?: unknown[];
  fields?: unknown[];
};

// ---- Verbatim from src/app/api/chat/route.ts (context + system) ------------
const today = new Date();
const formatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "full",
  timeStyle: "long",
});
const context = `
      CRITICAL CONTEXT:
      - Today is ${formatter.format(today)}.
      - Timezone is Asia/Kolkata.
      - Default currency is INR (₹).
      
    `;

const system = `You are the Architect for the 'Autonomous Operations Desk'. Build the complete form spec AND operational intelligence contract in a single pass.
${context}

RULES:
1. Classify the domain: Sales Tracker, Roster/Schedule, Checklist, Task Status, Inventory, etc.
2. If vague (e.g. "make a schedule" without days/roles, "2 staff ka target" without names/targets): set needs_clarification=true and ask in the user's language.
3. ALWAYS set 'form_title' to a short, human app name (e.g. "Petty Cash Log", "Sunday Roster").
4. If clear, emit 'ui_schema' and MUST include 'intelligence' block mapped to the domain:
   - Named people/products -> ALWAYS emit 'entities' array.
   - Sales/Metrics -> 'invariants' (e.g. numeric targets), 'analytics' (est_value), 'deadline'.
   - Roster/Schedule -> 'entities', 'coverage' (required fill counts), 'uniqueness' (scope: "grid" for no double-booking), 'deadline'.
   - Checklist -> 'invariants' (op: "not_empty"), 'analytics' (completion_rate).
   - Task Status -> 'status_matrix' (escalate pending counts).
   - Invoice -> "intelligence": { "repeatable": {"enabled": true}, "formulas": [{"targetKey": "total", "expression": "sum(amount)"}] }

DESIGN PRINCIPLES (Visual V5) — examples show ui_schema only; ALWAYS set top-level 'form_title' too:
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

const SinglePassSchema = z.object({
  needs_clarification: z.boolean().describe("True if prompt lacks names, targets, or details"),
  clarification_question: z.string().optional().describe("Ask in the input language (e.g. Hinglish if input is Hinglish)"),
  form_title: z.string().optional(),
  ui_schema: (await import("../src/lib/domain/manifest")).ManifestSchema.optional(),
});

const messages = [{ role: "user" as const, content: RACK_PROMPT }];
const userPrompt = RACK_PROMPT;

// ---- Step 1: manifest (single call + production repair loop) ---------------
const extraction = await generateWithRepair<{
  needs_clarification: boolean;
  clarification_question?: string;
  form_title?: string;
  ui_schema?: Manifest;
}>({
  system,
  messages,
  semanticChecks: (object: unknown) => {
    if (!object || typeof object !== "object") return [];
    const ui = (object as { ui_schema?: unknown }).ui_schema;
    if (!ui || typeof ui !== "object") return [];
    const integrityIssues = validateIntegrity(ui as Manifest);
    const promptIssues = validateAgainstPrompt(ui as Manifest, userPrompt);
    return [
      ...integrityIssues,
      ...promptIssues.filter(
        (i) => i.includes("reconcile") || i.startsWith("prompt specifies metric")
      ),
    ];
  },
  bestEffortSemantic: true,
}, SinglePassSchema);

if (extraction.needs_clarification === true || !extraction.ui_schema) {
  console.log("\nNEEDS CLARIFICATION (one shot ended):", extraction.clarification_question);
  process.exit(0);
}

let processedSchema: LooseSchema = extraction.ui_schema as LooseSchema;

// ---- Post-processing (verbatim order from the route) -----------------------
if (!processedSchema.intelligence) processedSchema.intelligence = {};
if (!processedSchema.intelligence?.entities) {
  if (processedSchema.layout_type === "grid" && processedSchema.rows && !processedSchema.rows.some((r) => r.dateRule)) {
    processedSchema.intelligence.entities = processedSchema.rows.map((r) => ({ label: r.label, key: r.key || deriveKey(r.label ?? "") }));
  }
}

if (processedSchema.layout_type === "grid" && processedSchema.rows) {
  const expandedRows: LooseRow[] = [];
  for (const row of processedSchema.rows) {
    if (row.dateRule) {
      const dates = resolveDateRule(row.dateRule, "Asia/Kolkata");
      for (const d of dates) {
        expandedRows.push({ ...row, dateRule: undefined, label: d.label, key: deriveKey(d.label) });
      }
    } else {
      expandedRows.push(row);
    }
  }
  processedSchema.rows = expandedRows;
}

processedSchema = ensureCanonicalKeys(processedSchema as Manifest) as LooseSchema;

const guardrail = applyGuardrails(processedSchema as Manifest, userPrompt, { enforceEntryMode: true });
processedSchema = guardrail.schema;
if (guardrail.fixes.length > 0) console.log("[Guardrails] Fixes:", guardrail.fixes);
if (guardrail.errors.length > 0) console.warn("[Guardrails] Residual integrity errors (safety-netted):", guardrail.errors);

// ---- Phase 2: artifact (single call) ---------------------------------------
let artifactHtml: string | undefined;
try {
  artifactHtml = await generateArtifact({ userPrompt, title: extraction.form_title || "", schema: processedSchema as Manifest });
  if (artifactHtml) console.log("[Artifact] Generated HTML length:", artifactHtml.length);
} catch (e) {
  console.warn("[Artifact] Generation failed, falling back to manifest renderer:", e);
  artifactHtml = undefined;
}

// ---- DB save (draft workflow, same shape as the route) ---------------------
let tenantId: string;
const existingTenants = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).limit(1);
if (existingTenants.length > 0) {
  tenantId = existingTenants[0].id;
  console.log(`[DB] Reusing tenant ${existingTenants[0].name}`);
} else {
  const created = await db.insert(tenants).values({
    name: "Rack Demo Co",
    accessCode: "RACK-DEMO",
    staffPin: "1234",
  }).returning();
  tenantId = created[0].id;
  console.log("[DB] Created demo tenant");
}

const inserted = await db.insert(workflows).values({
  tenantId,
  primitiveType: processedSchema.layout_type ?? "grid",
  config: { title: extraction.form_title, schema: processedSchema, userPrompt, ...(artifactHtml ? { artifactHtml } : {}) },
  schemaVersion: 5,
  isActive: false,
  status: "draft",
}).returning();
const workflowId = inserted[0].id;
await db.update(workflows).set({ lineageId: workflowId }).where(eq(workflows.id, workflowId));

// ---- Summary ---------------------------------------------------------------
console.log("\n================ ONE-SHOT RESULT ================");
console.log("Title        :", extraction.form_title);
console.log("Layout       :", processedSchema.layout_type);
console.log("Rows         :", (processedSchema.rows || []).length, "| Columns:", (processedSchema.columns || processedSchema.fields || []).length);
console.log("Artifact HTML:", artifactHtml ? `${artifactHtml.length} chars (injected ops-ds kit: ${artifactHtml.includes('id="ops-ds"')})` : "none (native fallback)");
console.log("Workflow ID  :", workflowId);
console.log("\nForm link    : http://localhost:3000/submit/" + workflowId);
console.log("(run `npm run dev` in ops-desk, then open the link)");
