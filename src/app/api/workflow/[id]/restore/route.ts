// Restore — POST /api/workflow/[id]/restore
//
// Roll the lineage back to a previous version WITHOUT time travel: the old
// row is never mutated. Its config is re-run through the same deterministic
// gates as any edit (it passed them when it was created, so this is a
// formality that also guards against schema drift) and lands as a NEW draft
// version at the head. The owner then activates it — same two-step as every
// other change. Zero LLM.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionTenantId } from "@/lib/infra/auth";
import { resolveServeRow, insertDraftVersion } from "@/lib/infra/lineage";
import { gateConsole } from "@/lib/infra/edit-pipeline";
import type { ArchetypeId } from "@/lib/infra/archetypes";
import { buildConsole } from "@/lib/infra/assemble-registry";
import { upgradeForEdit } from "@/lib/domain/config-versions";
import { recordWorkflowChange, configHashOf } from "@/lib/infra/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const version = Number(body?.version);
    if (!Number.isFinite(version)) return NextResponse.json({ error: "Missing version to restore" }, { status: 400 });

    const tenantId = await getSessionTenantId();
    if (!tenantId) return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });

    const serve = await resolveServeRow(id);
    if (!serve) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (serve.tenantId !== tenantId) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

    const lineageId = serve.lineageId ?? serve.id;
    const rows = await db.select().from(workflows).where(eq(workflows.lineageId, lineageId));
    const target = rows.find((r) => r.schemaVersion === version);
    if (!target) return NextResponse.json({ error: `Version ${version} not found in this lineage` }, { status: 404 });

    const cfg = target.config as Record<string, unknown>;
    const archetype = cfg?.archetype as ArchetypeId | undefined;
    const raw = cfg?.archetypeConfig as Record<string, unknown> | undefined;
    if (!archetype || !raw) {
      return NextResponse.json({ error: "That version has no archetype console to restore" }, { status: 400 });
    }

    // A5: the restored config may predate the current schema — upgrade it
    // first, fail closed if the upgrade can't satisfy today's constraints.
    const up = upgradeForEdit(archetype, raw, (target.configVersion as number) || 1);
    if (!up.ok) {
      return NextResponse.json({ error: "That version's config predates the current schema and failed automatic upgrade" }, { status: 409 });
    }
    const base = up.config;

    // Re-run the deterministic pipeline over the old config: zero LLM, gates
    // re-proved (protects against validator/schema drift since that version).
    let built: { html: string; parsed: Record<string, unknown> };
    try {
      built = buildConsole(archetype, base);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Restore rejected by schema: ${msg.slice(0, 400)}` }, { status: 400 });
    }
    const g = gateConsole(built.html);
    if (!g.ok) return NextResponse.json({ error: `Restore failed the ${g.error}` }, { status: 422 });

    const { newId, version: nextVersion } = await insertDraftVersion({
      wf: serve,
      config: { ...cfg, archetypeConfig: built.parsed },
      html: built.html,
      summary: `Restored version ${version}`,
    });

    void recordWorkflowChange({
      tenantId: serve.tenantId,
      lineageId: serve.lineageId,
      fromVersion: target.schemaVersion,
      toVersion: nextVersion,
      fromWorkflowId: target.id,
      toWorkflowId: newId,
      kind: "restore",
      actor: "owner",
      summary: `Restored version ${version}`,
      configHash: configHashOf(built.parsed),
    });

    return NextResponse.json({
      success: true,
      workflowId: newId,
      restoredFrom: version,
      version: nextVersion,
      status: "draft",
      previewUrl: `/app/${newId}`,
    });
  } catch (e: unknown) {
    console.error("[workflow/restore]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
