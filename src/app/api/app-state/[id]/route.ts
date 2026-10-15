import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, workflows } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getAppAccess } from "@/lib/infra/app-auth";

// Read path for the app tier: the latest confirmed event for the id's LINEAGE
// is the current console state (append-only ledger replaying its newest
// snapshot). Lineage-scoped, not row-scoped, so live data follows the console
// through owner edits, restores, and preview→activate swaps. Returns a flat
// records array the artifact can rehydrate on boot.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Resolve the lineage: the row itself (legacy rows may have lineageId
    // unset — fall back to their own id, the one-shot convention).
    const wfRows = await db.select({ lineageId: workflows.lineageId, tenantId: workflows.tenantId }).from(workflows).where(eq(workflows.id, id)).limit(1);
    if (!wfRows.length) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

    // Live console data is tenant-private: verified owner/staff session only.
    const session = await getAppAccess(wfRows[0].tenantId);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const lineageId = wfRows[0].lineageId ?? id;

    const lineageMembers = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.lineageId, lineageId));
    const memberIds = lineageMembers.map((r) => r.id);
    if (!memberIds.includes(id)) memberIds.push(id);

    const latest = await db
      .select()
      .from(events)
      .where(and(inArray(events.workflowId, memberIds), eq(events.status, "confirmed")))
      .orderBy(desc(events.createdAt))
      .limit(1);

    if (latest.length === 0) {
      return NextResponse.json({ success: true, records: [], savedAt: null, filledBy: null });
    }

    const payload = (latest[0].payload ?? {}) as Record<string, unknown>;
    let records: unknown[] = [];

    if (Array.isArray(payload.records)) {
      // V2 cube payload — already flat records.
      records = payload.records;
    } else if (Array.isArray(payload.grid)) {
      // V1 legacy grid — one spread record per row { row, label, [colKey]: val }.
      records = payload.grid;
    } else if (Array.isArray(payload.list)) {
      // V1 legacy list — [{ key, label, value }] → single record.
      const rec: Record<string, unknown> = {};
      for (const item of payload.list as { key?: string; value?: unknown }[]) {
        if (item?.key) rec[item.key] = item.value;
      }
      records = [rec];
    }

    return NextResponse.json({
      success: true,
      records,
      savedAt: latest[0].createdAt,
      filledBy: latest[0].filledBy,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load app state" }, { status: 500 });
  }
}
