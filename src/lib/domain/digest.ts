// Engine digest math for "Tonight's Verdict" (/verdict) — deterministic,
// built only on events.verdict (engine-computed at submit time; no LLM math here).
// chron/digest keeps its own legacy payload-scanning aggregation for WhatsApp;
// keep this verdict-based path in sync with the event verdict shapes.

import { db } from "@/db";
import { events, workflows } from "@/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface IstDayWindow {
  startOfDay: Date;
  endOfDay: Date;
  startOfYesterday: Date;
  endOfYesterday: Date;
  istDay: string;
}

export function istDayWindow(now: Date = new Date()): IstDayWindow {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const istDay = ist.toISOString().slice(0, 10);
  const startOfIstDayUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const startOfDay = new Date(startOfIstDayUtc - IST_OFFSET_MS);
  return {
    startOfDay,
    endOfDay: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1),
    startOfYesterday: new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000),
    endOfYesterday: new Date(startOfDay.getTime() - 1),
    istDay,
  };
}

interface EventRow {
  id: string;
  workflowId: string;
  filledBy: string | null;
  verdict: unknown;
  createdAt: Date;
}

interface VerdictShape {
  type?: string;
  lineCount?: number;
  summary?: string;
  coverage?: { percent?: number; slotsFilled?: number; slotsTotal?: number };
  money?: { total?: number; currency?: string };
}

function asVerdict(v: unknown): VerdictShape | null {
  return v && typeof v === "object" ? (v as VerdictShape) : null;
}

export interface AppSummary {
  workflowId: string;
  title: string;
  captureCount: number;
  moneyTotal: number | null;
  coveragePercent: number | null;
  coverageFilled: number | null;
  coverageTotal: number | null;
  eventIds: string[];
}

export interface StaffRow {
  name: string;
  todayPct: number;
  prevPct: number | null;
}

export interface TenantDigest {
  salesTotal: number;
  appSummaries: AppSummary[];
  leaderboard: StaffRow[];
  missedTargets: string[];
  istDay: string;
}

async function fetchWindow(tenantId: string, start: Date, end: Date): Promise<EventRow[]> {
  return (await db
    .select({ id: events.id, workflowId: events.workflowId, filledBy: events.filledBy, verdict: events.verdict, createdAt: events.createdAt })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), gte(events.createdAt, start), lte(events.createdAt, end)))) as unknown as EventRow[];
}

export async function computeTenantDigest(tenantId: string, window: IstDayWindow): Promise<TenantDigest> {
  const [dailyRows, yesterdayRows, wfRows] = await Promise.all([
    fetchWindow(tenantId, window.startOfDay, window.endOfDay),
    fetchWindow(tenantId, window.startOfYesterday, window.endOfYesterday),
    db.select({ id: workflows.id, config: workflows.config }).from(workflows).where(eq(workflows.tenantId, tenantId)),
  ]);

  const titleByWorkflow = new Map<string, string>();
  for (const wf of wfRows) {
    const config = wf.config as Record<string, unknown> | undefined;
    titleByWorkflow.set(wf.id, typeof config?.title === "string" ? config.title : "Untitled app");
  }

  const moneyOf = (v: unknown): number => {
    const m = asVerdict(v)?.money?.total;
    return typeof m === "number" ? m : 0;
  };
  const coverageOf = (v: unknown): { percent: number; filled: number; total: number } | null => {
    const c = asVerdict(v)?.coverage;
    if (!c || typeof c.slotsTotal !== "number" || c.slotsTotal <= 0) return null;
    return { percent: c.percent ?? 0, filled: c.slotsFilled ?? 0, total: c.slotsTotal };
  };

  const salesTotal = dailyRows.reduce((sum, row) => sum + moneyOf(row.verdict), 0);

  // Per-app aggregation
  const byWorkflow = new Map<string, EventRow[]>();
  for (const row of dailyRows) {
    const list = byWorkflow.get(row.workflowId) ?? [];
    list.push(row);
    byWorkflow.set(row.workflowId, list);
  }
  const appSummaries: AppSummary[] = [...byWorkflow.entries()].map(([workflowId, rows]) => {
    const money = rows.reduce((s, r) => s + moneyOf(r.verdict), 0);
    const covs = rows.map((r) => coverageOf(r.verdict)).filter((c): c is NonNullable<typeof c> => c !== null);
    const filled = covs.reduce((s, c) => s + c.filled, 0);
    const total = covs.reduce((s, c) => s + c.total, 0);
    const hasMoney = rows.some((r) => asVerdict(r.verdict)?.money?.total !== undefined);
    return {
      workflowId,
      title: titleByWorkflow.get(workflowId) || "Untitled app",
      captureCount: rows.length,
      moneyTotal: hasMoney ? Math.round(money * 100) / 100 : null,
      coveragePercent: total > 0 ? Math.round((filled / total) * 100) : null,
      coverageFilled: total > 0 ? filled : null,
      coverageTotal: total > 0 ? total : null,
      eventIds: rows.map((r) => r.id),
    };
  });
  appSummaries.sort((a, b) => (b.moneyTotal ?? -1) - (a.moneyTotal ?? -1));

  // Staff capture-coverage leaderboard (per-filler today vs yesterday averages)
  const avgPct = (rows: EventRow[]): number | null => {
    const vals = rows
      .map((r) => coverageOf(r.verdict)?.percent)
      .filter((p): p is number => typeof p === "number" && Number.isFinite(p));
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };
  const dailyByFiller = new Map<string, EventRow[]>();
  for (const row of dailyRows) {
    if (!row.filledBy) continue;
    const list = dailyByFiller.get(row.filledBy) ?? [];
    list.push(row);
    dailyByFiller.set(row.filledBy, list);
  }
  const yesterdayByFiller = new Map<string, EventRow[]>();
  for (const row of yesterdayRows) {
    if (!row.filledBy) continue;
    const list = yesterdayByFiller.get(row.filledBy) ?? [];
    list.push(row);
    yesterdayByFiller.set(row.filledBy, list);
  }
  const leaderboard: StaffRow[] = [...dailyByFiller.keys()]
    .map((name) => ({
      name,
      todayPct: Math.round((avgPct(dailyByFiller.get(name) ?? []) ?? 0) * 10) / 10,
      prevPct: (() => {
        const p = avgPct(yesterdayByFiller.get(name) ?? []);
        return p === null ? null : Math.round(p * 10) / 10;
      })(),
    }))
    .sort((a, b) => b.todayPct - a.todayPct);

  // Strict engine rule (matches vision): under 95% coverage is a red flag.
  const missedTargets: string[] = [];
  for (const app of appSummaries) {
    if (app.coveragePercent !== null && app.coveragePercent < 95) {
      missedTargets.push(`${app.title}: ${app.coverageFilled}/${app.coverageTotal} slots filled (${app.coveragePercent}%)`);
    }
  }

  return {
    salesTotal: Math.round(salesTotal * 100) / 100,
    appSummaries,
    leaderboard,
    missedTargets,
    istDay: window.istDay,
  };
}