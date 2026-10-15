// Owner overview — pure row-builder verification. Zero LLM, zero DB.
// Run: npx tsx --test --test-force-exit tests/overview.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOverviewRow, sortOverviewRows, type OverviewRow } from "../src/lib/domain/overview";

type Snap = { createdAt: Date; payload: Record<string, unknown> | null };
const NOW = new Date("2026-09-21T10:00:00Z"); // 15:30 IST on the last synced day

/** Ledger-style snapshots: `amount` on each record. Last week = Sep 08–14, this week = Sep 15–21. */
function ledgerSnaps(opts: { thisWeek: number[]; lastWeek: number[] }): Snap[] {
  const out: Snap[] = [];
  const push = (dayIso: string, amount: number) =>
    out.push({ createdAt: new Date(`${dayIso}T10:00:00Z`), payload: { records: [{ day: dayIso, label: "x", type: "Cash sale", account: "Cash", amount, balance_after: amount }] } });
  for (let i = 0; i < opts.lastWeek.length; i++) push(`2026-09-${String(8 + i).padStart(2, "0")}`, opts.lastWeek[i]);
  for (let i = 0; i < opts.thisWeek.length; i++) push(`2026-09-${String(15 + i).padStart(2, "0")}`, opts.thisWeek[i]);
  return out;
}

test("overview row: today's value, healthy arrow, fresh sync", () => {
  // last week 700 (100×7), this week 2100 (300×7) → +200%
  const row = buildOverviewRow({
    id: "w1",
    title: "Cashbook",
    archetype: "ledger",
    config: null,
    snapshots: ledgerSnaps({ thisWeek: Array(7).fill(300), lastWeek: Array(7).fill(100) }),
    now: NOW,
  });
  assert.equal(row.headline?.key, "moneyIn");
  assert.equal(row.thisWeek, 2100);
  assert.equal(row.lastWeek, 700);
  assert.equal(row.deltaPct, 200);
  assert.equal(row.direction, "up");
  assert.equal(row.today, 300, "today's headline = today's own day stat");
  assert.equal(row.attention, null, "growth + alerts-free day is not attention");
  assert.ok(row.syncedToday, "last snapshot is today → fresh");
  assert.equal(row.minutesAgo, 0);
});

test("overview row: drop flags critical attention", () => {
  const row = buildOverviewRow({
    id: "w2",
    title: "Cashbook",
    archetype: "ledger",
    config: null,
    snapshots: ledgerSnaps({ thisWeek: Array(7).fill(50), lastWeek: Array(7).fill(100) }), // −50%
    now: NOW,
  });
  assert.equal(row.direction, "down");
  assert.ok(row.attention?.level === "critical", JSON.stringify(row.attention));
  assert.ok(row.attention?.reasons.some((r) => r.includes("down 50%")));
});

test("overview row: cold start (no prior week) never flags attention", () => {
  const snaps = ledgerSnaps({ thisWeek: Array(7).fill(100), lastWeek: [] });
  const row = buildOverviewRow({ id: "w3", title: "Cashbook", archetype: "ledger", config: null, snapshots: snaps, now: NOW });
  assert.equal(row.deltaPct, null);
  assert.equal(row.attention, null);
});

test("overview row: nothing synced today → today null, not fake zero", () => {
  const snaps = ledgerSnaps({ thisWeek: Array(7).fill(100), lastWeek: Array(7).fill(100) });
  const stale = snaps.filter((s) => s.createdAt < new Date("2026-09-21T00:00:00Z")); // last sync = Sep 20
  const row = buildOverviewRow({ id: "w4", title: "Cashbook", archetype: "ledger", config: null, snapshots: stale, now: NOW });
  assert.equal(row.today, null);
  assert.equal(row.syncedToday, false);
  assert.ok((row.minutesAgo ?? 0) >= 1440, "stale by a day");
});

test("overview row: empty console hides cleanly", () => {
  const row = buildOverviewRow({ id: "w5", title: "Empty", archetype: "queue", config: null, snapshots: [], now: NOW });
  assert.equal(row.headline, null);
  assert.equal(row.attention, null);
  assert.equal(row.lastSyncAt, null);
});

test("sort: problems first (critical > warn > healthy), fresher first within rank", () => {
  const mk = (over: Partial<OverviewRow>): OverviewRow => ({
    id: over.id ?? "x",
    title: "t",
    archetype: "ledger",
    headline: null,
    today: null,
    thisWeek: null,
    lastWeek: null,
    deltaPct: null,
    direction: null,
    lastSyncAt: null,
    syncedToday: false,
    minutesAgo: 0,
    attention: null,
    ...over,
  });
  const rows: OverviewRow[] = [
    mk({ id: "healthy-stale", minutesAgo: 500 }),
    mk({ id: "warn", attention: { level: "warn", reasons: ["absent"] }, minutesAgo: 300 }),
    mk({ id: "critical-stale", attention: { level: "critical", reasons: ["down 60%"] }, minutesAgo: 400 }),
    mk({ id: "critical-fresh", attention: { level: "critical", reasons: ["down 55%"] }, minutesAgo: 5 }),
  ];
  const sorted = sortOverviewRows(rows).map((r) => r.id);
  assert.deepEqual(sorted, ["critical-fresh", "critical-stale", "warn", "healthy-stale"]);
});
