// Owner edits — POST /api/workflow/[id]/edit
//
// The owner changes nouns (names, rates, targets, stages, theme) on a RUNNING
// console. The model is never in the structured path: edited config → cascade
// renames → Zod schema (the archetype's own contract) → deterministic
// reassemble → artifact validator + syntax gate → NEW DRAFT version row.
//
// The live head stays live until the owner taps "Make live" (or Approve) —
// see /api/workflow/[id]/activate. The edit response carries the NEW id so the
// editor can preview it; old links keep serving the live head meanwhile.
//
// chatEdit (optional): the owner's words in plain language. ONE structured
// merge call converts them to a bounded patch list, applied server-side, then
// the SAME deterministic pipeline runs. The model still never writes code —
// it proposes nouns; the platform owns the console bytes.
//
// Body: { patch?: Partial<archetypeConfig>, chatEdit?: string }
// Returns: { success, workflowId (new draft), version, summary?, cascaded? }
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOwnerTenant } from "@/lib/auth/auth";
import type { ArchetypeId } from "@/lib/pipeline/archetypes";
import { resolveServeRow } from "@/lib/data/lineage";
import { insertDraftVersion } from "@/lib/data/lineage";
import { runConsoleEdit } from "@/lib/pipeline/edit-pipeline";
import { upgradeForEdit } from "@/lib/domain/config-versions";
import { recordWorkflowChange, configHashOf } from "@/lib/data/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requireOwnerTenant();
    if (!guard.ok) return guard.response;
    const tenantId = guard.tenantId;

    const body = await req.json().catch(() => null);

    // 1. Resolve the id through the lineage serve rules (an old link edits the
    //    current head; a draft's own id edits that draft).
    const wf = await resolveServeRow(id);
    if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (wf.tenantId !== tenantId) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

    const cfg = wf.config as Record<string, unknown>;
    const archetype = cfg?.archetype as ArchetypeId | undefined;
    let base = cfg?.archetypeConfig as Record<string, unknown> | undefined;
    if (!archetype || !base) {
      return NextResponse.json({ error: "Workflow has no archetype console to edit" }, { status: 400 });
    }

    // A5: walk an old config forward to the current shape before editing, so
    // today's schema constraints can never strand yesterday's rows.
    const up = upgradeForEdit(archetype, base, (wf.configVersion as number) || 1);
    if (!up.ok) {
      await recordWorkflowChange({
        tenantId: wf.tenantId,
        lineageId: wf.lineageId,
        fromVersion: wf.schemaVersion,
        kind: "edit",
        actor: "owner",
        summary: "edit blocked: config upgrade failed schema",
        configHash: configHashOf(base),
      });
      return NextResponse.json({ error: "Stored config predates the current schema and failed automatic upgrade" }, { status: 409 });
    }
    base = up.config;

    // 2. Shared deterministic pipeline: patch/chat → cascades → schema →
    //    reassemble → gates. The model never touches code in here.
    const outcome = await runConsoleEdit({
      archetype,
      base,
      patch: body?.patch ?? null,
      chatEdit: typeof body?.chatEdit === "string" ? body.chatEdit : null,
    });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    if (!outcome.changed) {
      await recordWorkflowChange({
        tenantId: wf.tenantId,
        lineageId: wf.lineageId,
        fromVersion: wf.schemaVersion,
        kind: "edit",
        actor: "owner",
        summary: `no-op edit: ${outcome.summary}`,
        configHash: configHashOf(base),
      });
      return NextResponse.json({ success: true, changed: false, summary: outcome.summary, workflowId: wf.id, version: wf.schemaVersion });
    }

    // 3. Persist as a new DRAFT on the same lineage. No deactivation here —
    //    the live head keeps serving until the owner activates the draft.
    const { newId, version } = await insertDraftVersion({
      wf,
      config: { ...cfg, archetypeConfig: outcome.config },
      html: outcome.html,
      summary: outcome.summary,
    });

    // A7: audit the change (never blocks the edit).
    void recordWorkflowChange({
      tenantId: wf.tenantId,
      lineageId: wf.lineageId,
      fromVersion: wf.schemaVersion,
      toVersion: version,
      fromWorkflowId: wf.id,
      toWorkflowId: newId,
      kind: typeof body?.chatEdit === "string" && body.chatEdit.trim() ? "chat" : "edit",
      actor: "owner",
      summary: outcome.summary,
      patch: body?.patch ?? null,
      configHash: configHashOf(outcome.config),
    });

    return NextResponse.json({
      success: true,
      workflowId: newId,
      previousWorkflowId: wf.id,
      version,
      status: "draft",
      summary: outcome.summary,
      cascaded: outcome.cascaded,
      previewUrl: `/app/${newId}`,
      activateUrl: `/api/workflow/${newId}/activate`,
    });
  } catch (e: unknown) {
    console.error("[workflow/edit]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
