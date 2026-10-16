// Alert state + log persistence (the hysteresis memory's store).
import { db } from "@/db";
import { alertLog, alertState } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { QuietState } from "@/lib/domain/alerts";

/** Load hysteresis states for one tenant, keyed "lineageId|rule". */
export async function loadAlertStates(tenantId: string, lineageIds: string[]): Promise<Record<string, QuietState>> {
  if (!lineageIds.length) return {};
  const rows = await db
    .select()
    .from(alertState)
    .where(and(eq(alertState.tenantId, tenantId), inArray(alertState.lineageId, lineageIds)));
  const out: Record<string, QuietState> = {};
  for (const r of rows) out[`${r.lineageId}|${r.rule}`] = { firedAt: r.firedAt?.toISOString() ?? null, recovered: r.recovered };
  return out;
}

/** Persist next states (upsert per lineage+rule; deletions are unnecessary — rows without condition simply stay recovered). */
export async function saveAlertStates(
  tenantId: string,
  entries: { lineageId: string; rule: string; state: QuietState }[],
): Promise<void> {
  for (const e of entries) {
    if (!e.state) continue; // defensive: a null state is "no memory", not a row
    const values = {
      tenantId,
      lineageId: e.lineageId,
      rule: e.rule,
      firedAt: e.state.firedAt ? new Date(e.state.firedAt) : null,
      recovered: e.state.recovered ?? false,
    };
    await db
      .insert(alertState)
      .values(values)
      .onConflictDoUpdate({
        target: [alertState.tenantId, alertState.lineageId, alertState.rule],
        set: { firedAt: values.firedAt, recovered: values.recovered },
      });
  }
}

/** Append dispatched/skipped alerts to the audit log. Never throws. */
export async function logAlerts(
  rows: {
    tenantId: string;
    lineageId: string | null;
    rule: string;
    severity: string;
    message: string;
    channels: string[];
    status: string;
    detail?: unknown;
  }[],
): Promise<void> {
  if (!rows.length) return;
  try {
    await db.insert(alertLog).values(
      rows.map((r) => ({
        tenantId: r.tenantId,
        lineageId: r.lineageId,
        rule: r.rule,
        severity: r.severity,
        message: r.message,
        channels: r.channels,
        status: r.status,
        detail: (r.detail ?? null) as typeof alertLog.$inferInsert.detail,
      })),
    );
  } catch (e) {
    console.error("[alert-store] logAlerts failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}
