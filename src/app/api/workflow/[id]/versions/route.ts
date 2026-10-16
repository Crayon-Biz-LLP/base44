// Versions — GET /api/workflow/[id]/versions
//
// The lineage's version history for the owner's version strip: every row of
// the id's lineage, newest first, flagged with which one currently serves
// (head) and which one the URL's id points at. Zero LLM, one query.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOwnerTenant } from "@/lib/infra/auth";
import { resolveServeRow } from "@/lib/infra/lineage";

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
      .select({
        id: workflows.id,
        schemaVersion: workflows.schemaVersion,
        status: workflows.status,
        isActive: workflows.isActive,
        createdAt: workflows.createdAt,
        config: workflows.config,
      })
      .from(workflows)
      .where(eq(workflows.lineageId, lineageId))
      .orderBy(workflows.schemaVersion);

    const versions = rows
      .map((r) => {
        const cfg = (r.config ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          version: r.schemaVersion,
          status: r.isActive ? "live" : (r.status as string),
          createdAt: r.createdAt,
          title: cfg.title ?? null,
          summary: (cfg.lastEditSummary as string | undefined) ?? null,
          isHead: r.isActive === true,
          isServed: r.id === serve.id,
        };
      })
      .reverse();

    return NextResponse.json({ success: true, lineageId, serveId: serve.id, versions });
  } catch (e) {
    console.error("[workflow/versions]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
