// Console trends (the memory layer). Consoles are today-scoped; the event
// ledger remembers every day. This module turns stored snapshots into
// week-over-week KPIs — PURE and DETERMINISTIC: same events in, same trend
// out. No model anywhere.
//
//   day facts — the archetype's own translator over each day's LAST snapshot
//               (latest write wins, matching console semantics)
//   headline  — the one number this archetype lives by (moneyIn, served,
//               passRatePct, utilizationPct…), this week vs last week
//   line      — one line per day, for the console's sparkline strip
//
// Doctrine: no new archetype ships without its translator — trends inherit
// whatever the translator chooses to say.
import { translateRecords } from "../pipeline/translators";
import type { ArchetypeId } from "../pipeline/archetypes";

export interface DayFact {
  day: string; // YYYY-MM-DD (IST)
  stats: Record<string, string | number>;
  lines: string[];
  alerts: string[];
}

export interface TrendHeadline {
  key: string;
  label: string;
  thisWeek: number;
  lastWeek: number;
  deltaPct: number | null; // null when lastWeek is 0 — nothing to compare
  direction: "up" | "down" | "flat";
}

export interface ConsoleTrend {
  days: DayFact[]; // oldest → newest, 14 days max
  headlines: TrendHeadline[];
  hasData: boolean; // false → the strip hides
  totalEvents: number; // snapshots aggregated
  line: string[]; // first fact line per day
}

/** The one number each archetype lives by, read from translator stats. */
const HEADLINE_MAP: Partial<Record<ArchetypeId, { key: string; label: string }>> = {
  ledger: { key: "moneyIn", label: "Money in / week" },
  queue: { key: "served", label: "People served / week" },
  checklist: { key: "passed", label: "Checks passed / week" },
  roster: { key: "monthPay", label: "Month tally trend" },
  temporal: { key: "utilizationPct", label: "Utilization %" },
  spatial: { key: "utilizationPct", label: "Storage utilization %" },
  "target-board": { key: "achievementPct", label: "On-target %" },
  pipeline: { key: "breached", label: "SLA breaches / week" },
  fleet: { key: "serviceDue", label: "Assets due / week" },
  calendar: { key: "renewals", label: "Renewals tracked" },
};

function headSpec(archetype: string): { key: string; label: string } {
  return HEADLINE_MAP[archetype as ArchetypeId] ?? { key: "total", label: "Activity / week" };
}

/** IST calendar day (YYYY-MM-DD) for a timestamp. */
export function istDay(ts: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(ts);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Same payload-shape logic as app-state (records / grid / list). */
function extractRecords(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload.records)) return payload.records as Record<string, unknown>[];
  if (Array.isArray(payload.grid)) return payload.grid as Record<string, unknown>[];
  if (Array.isArray(payload.list)) {
    const rec: Record<string, unknown> = {};
    for (const item of payload.list as { key?: string; value?: unknown }[]) {
      if (item?.key) rec[item.key] = item.value;
    }
    return [rec];
  }
  return [];
}

/**
 * Pure aggregation: group snapshots by IST day, keep the LAST per day
 * (latest write wins — the console's own semantics), translate each day
 * through the archetype's translator, then compare last 7 days vs the 7
 * before on the archetype's headline metric.
 */
export function computeConsoleTrend(
  archetype: string,
  config: Record<string, unknown> | null,
  snapshots: { createdAt: Date; payload: Record<string, unknown> | null }[],
): ConsoleTrend {
  const byDay = new Map<string, { createdAt: Date; payload: Record<string, unknown> | null }>();
  for (const s of snapshots) {
    const day = istDay(s.createdAt);
    const prev = byDay.get(day);
    if (!prev || s.createdAt >= prev.createdAt) byDay.set(day, s);
  }

  const days: DayFact[] = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-14)
    .map(([day, snap]) => {
      const records = extractRecords(snap.payload);
      const facts = translateRecords(archetype, records, config);
      return { day, stats: facts.stats, lines: facts.lines, alerts: facts.alerts };
    });

  const headlines: TrendHeadline[] = [];
  if (days.length) {
    const spec = headSpec(archetype);
    const cut = Math.max(0, days.length - 7);
    const thisWeek = days.slice(cut);
    const lastWeek = days.slice(0, cut);
    const sum = (arr: DayFact[]) => arr.reduce((acc, d) => acc + num(d.stats[spec.key]), 0);
    const t = sum(thisWeek);
    const l = sum(lastWeek);
    headlines.push({
      key: spec.key,
      label: spec.label,
      thisWeek: Math.round(t * 10) / 10,
      lastWeek: Math.round(l * 10) / 10,
      deltaPct: l > 0 ? Math.round(((t - l) / l) * 100) : null,
      direction: t > l ? "up" : t < l ? "down" : "flat",
    });
  }

  const line = days.map((d) => d.lines[0]).filter((x): x is string => Boolean(x));
  return {
    days,
    headlines,
    hasData: days.length > 0,
    totalEvents: snapshots.length,
    line,
  };
}
