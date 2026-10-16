import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, workflows } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { requireOwnerTenant } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireOwnerTenant();
  if (!guard.ok) return guard.response;
  const tenantId = guard.tenantId;

  const recentEvents = await db
    .select({
      id: events.id,
      workflowId: events.workflowId,
      filledBy: events.filledBy,
      verdict: events.verdict,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(eq(events.tenantId, tenantId))
    .orderBy(desc(events.createdAt))
    .limit(12);

  const workflowIds = [...new Set(recentEvents.map((e) => e.workflowId))];
  const wfRows = workflowIds.length > 0
    ? await db
        .select({ id: workflows.id, config: workflows.config })
        .from(workflows)
        .where(inArray(workflows.id, workflowIds))
    : [];

  const titleByWorkflow = new Map<string, string>();
  for (const wf of wfRows) {
    const config = wf.config as Record<string, unknown> | undefined;
    titleByWorkflow.set(wf.id, typeof config?.title === "string" ? config.title : "Untitled app");
  }

  const saves = recentEvents.map((e) => ({
    eventId: e.id,
    workflowId: e.workflowId,
    workflowTitle: titleByWorkflow.get(e.workflowId) || "Untitled app",
    filledBy: e.filledBy,
    verdict: e.verdict,
    createdAt: e.createdAt,
  }));

  return NextResponse.json({ saves });
}