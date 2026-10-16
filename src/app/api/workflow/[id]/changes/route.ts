// Changes — GET /api/workflow/[id]/changes
//
// The audit trail for one console lineage (newest first, 50 most recent):
// every edit, chat revision, restore, and activation — who, when, from/to
// version, summary, config hash. Owner-only.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workflowChanges } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireOwnerTenant } from "@/lib/auth/auth";
import { resolveServeRow } from "@/lib/data/lineage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requireOwnerTenant();
    if (!guard.ok) return guard.response;
    const tenantId = guard.tenantId;

    const serve = await resolveServeRow(id);
    if (!serve) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (serve.tenantId !== tenantId) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

    const lineageId = serve.lineageId ?? serve.id;
    const rows = await db
      .select()
      .from(workflowChanges)
      .where(eq(workflowChanges.lineageId, lineageId))
      .orderBy(desc(workflowChanges.createdAt))
      .limit(50);

    return NextResponse.json({ success: true, lineageId, changes: rows });
  } catch (e) {
    console.error("[workflow/changes]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
