// Owner overview — the morning view's brain. PURE: consoles + their event
// snapshots in, one honest row per console out. Composes the trends engine
// (headline, week-over-week delta) with the alert thresholds (needs attention
// = a condition holding right now, NOT whether a reminder was sent — the
// overview shows state, the cron shows news).
import { computeConsoleTrend, istDay } from "./trends";
import { DROP_PCT } from "./alerts";
import type { ArchetypeId } from "../infra/archetypes";

export interface OverviewRow {
  id: string;
  title: string;
  archetype: string;
  headline: { key: string; label: string } | null;
  today: number | null; // today's headline value (null = nothing synced today)
  thisWeek: number | null;
  lastWeek: number | null;
  deltaPct: number | null;
  direction: "up" | "down" | "flat" | null;
  lastSyncAt: string | null; // ISO
  syncedToday: boolean;
  minutesAgo: number | null;
  attention: { level: "critical" | "warn"; reasons: string[] } | null;
}

export function buildOverviewRow(opts: {
  id: string;
  title: string;
  archetype: ArchetypeId;
  config: Record<string, unknown> | null;
  snapshots: { createdAt: Date; payload: Record<string, unknown> | null }[];
  now?: Date;
}): OverviewRow {
  const now = opts.now ?? new Date();
  const trend = computeConsoleTrend(opts.archetype, opts.config, opts.snapshots);
  const h = trend.headlines[0] ?? null;

  const newestDay = trend.days[trend.days.length - 1];
  const todayStr = istDay(now);
  const today = newestDay && newestDay.day === todayStr ? Number(newestDay.stats[h?.key ?? ""] ?? 0) : null;
  const todayAlerts = newestDay?.day === todayStr ? newestDay.alerts : [];

  // Freshness from the newest snapshot of any kind.
  let lastSyncAt: string | null = null;
  let syncedToday = false;
  let minutesAgo: number | null = null;
  if (opts.snapshots.length) {
    const newest = opts.snapshots.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    lastSyncAt = newest.createdAt.toISOString();
    minutesAgo = Math.floor((now.getTime() - newest.createdAt.getTime()) / 60_000);
    syncedToday = istDay(newest.createdAt) === todayStr;
  }

  // Needs attention: conditions the alert brain would treat as alert-worthy,
  // evaluated on CURRENT state (never silenced here — this is a mirror).
  const reasons: { level: "critical" | "warn"; reason: string }[] = [];
  if (h && trend.days.length >= 7 && h.lastWeek > 0 && h.deltaPct !== null && h.deltaPct <= -DROP_PCT) {
    reasons.push({ level: "critical", reason: `${h.label} down ${Math.abs(h.deltaPct)}% vs last week` });
  }
  for (const a of todayAlerts.slice(0, 3)) reasons.push({ level: "warn", reason: a });

  const level = reasons.some((r) => r.level === "critical") ? "critical" : reasons.length ? "warn" : null;

  return {
    id: opts.id,
    title: opts.title,
    archetype: opts.archetype,
    headline: h ? { key: h.key, label: h.label } : null,
    today: today === null || !Number.isFinite(today) ? null : today,
    thisWeek: h ? h.thisWeek : null,
    lastWeek: h ? h.lastWeek : null,
    deltaPct: h ? h.deltaPct : null,
    direction: h ? h.direction : null,
    lastSyncAt,
    syncedToday,
    minutesAgo,
    attention: level ? { level, reasons: reasons.map((r) => r.reason) } : null,
  };
}

/** Dashboard order: problems first (critical > warn > healthy), then freshest sync. */
export function sortOverviewRows(rows: OverviewRow[]): OverviewRow[] {
  const rank = (r: OverviewRow) => (r.attention?.level === "critical" ? 0 : r.attention?.level === "warn" ? 1 : 2);
  return [...rows].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    const am = a.minutesAgo ?? Number.MAX_SAFE_INTEGER;
    const bm = b.minutesAgo ?? Number.MAX_SAFE_INTEGER;
    return am - bm; // fresher first within the same attention rank
  });
}
