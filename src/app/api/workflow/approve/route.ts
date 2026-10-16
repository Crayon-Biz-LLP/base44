import { NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOwnerTenant } from "@/lib/infra/auth";
import { activateLineageHead } from "@/lib/infra/lineage";
import { recordWorkflowChange } from "@/lib/infra/audit";

export async function POST(req: Request) {
  try {
    const { workflowId } = await req.json();
    if (!workflowId) return NextResponse.json({ error: "Missing workflowId" }, { status: 400 });

    const guard = await requireOwnerTenant();
    if (!guard.ok) return guard.response;
    const tenantId = guard.tenantId;

    const wfs = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
    if (wfs.length === 0 || wfs[0].tenantId !== tenantId) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Lineage-aware activation: the given row becomes the single live head;
    // every sibling (including an older active head) is deactivated.
    const { head, previous } = await activateLineageHead(workflowId);

    void recordWorkflowChange({
      tenantId: wfs[0].tenantId,
      lineageId: wfs[0].lineageId,
      fromVersion: previous?.schemaVersion ?? null,
      toVersion: head.schemaVersion,
      fromWorkflowId: previous?.id ?? null,
      toWorkflowId: head.id,
      kind: "activate",
      actor: "owner",
      summary: "approved chat draft",
    });

    return NextResponse.json({ success: true, workflowId: head.id, version: head.schemaVersion });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
