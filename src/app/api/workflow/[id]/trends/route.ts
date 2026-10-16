// Trends — GET /api/workflow/[id]/trends
//
// Week-over-week KPIs for one console, derived PURELY from the event ledger
// (the archetype's own translator per IST day, latest snapshot wins per day).
// Lineage-scoped: trends survive edits and version swaps like every other
// read. Owner-only. Zero LLM, one query.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, workflows } from "@/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { requireOwnerTenant } from "@/lib/auth/auth";
import { resolveServeRow } from "@/lib/data/lineage";
import { computeConsoleTrend } from "@/lib/domain/trends";
import type { ArchetypeId } from "@/lib/pipeline/archetypes";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requireOwnerTenant();
    if (!guard.ok) return guard.response;
    const tenantId = guard.tenantId;

    const serve = await resolveServeRow(id);
    if (!serve) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (serve.tenantId !== tenantId) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

    const cfg = serve.config as Record<string, unknown>;
    const archetype = (cfg?.archetype as ArchetypeId | undefined) ?? null;
    if (!archetype) return NextResponse.json({ error: "Trends are only available for archetype consoles" }, { status: 400 });

    const lineageId = serve.lineageId ?? serve.id;
    const members = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.lineageId, lineageId));
    const memberIds = members.map((m) => m.id);

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const snaps = await db
      .select({ createdAt: events.createdAt, payload: events.payload })
      .from(events)
      .where(
        and(
          memberIds.length ? inArray(events.workflowId, memberIds) : eq(events.workflowId, serve.id),
          eq(events.status, "confirmed"),
          gte(events.createdAt, since),
        ),
      )
      .orderBy(events.createdAt);

    const trend = computeConsoleTrend(
      archetype,
      (cfg?.archetypeConfig as Record<string, unknown>) ?? null,
      snaps.map((s) => ({ createdAt: s.createdAt, payload: (s.payload ?? null) as Record<string, unknown> | null })),
    );

    return NextResponse.json({ success: true, archetype, ...trend });
  } catch (e) {
    console.error("[workflow/trends]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
