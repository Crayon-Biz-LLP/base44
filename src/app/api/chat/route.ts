import { z } from "zod";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { ensureCanonicalKeys, ManifestSchema, deriveKey, type Manifest } from "@/lib/domain/manifest";
import { applyGuardrails, validateIntegrity, validateAgainstPrompt } from "@/lib/domain/guardrails";
import { generateWithRepair } from "@/lib/infra/repair";
import { requireOwnerTenant } from "@/lib/infra/auth";
import { resolveDateRule, type DateRule } from "@/lib/domain/cube/dates";
import { isQuotaError } from "@/lib/infra/ai";
import { generateArtifact } from "@/lib/infra/artifact";
import type { ArchetypeId } from "@/lib/infra/archetypes";
import { runConsoleEdit } from "@/lib/infra/edit-pipeline";

// Pre-canonicalization shape of the LLM extraction. It is deliberately loose:
// it becomes a Manifest only after ensureCanonicalKeys + guardrails run, so the
// two seams below cast explicitly rather than pretending the raw object conforms.
type ChatColumn = { label?: string; key?: string; [k: string]: unknown };
type ChatRow = { label?: string; key?: string; dateRule?: unknown; [k: string]: unknown };
type ChatIntelligence = { entities?: unknown[]; [k: string]: unknown };
type ChatSchema = {
  layout_type?: string;
  rows?: ChatRow[];
  columns?: ChatColumn[];
  intelligence?: ChatIntelligence;
  [k: string]: unknown;
};
import { upgradeForEdit } from "@/lib/domain/config-versions";
import { recordWorkflowChange, configHashOf } from "@/lib/infra/audit";

export async function POST(req: Request) {
  try {
    const { messages, existingWorkflowId } = await req.json();

    const guard = await requireOwnerTenant();
    if (!guard.ok) return guard.response;
    const sessionTenantId = guard.tenantId;

    let existingWorkflowContext = "";
    let oldWorkflowRecord: Record<string, unknown> | null = null;

    if (existingWorkflowId) {
      const wfs = await db.select().from(workflows).where(eq(workflows.id, existingWorkflowId)).limit(1);
      if (wfs.length > 0) {
        oldWorkflowRecord = wfs[0];
        existingWorkflowContext = `
        You are editing an existing workflow. Here is the current configuration:
        ${JSON.stringify(oldWorkflowRecord.config, null, 2)}
        Preserve the existing keys/ids unless the user explicitly wants a semantic change.
        `;
      }
    }

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
      ${existingWorkflowContext}
    `;

    // ---------------------------------------------------------
    // Step 1: Single Pass Generation
    // ---------------------------------------------------------
    const SinglePassSchema = z.object({
      needs_clarification: z.boolean().describe("True if prompt lacks names, targets, or details"),
      clarification_question: z.string().optional().describe("Ask in the input language (e.g. Hinglish if input is Hinglish)"),
      form_title: z.string().optional(),
      ui_schema: ManifestSchema.optional()
    });

    const userPrompt = (messages[messages.length - 1] as { content?: string })?.content?.trim() || "";

    const extraction = await generateWithRepair<{
      needs_clarification: boolean;
      clarification_question?: string;
      form_title?: string;
      ui_schema?: Manifest;
    }>({
      system: `You are the Architect for the 'Autonomous Operations Desk'. Build the complete form spec AND operational intelligence contract in a single pass.
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
}`,
      messages,
      semanticChecks: (object: unknown) => {
        if (!object || typeof object !== "object") return [];
        const ui = (object as { ui_schema?: unknown }).ui_schema;
        if (!ui || typeof ui !== "object") return [];
        // Integrity (phantom keys) is worth every retry. Target conflicts
        // (reconcile) and collapsed metrics (prompt specifies metric ... no
        // such column) need corrected passes too. Plain MISSING targets never
        // retry — the deterministic binder closes that gap losslessly.
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

    // ---------------------------------------------------------
    // Phase 1.5: Archetype console revision? Route through the SHARED
    // deterministic edit pipeline (one merge brain, same gates as the owner
    // editor). Runs BEFORE the clarify gate: a concrete change to a running
    // console ("rename Divya to Divya Patel") is an edit, not a vague build.
    // The model proposes nouns; the platform reassembles bytes.
    // ---------------------------------------------------------
    let archetypeConfig: Record<string, unknown> | undefined;
    let archetypeSummary: string | undefined;
    let oldConfigArtifactHtml = "";
    let archetypeHtml = ""; // the pipeline's gate-passing reassembly — ALWAYS the saved bytes
    if (oldWorkflowRecord) {
      const cfg0 = oldWorkflowRecord.config as Record<string, unknown> | null;
      if (typeof cfg0?.artifactHtml === "string") oldConfigArtifactHtml = cfg0.artifactHtml;
      const arch = cfg0?.archetype as ArchetypeId | undefined;
      const base0 = cfg0?.archetypeConfig as Record<string, unknown> | undefined;
      if (arch && base0) {
        // A5: upgrade the stored config to the current shape before merging.
        const up = upgradeForEdit(arch, base0, (oldWorkflowRecord.configVersion as number) || 1);
        if (up.ok) {
          const outcome = await runConsoleEdit({ archetype: arch, base: up.config, chatEdit: userPrompt });
          if (outcome.ok && outcome.changed) {
            archetypeConfig = outcome.config;
            archetypeSummary = outcome.summary;
            archetypeHtml = outcome.html;
          }
        }
      }
    }

    if ((extraction.needs_clarification === true || !extraction.ui_schema) && !archetypeConfig) {
      return NextResponse.json({
        success: true,
        message: extraction.clarification_question || "Could you provide a few more details so I can build this correctly?",
        workflowId: null,
      });
    }

    let processedSchema: ChatSchema = extraction.ui_schema as ChatSchema;

    // The archetype-revision path above may have handled the turn entirely
    // (concrete noun edits skip clarification) — the manifest pipeline below
    // only runs when there is a manifest to process.
    if (processedSchema) {

    // Coerce entities if missing but we have person-like rows/columns (heuristics)
    if (!processedSchema.intelligence) processedSchema.intelligence = {};
    if (!processedSchema.intelligence.entities) {
      const allLabels = [...(processedSchema.rows || []), ...(processedSchema.columns || [])].map((x) => (typeof x === "string" ? x : (x.label || x))).filter((x): x is string => typeof x === 'string');
      // If rows are names (not dates), populate entities
      if (processedSchema.layout_type === "grid" && processedSchema.rows && !processedSchema.rows.some((r) => r.dateRule)) {
        processedSchema.intelligence.entities = processedSchema.rows.map((r) => ({ label: r.label, key: r.key || deriveKey(r.label ?? "") }));
      }
    }

    // Resolve date rules for grid rows
    if (processedSchema.layout_type === "grid" && processedSchema.rows) {
      const expandedRows: ChatRow[] = [];
      for (const row of processedSchema.rows) {
        if (row.dateRule) {
          const dates = resolveDateRule(row.dateRule as DateRule, "Asia/Kolkata");
          for (const d of dates) {
            expandedRows.push({
              ...row,
              dateRule: undefined,
              label: d.label,
              key: deriveKey(d.label)
            });
          }
        } else {
          expandedRows.push(row);
        }
      }
      processedSchema.rows = expandedRows;
    }

    processedSchema = ensureCanonicalKeys(processedSchema as unknown as Manifest) as unknown as ChatSchema;

    // Deterministic guardrails: public-safety net under the LLM. Referential
    // integrity (no phantom-key constraints), target/type binding, entryMode.
    const guardrail = applyGuardrails(processedSchema as unknown as Manifest, userPrompt, { enforceEntryMode: true });
    processedSchema = guardrail.schema as unknown as ChatSchema;
    if (guardrail.fixes.length > 0) console.log("[Guardrails] Fixes:", guardrail.fixes);
    if (guardrail.errors.length > 0) console.warn("[Guardrails] Residual integrity errors (safety-netted):", guardrail.errors);
    } // end if (processedSchema)

    // ---------------------------------------------------------
    // Phase 2: Artifact HTML (best-effort, Canvas-style app)
    // ---------------------------------------------------------
    let artifactHtml: string | undefined;
    if (archetypeConfig) {
      artifactHtml = archetypeHtml; // deterministic reassembly, already through every gate
    }
    else try {
      artifactHtml = await generateArtifact({
        userPrompt,
        title: extraction.form_title || "",
        schema: processedSchema as unknown as Manifest
      });
      if (artifactHtml) console.log("[Artifact] Generated HTML length:", artifactHtml.length);
    } catch (e) {
      console.warn("[Artifact] Generation failed, falling back to manifest renderer:", e);
      artifactHtml = undefined;
    }

    // ---------------------------------------------------------
    // DB Save
    // ---------------------------------------------------------
    let newWorkflowId;
    let schemaVersion = 5; // V5 Schema (Visual Vocabulary)

    if (oldWorkflowRecord) {
      if (oldWorkflowRecord.tenantId !== sessionTenantId) {
        return NextResponse.json({ error: "Unauthorized access to workflow" }, { status: 403 });
      }

      // Draft-first lifecycle: the previous head STAYS live until the owner
      // taps Approve (which activates the new row atomically, lineage-wide).
      // Archetype consoles keep their shape (archetype + archetypeConfig);
      // the pipeline already cascaded renames and ran every gate.
      schemaVersion = (oldWorkflowRecord.schemaVersion as number) + 1;

      const cfg0 = oldWorkflowRecord.config as Record<string, unknown>;
      const isArchetypeRevision = Boolean(archetypeConfig) && Boolean(archetypeHtml);
      const nextConfig = isArchetypeRevision
        ? { ...cfg0, archetypeConfig, artifactHtml: archetypeHtml, lastEditSummary: archetypeSummary, userPrompt }
        : { title: extraction.form_title, schema: processedSchema, userPrompt, ...(artifactHtml ? { artifactHtml } : {}) };

      const newWorkflow = await db.insert(workflows).values({
        tenantId: sessionTenantId,
        primitiveType: isArchetypeRevision ? (cfg0.archetype as string) : (processedSchema.layout_type as string),
        config: nextConfig,
        lineageId: (oldWorkflowRecord.lineageId as string) || (oldWorkflowRecord.id as string),
        schemaVersion,
        isActive: false,
        status: "draft"
      }).returning();
      newWorkflowId = newWorkflow[0].id;

      // A7: chat revisions to archetype consoles are audited like edits.
      if (isArchetypeRevision) {
        void recordWorkflowChange({
          tenantId: sessionTenantId,
          lineageId: (oldWorkflowRecord.lineageId as string) || (oldWorkflowRecord.id as string),
          fromVersion: oldWorkflowRecord.schemaVersion as number,
          toVersion: schemaVersion,
          fromWorkflowId: oldWorkflowRecord.id as string,
          toWorkflowId: newWorkflowId,
          kind: "chat",
          actor: "owner",
          summary: archetypeSummary ?? "chat revision",
          configHash: configHashOf(archetypeConfig),
        });
      }
    } else {
      const newWorkflow = await db.insert(workflows).values({
        tenantId: sessionTenantId,
        primitiveType: processedSchema.layout_type as string,
        config: { title: extraction.form_title, schema: processedSchema, userPrompt, ...(artifactHtml ? { artifactHtml } : {}) },
        schemaVersion,
        isActive: false,
        status: "draft"
      }).returning();
      
      await db.update(workflows).set({ lineageId: newWorkflow[0].id }).where(eq(workflows.id, newWorkflow[0].id));
      newWorkflowId = newWorkflow[0].id;
    }

    const revisedConsole = Boolean(archetypeConfig);
    return NextResponse.json({
      success: true,
      message: revisedConsole
        ? "I've updated your console. Review the preview and tap Approve to make it live."
        : `I have built your app! You can share the link below with your team right now.`,
      workflowId: newWorkflowId,
      ui_schema: processedSchema,
      app_title: extraction.form_title,
      artifact: !!artifactHtml,
      version: schemaVersion,
    });

  } catch (error: unknown) {
    console.error(error);
    
    if (isQuotaError(error)) {
      return NextResponse.json(
        { error: "Daily AI building limit reached. Resumes after midnight (Pacific). No data lost." },
        { status: 429 }
      );
    }

    const msg = error instanceof Error ? error.message : "Failed to generate workflow";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
