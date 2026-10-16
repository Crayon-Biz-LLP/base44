import { google } from "@ai-sdk/google";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { NextResponse } from "next/server";
import { DashboardSpecSchema, type DashboardSpec } from "@/lib/domain/dashboard-spec";
import { eq, and } from "drizzle-orm";
import { generateWithRepair } from "@/lib/infra/repair";
import { requireOwnerTenant } from "@/lib/infra/auth";

type SchemaShape = { layout_type?: string; rows?: { label?: string }[]; fields?: { label?: string }[] };
type ConfigShape = { title?: string; schema?: SchemaShape };

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const guard = await requireOwnerTenant();
    if (!guard.ok) return guard.response;
    const tenantId = guard.tenantId;

    // Fetch tenant's active workflows for LLM context
    const tenantWorkflows = await db.select().from(workflows).where(
      and(
        eq(workflows.tenantId, tenantId),
        eq(workflows.isActive, true)
      )
    );
    if (tenantWorkflows.length === 0) {
      return NextResponse.json({ empty: true });
    }

    const workflowContext = tenantWorkflows.map(w => {
      const c = w.config as ConfigShape;
      const s = c.schema ?? {};
      return {
        workflowId: w.id,
        title: c.title,
        layout_type: s.layout_type,
        // Expose available row labels or field labels so LLM knows what metrics exist
        metrics: s.layout_type === 'grid' 
          ? s.rows?.map((r) => r.label) 
          : s.fields?.map((f) => f.label)
      };
    });

    const today = new Date();
    const formatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "long",
    });

    const object = await generateWithRepair<DashboardSpec>({
      model: google("gemini-3.1-flash-lite"),
      system: `You are a Dashboard Compiler for an operations platform.
      Your job is to read the owner's request (e.g., "Ramesh vs Suresh last 7 days", "Today's summary") and build a JSON dashboard spec.

      CRITICAL CONTEXT:
      - Today is ${formatter.format(today)}.
      - Timezone is Asia/Kolkata. 

      AVAILABLE WORKFLOWS (You MUST ONLY use workflowIds and metrics from this list):
      ${JSON.stringify(workflowContext, null, 2)}

      RULES:
      - Only pick workflowIds from the list.
      - metric.rowLabel MUST match one of the available metrics exactly (case-sensitive). If computing a general count, you can omit rowLabel and use kind="count".
      - widget types: 'stat' (single big number), 'trend' (line chart over time), 'compare' (bar chart comparing staff), 'breakdown' (pie chart), 'table' (rows of data).
      - entity: Use 'staff' for grid layouts when grouping by staff members.
      - dateRange: Pick the closest match from the enum based on the user's prompt.
      - aggregation: Pick appropriate aggregation (avg for percentages, sum for actuals, count for submissions).

      If the user prompt is vague (e.g., "show me everything", "dashboard", "summary"), generate a sensible overview with a stat and table for each workflow.`,
      prompt: prompt,
    }, DashboardSpecSchema);

    // Post-validation: ensure workflowIds actually exist for this tenant
    const validIds = new Set(tenantWorkflows.map(w => w.id));
    const validWidgets = object.widgets.filter((w) => !w.workflowId || validIds.has(w.workflowId));

    return NextResponse.json({
      success: true,
      spec: { widgets: validWidgets },
      workflowIds: Array.from(validIds) // return valid ids for harness testing
    });

  } catch (error) {
    console.error("Dashboard Generate Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate dashboard" }, { status: 500 });
  }
}
