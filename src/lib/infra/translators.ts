// Archetype translators — the readable bridge over the generic records ledger.
//
// The platform stores every console's state as generic record snapshots in the
// append-only events ledger. Surfaces like the nightly digest need FACTS, not
// rows ("Srimathi missed 20DDay", "till dipped below ₹5,000"). This module is
// that bridge: one pure, deterministic function per archetype.
//
// Doctrine: no new archetype ships without its translator — same as no
// archetype ships without behavioral tests. The record shapes below mirror
// each assembler's buildRecords() exactly; keep them in lockstep.

import type { ArchetypeId } from "./archetypes";

export interface TranslatedFacts {
  /** Human-readable summary lines (one per fact worth saying). */
  lines: string[];
  /** Alert lines — only for conditions the archetype considers noteworthy. */
  alerts: string[];
  /** Key metrics for structured consumers (WhatsApp template, dashboards). */
  stats: Record<string, string | number>;
}

const fmt = (n: number): string => n.toLocaleString("en-IN");

// ── Archetype #2: Target Board ─────────────────────────────────────────────
// records: [{ employee, report_date, [metricKey]: number }]
// config:  { metrics: [{ key, label, target }], people: [{ name }] }
export function translateTargetBoard(records: Record<string, unknown>[], config: Record<string, unknown> | null): TranslatedFacts {
  const metrics = (config?.metrics as { key: string; label: string; target: number }[] | undefined) ?? [];
  const lines: string[] = [];
  const alerts: string[] = [];
  let onTarget = 0, totalCells = 0;

  for (const rec of records) {
    const who = String(rec.employee ?? "Unknown");
    const hits: string[] = [];
    const misses: string[] = [];
    for (const m of metrics) {
      const raw = rec[m.key];
      if (raw === undefined || raw === null) continue;
      totalCells++;
      const v = Number(raw);
      if (v >= m.target) { onTarget++; hits.push(`${m.label} ${v}/${m.target}`); }
      else { misses.push(`${m.label} ${v}/${m.target}`); } // reported-but-zero counts as a miss
    }
    if (hits.length) lines.push(`${who} hit ${hits.join(", ")}`);
    if (misses.length) lines.push(`${who} reported ${misses.join(", ")}`);
    if (metrics.length && misses.length && !hits.length) alerts.push(`${who} missed all ${metrics.length} targets`);
  }

  const pct = totalCells ? Math.round(100 * onTarget / totalCells) : 0;
  return { lines, alerts, stats: { onTarget, totalCells, achievementPct: pct } };
}

// ── Archetype #3: Pipeline ─────────────────────────────────────────────────
// records: [{ title, stage, owner, days_in_stage }]
// config:  { slaDays: number, stages: [{ label }] }
export function translatePipeline(records: Record<string, unknown>[], config: Record<string, unknown> | null): TranslatedFacts {
  const sla = Number(config?.slaDays ?? 7);
  const lines: string[] = [];
  const alerts: string[] = [];
  const byStage = new Map<string, number>();
  let breached = 0;

  for (const rec of records) {
    const stage = String(rec.stage ?? "Unknown");
    byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
    const days = Number(rec.days_in_stage ?? 0);
    if (days > sla) {
      breached++;
      if (breached <= 3) alerts.push(`${rec.title} stuck ${days}d in ${stage} (SLA ${sla}d)`);
    }
  }

  const flow = [...byStage.entries()].map(([s, n]) => `${s}: ${n}`).join(" · ");
  if (flow) lines.push(`Cards by stage — ${flow}`);
  if (breached > 3) alerts.push(`${breached} cards breached SLA in total`);
  if (records.length) {
    const oldest = records.reduce((a, b) => (Number(a.days_in_stage ?? 0) >= Number(b.days_in_stage ?? 0) ? a : b));
    lines.push(`Longest resident: ${oldest.title} (${oldest.days_in_stage}d in ${oldest.stage})`);
  }
  return { lines, alerts, stats: { total: records.length, breached } };
}

// ── Archetype #4: Ledger ───────────────────────────────────────────────────
// records: [{ day, label, type, account, amount, balance_after }]
// config:  { lowBalanceThreshold: number }
export function translateLedger(records: Record<string, unknown>[], config: Record<string, unknown> | null): TranslatedFacts {
  const threshold = Number(config?.lowBalanceThreshold ?? 0);
  const lines: string[] = [];
  const alerts: string[] = [];

  let tin = 0, tout = 0, dipped = false, finalBal = 0;
  for (const rec of records) {
    const amt = Number(rec.amount ?? 0);
    if (amt > 0) tin += amt; else tout += Math.abs(amt);
    const bal = Number(rec.balance_after ?? 0);
    finalBal = bal;
    if (threshold > 0 && bal < threshold) dipped = true;
  }

  lines.push(`In ${fmt(tin)} · Out ${fmt(tout)} · Closing balance ${fmt(finalBal)}`);
  if (threshold > 0 && dipped) alerts.push(`Balance dipped below the ${fmt(threshold)} safety line today`);
  return { lines, alerts, stats: { moneyIn: tin, moneyOut: tout, closingBalance: finalBal, dippedBelowThreshold: dipped ? 1 : 0 } };
}

// ── Archetype #5: Temporal ─────────────────────────────────────────────────
// records: [{ slot, resource, purpose }]
// config:  { resources: [{ name }], slots: [string] }
export function translateTemporal(records: Record<string, unknown>[], config: Record<string, unknown> | null): TranslatedFacts {
  const resources = (config?.resources as { name: string }[] | undefined) ?? [];
  const slots = (config?.slots as string[] | undefined) ?? [];
  const lines: string[] = [];
  const alerts: string[] = [];

  const total = resources.length * slots.length;
  const filled = records.length;
  const util = total ? Math.round(100 * filled / total) : 0;
  lines.push(`${filled} of ${total} slots booked (${util}% utilization)`);

  // Double-bookings: same resource + same slot appearing more than once.
  const seen = new Map<string, number>();
  for (const rec of records) {
    const k = `${rec.resource}|${rec.slot}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  let conflicts = 0;
  for (const [k, n] of seen) {
    if (n > 1) {
      conflicts += n - 1;
      const [resource, slot] = k.split("|");
      if (conflicts <= 3) alerts.push(`Double-booked: ${resource} at ${slot} (${n} bookings)`);
    }
  }
  if (conflicts > 3) alerts.push(`${conflicts} double-bookings in total`);
  return { lines, alerts, stats: { booked: filled, total, utilizationPct: util, conflicts } };
}

// ── Archetype #6: Fleet ────────────────────────────────────────────────────
// records: [{ name, status, owner, reading, service_state }]
// config:  unused — service verdicts ride in each record.
export function translateFleet(records: Record<string, unknown>[]): TranslatedFacts {
  const lines: string[] = [];
  const alerts: string[] = [];
  const byStatus = new Map<string, number>();
  let due = 0;

  for (const rec of records) {
    const st = String(rec.status ?? "Unknown");
    byStatus.set(st, (byStatus.get(st) ?? 0) + 1);
    if (rec.service_state === "svc-due") {
      due++;
      if (due <= 3) alerts.push(`${rec.name} due for service (${rec.reading != null ? fmt(Number(rec.reading)) : "meter n/a"})`);
    }
  }
  if (due > 3) alerts.push(`${due} assets due for service in total`);

  const mix = [...byStatus.entries()].map(([s, n]) => `${s}: ${n}`).join(" · ");
  if (mix) lines.push(`Fleet status — ${mix}`);
  return { lines, alerts, stats: { assets: records.length, serviceDue: due } };
}

// ── Archetype #7: Queue ──────────────────────────────────────────────────
// records: [{ token, purpose, counter, status }] (status: done | serving | waiting)
export function translateQueue(records: Record<string, unknown>[]): TranslatedFacts {
  const lines: string[] = [];
  const alerts: string[] = [];
  let done = 0, serving = 0, waiting = 0;
  const byCounter = new Map<string, number>();

  for (const rec of records) {
    const s = String(rec.status ?? "waiting");
    if (s === "done") done++;
    else if (s === "serving") serving++;
    else waiting++;
    const c = String(rec.counter ?? "—");
    byCounter.set(c, (byCounter.get(c) ?? 0) + 1);
  }

  lines.push(`${done} served · ${serving} at counter · ${waiting} waiting`);
  const busiest = [...byCounter.entries()].sort((a, b) => b[1] - a[1])[0];
  if (busiest && busiest[1] >= 3) lines.push(`Busiest counter: ${busiest[0]} (${busiest[1]} tokens)`);
  if (waiting > 8) alerts.push(`${waiting} people waiting — counters are behind`);
  return { lines, alerts, stats: { served: done, serving, waiting, counters: byCounter.size } };
}

// ── Archetype #8: Checklist ──────────────────────────────────────────────
// records: [{ round, check, assigned_to, passed }] (passed: 0 | 1)
export function translateChecklist(records: Record<string, unknown>[]): TranslatedFacts {
  const lines: string[] = [];
  const alerts: string[] = [];
  let pass = 0, fail = 0;
  const byPerson = new Map<string, { pass: number; fail: number }>();

  for (const rec of records) {
    const ok = Number(rec.passed ?? 0) === 1;
    ok ? pass++ : fail++;
    const who = String(rec.assigned_to ?? "Owner");
    const row = byPerson.get(who) ?? { pass: 0, fail: 0 };
    ok ? row.pass++ : row.fail++;
    byPerson.set(who, row);
  }

  const total = pass + fail;
  const pct = total ? Math.round(100 * pass / total) : 0;
  lines.push(`Round pass rate ${pct}% (${pass}/${total} checks passed)`);
  for (const [who, r] of byPerson) {
    if (r.fail > 0) alerts.push(`${who} missed ${r.fail} check${r.fail > 1 ? "s" : ""}`);
  }
  return { lines, alerts, stats: { passed: pass, failed: fail, passRatePct: pct } };
}

// ── Archetype #9: Roster ─────────────────────────────────────────────────
// records: [{ name, rate, today_status, month_units }] (today_status: full | half | absent)
export function translateRoster(records: Record<string, unknown>[], config: Record<string, unknown> | null): TranslatedFacts {
  const lines: string[] = [];
  const alerts: string[] = [];
  let full = 0, half = 0, absent = 0, monthPay = 0;

  for (const rec of records) {
    const st = String(rec.today_status ?? "full");
    if (st === "full") full++;
    else if (st === "half") half++;
    else absent++;
    monthPay += Number(rec.rate ?? 0) * Number(rec.month_units ?? 0);
  }

  lines.push(`${full} full · ${half} half · ${absent} absent — month tally ₹${fmt(monthPay)}`);
  if (absent > 0) alerts.push(`${absent} worker${absent > 1 ? "s" : ""} absent today`);
  return { lines, alerts, stats: { full, half, absent, monthPay } };
}

// ── Archetype #10: Calendar ──────────────────────────────────────────────
// records: [{ kind: 'event' | 'renewal', title, day, detail }]
export function translateCalendar(records: Record<string, unknown>[]): TranslatedFacts {
  const lines: string[] = [];
  const alerts: string[] = [];
  let events = 0, renewals = 0;

  for (const rec of records) {
    if (rec.kind === "renewal") {
      renewals++;
      // day is stored console-side as "in N days" / "in -N days" — extract the number.
      const m = /-?\d+/.exec(String(rec.day ?? ""));
      const dd = m ? parseInt(m[0], 10) : NaN;
      if (Number.isFinite(dd) && dd < 0) alerts.push(`${rec.title} overdue by ${-dd} day${dd < -1 ? "s" : ""}`);
      else if (Number.isFinite(dd) && dd <= 7) alerts.push(`${rec.title} due in ${dd} day${dd === 1 ? "" : "s"}`);
    } else {
      events++;
    }
  }

  lines.push(`${events} events this week · ${renewals} renewals tracked`);
  return { lines, alerts, stats: { events, renewals } };
}

// ── Archetype #1: Spatial ──────────────────────────────────────────────────
// records: [{ [groupLabel+"_id"]: number, slot_no: number, [fieldKey]: value, [qtyKey]: number }]
// config:  { groupLabel, countLabel, fields: [{ key, label }], qtyField?: { key, label, ... } }
export function translateSpatial(records: Record<string, unknown>[], config: Record<string, unknown> | null): TranslatedFacts {
  const groupLabel = String(config?.groupLabel ?? "group").toLowerCase();
  const groupKey = `${groupLabel}_id`;
  const qtyKey = (config?.qtyField as { key: string } | undefined)?.key;
  const lines: string[] = [];
  const alerts: string[] = [];

  let totalSlots = 0, filledSlots = 0, totalQty = 0;
  for (const rec of records) {
    totalSlots++;
    let hasContent = false;
    for (const [k, v] of Object.entries(rec)) {
      if (k === groupKey || k === "slot_no") continue;
      if (k === qtyKey) { totalQty += Number(v) || 0; if (Number(v) > 0) hasContent = true; continue; }
      if (v !== "" && v != null) hasContent = true;
    }
    if (hasContent) filledSlots++;
  }
  const util = totalSlots ? Math.round(100 * filledSlots / totalSlots) : 0;
  lines.push(`${filledSlots}/${totalSlots} slots filled (${util}%)${qtyKey ? ` · ${fmt(totalQty)} units on hand` : ""}`);
  if (util >= 95) alerts.push(`Storage nearly full — ${util}% utilization`);
  return { lines, alerts, stats: { filledSlots, totalSlots, utilizationPct: util, totalQty } };
}

// ── Dispatcher ─────────────────────────────────────────────────────────────
export function translateRecords(
  archetype: ArchetypeId | string,
  records: Record<string, unknown>[],
  config: Record<string, unknown> | null,
): TranslatedFacts {
  const empty: TranslatedFacts = { lines: [], alerts: [], stats: {} };
  if (!Array.isArray(records) || records.length === 0) return empty;
  switch (archetype) {
    case "target-board": return translateTargetBoard(records, config);
    case "pipeline": return translatePipeline(records, config);
    case "ledger": return translateLedger(records, config);
    case "temporal": return translateTemporal(records, config);
    case "fleet": return translateFleet(records);
    case "spatial": return translateSpatial(records, config);
    case "queue": return translateQueue(records);
    case "checklist": return translateChecklist(records);
    case "roster": return translateRoster(records, config);
    case "calendar": return translateCalendar(records);
    default: return empty;
  }
}
