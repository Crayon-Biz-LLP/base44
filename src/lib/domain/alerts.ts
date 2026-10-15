// Alert brain (A: reflexes). PURE and DETERMINISTIC: trends + translator
// alerts in, alert decisions out. No model, no DB — the cron composes this
// with the ledger and the channels.
//
// Rules, with hysteresis (no flapping):
//   headline-drop — this week's headline fell below DROP_PCT% of last week's
//   headline-spike — this week jumped above +SPIKE_PCT% of last week's
//   translator-alerts — the archetype's own per-day warnings, surfaced once
//                       per quiet period, not once per hour
//
// Hysteresis: an alert stays QUIET while its condition holds (reminded every
// QUIET_HOURS), re-arms only after a full recovery below the RECOVER threshold.
import type { ConsoleTrend, TrendHeadline } from "./trends";

export const DROP_PCT = 40; // −40% or worse fires
export const RECOVER_PCT = 15; // must climb back within −15% to re-arm
export const SPIKE_PCT = 60; // +60% or better is worth saying too
export const QUIET_HOURS = 20; // re-remind at most every 20h while condition holds

export type Severity = "info" | "warn" | "critical";

export interface AlertDecision {
  rule: string; // 'headline-drop' | 'headline-spike' | 'translator-alerts'
  severity: Severity;
  message: string; // human line, WhatsApp/email ready
}

export interface QuietState {
  // Per (lineageId|rule): last time this rule FIRED, and whether the
  // condition was considered recovered since.
  firedAt?: string | null; // ISO
  recovered?: boolean; // true → re-armed
}

/** Should the rule fire right now? Pure hysteresis math. */
export function shouldFire(
  opts: {
    conditionHolds: boolean;
    lastState?: QuietState | null;
    now?: Date;
  },
): { fire: boolean; reason: "first" | "re-armed" | "remind" | "inside-quiet" | "recovered-silence" } {
  const now = opts.now ?? new Date();
  const st = opts.lastState ?? {};
  if (!opts.conditionHolds) {
    // No condition → this call is itself a recovery observation; the caller
    // persists recovered=true when conditionHolds turns false.
    return { fire: false, reason: st.firedAt ? "recovered-silence" : "inside-quiet" };
  }
  if (!st.firedAt) return { fire: true, reason: "first" };
  if (st.recovered) return { fire: true, reason: "re-armed" };
  const elapsedH = (now.getTime() - new Date(st.firedAt).getTime()) / 3_600_000;
  return elapsedH >= QUIET_HOURS ? { fire: true, reason: "remind" } : { fire: false, reason: "inside-quiet" };
}

/** The headline delta rendered the way an owner reads it. */
function deltaLine(h: TrendHeadline): string {
  const fmt = (n: number) => n.toLocaleString("en-IN");
  const cmp = h.lastWeek > 0 ? ` (was ${fmt(h.lastWeek)})` : "";
  const pct = h.deltaPct === null ? "" : ` ${h.deltaPct > 0 ? "+" : ""}${h.deltaPct}%`;
  return `${h.label}: ${fmt(h.thisWeek)}${pct}${cmp}`;
}

/** Compute alerts for ONE console lineage from its trend + today's facts. */
export function computeAlerts(opts: {
  lineageId: string;
  consoleTitle: string;
  trend: ConsoleTrend;
  todayAlerts: string[]; // translator alerts from today's snapshot
  states: Record<string, QuietState>; // rule → quiet state
  now?: Date;
}): { decisions: AlertDecision[]; nextStates: Record<string, QuietState> } {
  const { lineageId, trend, states } = opts;
  const now = opts.now ?? new Date();
  const nextStates: Record<string, QuietState> = { ...states };
  const decisions: AlertDecision[] = [];
  const h = trend.headlines[0];
  const iso = now.toISOString();

  const remember = (rule: string, condHolds: boolean, fired: boolean) => {
    const st = states[rule] ?? {};
    if (fired) nextStates[rule] = { firedAt: iso, recovered: false };
    else if (!condHolds && st.firedAt) nextStates[rule] = { firedAt: st.firedAt, recovered: true };
    else if (st.firedAt) nextStates[rule] = st; // unchanged
  };

  if (h && trend.hasData) {
    // Drop rule: needs a real prior week; ≥7 days of history makes the delta
    // comparable; deltaPct is null on cold start (never alarm on day one).
    const comparable = h.lastWeek > 0 && trend.days.length >= 7;
    const dropHolds = comparable && h.deltaPct !== null && h.deltaPct <= -DROP_PCT;
    const recovered = comparable && h.deltaPct !== null && h.deltaPct > -RECOVER_PCT;
    const d = shouldFire({ conditionHolds: dropHolds, lastState: states["headline-drop"], now });
    if (d.fire) {
      decisions.push({
        rule: "headline-drop",
        severity: "critical",
        message: `📉 ${opts.consoleTitle}: ${deltaLine(h)} — down ${Math.abs(h.deltaPct ?? 0)}% vs last week. Worth a look today.`,
      });
    }
    remember("headline-drop", dropHolds, d.fire);
    // If the condition recovered, say so once (positive feedback loop).
    if (!dropHolds && states["headline-drop"]?.firedAt && !states["headline-drop"]?.recovered && recovered) {
      decisions.push({
        rule: "headline-drop",
        severity: "info",
        message: `✅ ${opts.consoleTitle}: ${deltaLine(h)} — recovered.`,
      });
    }

    // Spike rule: growth worth surfacing (positive version of the same math).
    const spikeHolds = comparable && h.deltaPct !== null && h.deltaPct >= SPIKE_PCT;
    const d2 = shouldFire({ conditionHolds: spikeHolds, lastState: states["headline-spike"], now });
    if (d2.fire) {
      decisions.push({
        rule: "headline-spike",
        severity: "info",
        message: `📈 ${opts.consoleTitle}: ${deltaLine(h)} — up ${Math.abs(h.deltaPct ?? 0)}% vs last week.`,
      });
    }
    remember("headline-spike", spikeHolds, d2.fire);
  }

  // Translator alerts: archetype's own warnings (stock low, renewal overdue…),
  // surfaced once per quiet period, never alarm-per-hour.
  if (opts.todayAlerts.length) {
    const d3 = shouldFire({ conditionHolds: true, lastState: states["translator-alerts"], now });
    if (d3.fire) {
      decisions.push({
        rule: "translator-alerts",
        severity: "warn",
        message: `⚠️ ${opts.consoleTitle}: ${opts.todayAlerts.slice(0, 4).join(" · ")}`,
      });
    }
    remember("translator-alerts", Boolean(opts.todayAlerts.length), d3.fire);
  }

  return { decisions, nextStates };
}
