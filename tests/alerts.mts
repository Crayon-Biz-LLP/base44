// Alert brain — pure rule + hysteresis verification. Zero LLM, zero DB.
// Run: npx tsx --test --test-force-exit tests/alerts.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAlerts, shouldFire, DROP_PCT, QUIET_HOURS } from "../src/lib/domain/alerts";
import type { ConsoleTrend, TrendHeadline } from "../src/lib/domain/trends";

function trend(deltaPct: number | null, opts: { lastWeek?: number; days?: number; thisWeek?: number } = {}): ConsoleTrend {
  const days = Math.max(opts.days ?? 14, 1);
  const lastWeek = opts.lastWeek ?? (deltaPct === null ? 0 : 100);
  const thisWeek = opts.thisWeek ?? (deltaPct === null ? 120 : Math.round(lastWeek * (1 + deltaPct / 100)));
  const h: TrendHeadline = {
    key: "moneyIn",
    label: "Money in / week",
    thisWeek,
    lastWeek,
    deltaPct,
    direction: thisWeek > lastWeek ? "up" : thisWeek < lastWeek ? "down" : "flat",
  };
  return {
    days: Array.from({ length: days }, (_, i) => ({
      day: `2026-09-${String(10 + i).padStart(2, "0")}`,
      stats: { moneyIn: i < 7 ? lastWeek / 7 : thisWeek / 7 },
      lines: [`day ${i}`],
      alerts: [],
    })),
    headlines: [h],
    hasData: true,
    totalEvents: days,
    line: [`day 0`],
  };
}

test("shouldFire: first, remind, quiet, and re-arm (hysteresis contract)", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  assert.equal(shouldFire({ conditionHolds: true, lastState: null, now }).reason, "first");
  assert.equal(shouldFire({ conditionHolds: true, lastState: { firedAt: new Date(now.getTime() - 3600_000).toISOString(), recovered: false }, now }).reason, "inside-quiet");
  assert.equal(shouldFire({ conditionHolds: true, lastState: { firedAt: new Date(now.getTime() - (QUIET_HOURS + 1) * 3_600_000).toISOString(), recovered: false }, now }).reason, "remind");
  assert.equal(shouldFire({ conditionHolds: true, lastState: { firedAt: new Date(now.getTime() - 3600_000).toISOString(), recovered: true }, now }).reason, "re-armed");
  assert.equal(healthy(shouldFire({ conditionHolds: false, lastState: { firedAt: new Date().toISOString(), recovered: false }, now }).reason), true);
});
function healthy(reason: string): boolean {
  return reason === "recovered-silence" || reason === "inside-quiet";
}

test("drop rule: fires at −40%, silent at −39%, needs prior week (cold start never alarms)", () => {
  const states = {};
  const at = (delta: number | null, d = 14) => {
    const { decisions } = computeAlerts({
      lineageId: "L1",
      consoleTitle: "Ledger",
      trend: trend(delta, { days: d }),
      todayAlerts: [],
      states,
      now: new Date("2026-09-26T10:00:00Z"),
    });
    return decisions.filter((x) => x.rule === "headline-drop");
  };
  assert.ok(at(-50).length === 1, "−50% must fire");
  assert.ok(at(-39).length === 0, "−39% must stay quiet");
  assert.ok(at(null, 3).length === 0, "cold start (3 days) must never alarm");
});

test("translator alerts fire once per quiet period, then stay quiet", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  const args = {
    lineageId: "L1",
    consoleTitle: "Pharma",
    trend: trend(0),
    todayAlerts: ["Vicks cough syrup below reorder (2/5)"],
    states: {} as Record<string, import("../src/lib/domain/alerts").QuietState>,
    now,
  };
  const r1 = computeAlerts(args);
  assert.ok(r1.decisions.some((d) => d.rule === "translator-alerts"), "first sighting fires");
  const states2 = { "translator-alerts": r1.nextStates["translator-alerts"] };
  const r2 = computeAlerts({ ...args, states: states2 });
  assert.ok(!r2.decisions.some((d) => d.rule === "translator-alerts"), "inside quiet window: silent");
  const r3 = computeAlerts({
    ...args,
    states: { "translator-alerts": { firedAt: new Date(now.getTime() - (QUIET_HOURS + 1) * 3_600_000).toISOString(), recovered: false } },
  });
  assert.ok(r3.decisions.some((d) => d.rule === "translator-alerts"), "after QUIET_HOURS: reminds");
});

test("spike rule fires on ≥+60% growth", () => {
  const { decisions } = computeAlerts({
    lineageId: "L1",
    consoleTitle: "Ledger",
    trend: trend(80),
    todayAlerts: [],
    states: {},
    now: new Date("2026-09-26T10:00:00Z"),
  });
  assert.ok(decisions.some((d) => d.rule === "headline-spike"));
});

test("recovery message follows a fired drop", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  // Week 1: −50% (fires). Week 2: recovered (−5%).
  const { decisions, nextStates } = computeAlerts({
    lineageId: "L1",
    consoleTitle: "Ledger",
    trend: trend(-50),
    todayAlerts: [],
    states: {},
    now,
  });
  assert.ok(decisions.some((d) => d.rule === "headline-drop" && d.severity === "critical"));
  const r2 = computeAlerts({
    lineageId: "✗",
    consoleTitle: "Ledger",
    trend: trend(-5),
    todayAlerts: [],
    states: nextStates,
    now,
  });
  assert.ok(r2.decisions.some((d) => d.message.includes("recovered")), "recovery must be announced");
});

test("renderAlertDigest groups by console and closes clean when empty", async () => {
  const { renderAlertDigest } = await import("../src/lib/infra/channels");
  const withItems = renderAlertDigest("Anand Sweets", [{ consoleTitle: "Cashbook", messages: ["Money in down 45%"] }]);
  assert.ok(withItems.includes("Cashbook") && withItems.includes("45%"));
  const empty = renderAlertDigest("Anand Sweets", []);
  assert.ok(empty.includes("All clear"));
});
