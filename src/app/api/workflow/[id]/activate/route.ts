// Activate — POST /api/workflow/[id]/activate
//
// The explicit "go live" step for any row in a lineage: an edited draft, a
// chat revision awaiting approval, or an old version being restored. The swap
// is atomic (see activateLineageHead): exactly one active row per lineage
// survives the call. Owner-only.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionTenantId } from "@/lib/infra/auth";
import { activateLineageHead } from "@/lib/infra/lineage";
import { recordWorkflowChange, configHashOf } from "@/lib/infra/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenantId = await getSessionTenantId();
    if (!tenantId) return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });

    const rows = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = rows[0];
    if (row.tenantId !== tenantId) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

    const wasActive = row.isActive;
    const { head, previous } = await activateLineageHead(id);

    // A7: activation is a first-class change (head swap), even when the row
    // was already live.
    void recordWorkflowChange({
      tenantId: row.tenantId,
      lineageId: row.lineageId,
      fromVersion: previous?.schemaVersion ?? null,
      toVersion: head.schemaVersion,
      fromWorkflowId: previous?.id ?? null,
      toWorkflowId: head.id,
      kind: "activate",
      actor: "owner",
      summary: wasActive ? "re-activated (already live)" : `made live (was v${previous?.schemaVersion ?? "—"})`,
      configHash: configHashOf(row.config),
    });

    return NextResponse.json({ success: true, workflowId: head.id, version: head.schemaVersion, status: head.status });
  } catch (e: unknown) {
    console.error("[workflow/activate]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
