// Trends layer — pure aggregation over the event ledger. Zero LLM, zero DB.
//   1. The four new translators (queue/checklist/roster/calendar) turn their
//      consoles' record shapes into facts (the doctrine: no archetype without
//      a translator).
//   2. computeConsoleTrend: purity, latest-snapshot-wins per IST day, and a
//      real week-over-week headline delta.
//   3. Every archetype's fixture config + one honest record produces its
//      headline stat — the headline map can't silently rot.
// Run: npx tsx --test --test-force-exit tests/trends.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { translateRecords } from "../src/lib/infra/translators";
import { computeConsoleTrend, istDay } from "../src/lib/domain/trends";
import { targetBoard, ledger, temporal, spatial } from "../scripts/demo-fixtures";

type Rec = Record<string, unknown>;

// ---- Translators: the four shapes that were missing ------------------------

test("translator: queue counts served/serving/waiting and flags a busy counter", () => {
  const records: Rec[] = [
    { token: "1", counter: "C1", status: "done" },
    { token: "2", counter: "C1", status: "done" },
    { token: "3", counter: "C1", status: "done" },
  ];
  for (let i = 4; i <= 13; i++) records.push({ token: String(i), counter: "C2", status: "waiting" }); // 10 waiting > alert threshold
  const f = translateRecords("queue", records, null);
  assert.equal(f.stats.served, 3);
  assert.equal(f.stats.waiting, 10);
  assert.ok(f.lines[0].includes("3 served"));
  assert.ok(f.alerts.length >= 1, "waiting above threshold must alert");
});

test("translator: checklist computes a pass rate and names the missers", () => {
  const f = translateRecords("checklist", [
    { round: "Open", check: "a", assigned_to: "Anu", passed: 1 },
    { round: "Open", check: "b", assigned_to: "Anu", passed: 0 },
    { round: "Close", check: "c", assigned_to: "Karthik", passed: 1 },
  ] as Rec[], null);
  assert.equal(f.stats.passed, 2);
  assert.equal(f.stats.passRatePct, 67);
  assert.ok(f.alerts.some((a) => a.includes("Anu")), "the misser must be named");
});

test("translator: roster tallies the month pay and counts absences", () => {
  const f = translateRecords("roster", [
    { name: "A", rate: 55, today_status: "full", month_units: 26 },
    { name: "B", rate: 60, today_status: "absent", month_units: 20 },
  ] as Rec[], null);
  assert.equal(f.stats.monthPay, 55 * 26 + 60 * 20);
  assert.equal(f.stats.absent, 1);
});

test("translator: calendar extracts overdue renewals from 'in -N days' strings", () => {
  const f = translateRecords("calendar", [
    { kind: "event", title: "Henna booking", day: "in 2 days", detail: "" },
    { kind: "renewal", title: "GST filing", day: "in -3 days", detail: "" },
  ] as Rec[], null);
  assert.equal(f.stats.events, 1);
  assert.equal(f.stats.renewals, 1);
  assert.ok(f.alerts.some((a) => a.includes("GST filing") && a.includes("overdue by 3")), f.alerts.join("; "));
});

// ---- IST day bucketing -----------------------------------------------------

test("istDay: UTC instants land on the right IST calendar day", () => {
  assert.equal(istDay(new Date("2026-09-20T18:30:00Z")), "2026-09-21"); // midnight IST
  assert.equal(istDay(new Date("2026-09-20T18:29:00Z")), "2026-09-20");
});

// ---- computeConsoleTrend ----------------------------------------------------

const SNAP = (dayIso: string, amount: number) => ({
  createdAt: new Date(`${dayIso}T10:00:00Z`),
  payload: { records: [{ day: dayIso, label: "x", type: "Cash sale", account: "Cash", amount, balance_after: amount }] as Rec[] },
});

test("trend: latest snapshot wins per day", () => {
  const early = { createdAt: new Date("2026-09-20T04:00:00Z"), payload: { records: [{ amount: 100, balance_after: 100 }] as Rec[] } };
  const late = { createdAt: new Date("2026-09-20T12:00:00Z"), payload: { records: [{ amount: 500, balance_after: 500 }] as Rec[] } };
  const t = computeConsoleTrend("ledger", null, [early, late]);
  assert.equal(t.days.length, 1);
  assert.equal(t.days[0].stats.moneyIn, 500, "the later write must replace the earlier one");
});

test("trend: pure — same snapshots, same output", () => {
  const snaps = [SNAP("2026-09-15", 100), SNAP("2026-09-16", 200)];
  const a = computeConsoleTrend("ledger", null, structuredClone(snaps));
  const b = computeConsoleTrend("ledger", null, structuredClone(snaps));
  assert.deepEqual(a, b);
});

test("trend: week-over-week delta on moneyIn (up, down, and no-comparison)", () => {
  const week = (start: number, base: number) =>
    Array.from({ length: 7 }, (_, i) => SNAP(`2026-09-${String(start + i).padStart(2, "0")}`, base));
  const up = computeConsoleTrend("ledger", null, [...week(8, 100), ...week(15, 300)]);
  assert.equal(up.headlines[0].lastWeek, 700);
  assert.equal(up.headlines[0].thisWeek, 2100);
  assert.equal(up.headlines[0].direction, "up");
  assert.equal(up.headlines[0].deltaPct, 200);

  const flat = computeConsoleTrend("ledger", null, [...week(8, 100), ...week(15, 100)]);
  assert.equal(flat.headlines[0].direction, "flat");
  assert.equal(flat.headlines[0].deltaPct, 0);

  const coldStart = computeConsoleTrend("ledger", null, week(20, 100));
  assert.equal(coldStart.headlines[0].deltaPct, null, "no prior week → no percentage");
});

test("trend: empty ledger → hasData false, no crash", () => {
  const t = computeConsoleTrend("queue", null, []);
  assert.equal(t.hasData, false);
  assert.deepEqual(t.headlines, []);
});

// ---- Every archetype's headline key is reachable ----------------------------

test("headline map: each archetype's headline stat exists in its translator output", () => {
  const cases: [string, Rec[], Record<string, unknown> | null, string][] = [
    ["target-board", [{ employee: "Bhuvana", report_date: "2026-09-20", activations: 40 }], targetBoard, "achievementPct"],
    ["pipeline", [{ title: "T", stage: "Booked", owner: "S", days_in_stage: 99 }], null, "breached"],
    ["ledger", [{ day: "d", label: "x", type: "Cash sale", account: "Cash", amount: 500, balance_after: 500 }], ledger, "moneyIn"],
    ["temporal", [{ slot: "09:00", resource: "Chair 1", purpose: "cut" }], temporal, "utilizationPct"],
    ["fleet", [{ name: "A", status: "Active", service_state: "svc-due" }], null, "serviceDue"],
    ["spatial", [{ rack_id: 1, slot_no: 1 }], spatial, "utilizationPct"],
    ["queue", [{ token: "1", counter: "C1", status: "done" }], null, "served"],
    ["checklist", [{ round: "R", check: "c", assigned_to: "A", passed: 1 }], null, "passed"],
    ["roster", [{ name: "W", rate: 50, today_status: "full", month_units: 26 }], null, "monthPay"],
    ["calendar", [{ kind: "event", title: "x", day: "in 2 days", detail: "" }], null, "events"],
  ];
  for (const [arch, records, config, key] of cases) {
    const f = translateRecords(arch, records, config);
    assert.ok(key in f.stats, `${arch}: headline stat "${key}" missing from ${JSON.stringify(f.stats)}`);
  }
});

test("trend: spatial config flows through to utilization math", () => {
  const t = computeConsoleTrend("spatial", spatial as unknown as Record<string, unknown>, [
    { createdAt: new Date("2026-09-20T10:00:00Z"), payload: { records: [{ rack_id: 1, slot_no: 1 }] as Rec[] } },
  ]);
  assert.ok(Number(t.days[0].stats.utilizationPct) >= 0);
  assert.equal(t.headlines[0].key, "utilizationPct");
});
