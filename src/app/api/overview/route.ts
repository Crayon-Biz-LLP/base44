// Overview — GET /api/overview
//
// The unified owner morning view, in one call (owner session required):
// every LIVE archetype console as one row — today's headline number, the
// week-over-week arrow (trends engine), freshness of the last staff sync,
// and "needs attention" reasons. Problems float to the top.
//
// Aggregate on purpose: ONE events query for the whole tenant (14-day window,
// confirmed only), then pure row composition — the dashboard never fans out
// per-console requests.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, workflows } from "@/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { getSessionTenantId } from "@/lib/infra/auth";
import { buildOverviewRow, sortOverviewRows } from "@/lib/domain/overview";
import { buildActivityFeed } from "@/lib/domain/activity-feed";
import type { ArchetypeId } from "@/lib/infra/archetypes";

export async function GET() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });

    const heads = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.tenantId, tenantId), eq(workflows.isActive, true)));
    const consoles = heads.filter((w) => (w.config as Record<string, unknown>)?.archetype);
    if (!consoles.length) {
      return NextResponse.json({ success: true, today: null, rows: [], totalSnapshots: 0 });
    }

    const memberIds = consoles.map((c) => c.id);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const snaps = await db
      .select({ workflowId: events.workflowId, createdAt: events.createdAt, payload: events.payload, filledBy: events.filledBy })
      .from(events)
      .where(and(inArray(events.workflowId, memberIds), eq(events.status, "confirmed"), gte(events.createdAt, since)))
      .orderBy(events.createdAt);

    const titleOf = new Map(consoles.map((c) => [c.id, String((c.config as Record<string, unknown>)?.title ?? (c.config as Record<string, unknown>)?.productName ?? "")]));
    const archOf = new Map(consoles.map((c) => [c.id, String((c.config as Record<string, unknown>)?.archetype ?? "")]));
    const feed = buildActivityFeed(
      snaps.map((s) => ({
        workflowId: s.workflowId,
        consoleTitle: titleOf.get(s.workflowId) ?? "",
        archetype: archOf.get(s.workflowId) ?? "",
        filledBy: s.filledBy,
        createdAt: s.createdAt,
        payload: (s.payload ?? null) as Record<string, unknown> | null,
      })),
    );

    const rows = consoles.map((c) => {
      const cfg = c.config as Record<string, unknown>;
      return buildOverviewRow({
        id: c.id,
        title: String(cfg.title ?? cfg.productName ?? ""),
        archetype: cfg.archetype as ArchetypeId,
        config: (cfg.archetypeConfig as Record<string, unknown>) ?? null,
        snapshots: snaps
          .filter((s) => s.workflowId === c.id)
          .map((s) => ({ createdAt: s.createdAt, payload: (s.payload ?? null) as Record<string, unknown> | null })),
      });
    });

    return NextResponse.json({
      success: true,
      today: new Date().toISOString(),
      rows: sortOverviewRows(rows),
      feed,
      totalSnapshots: snaps.length,
    });
  } catch (e) {
    console.error("[overview]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
