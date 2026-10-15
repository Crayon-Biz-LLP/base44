// Activity feed — pure builder verification. Zero LLM, zero DB.
// Run: npx tsx --test --test-force-exit tests/activity-feed.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildActivityFeed, type FeedEvent } from "../src/lib/domain/activity-feed";

const ev = (over: Partial<FeedEvent>): FeedEvent => ({
  workflowId: "w1",
  consoleTitle: "Cashbook",
  archetype: "ledger",
  filledBy: null,
  createdAt: new Date("2026-09-26T10:00:00Z"),
  payload: null,
  ...over,
});

test("actor: record-level logged_by beats event filledBy", () => {
  const [item] = buildActivityFeed([
    ev({
      filledBy: "Counter Staff",
      payload: { records: [{ day: "d", label: "Morning sale", type: "Cash sale", account: "Cash", amount: 250, balance_after: 250, logged_by: "Meera" }] },
    }),
  ]);
  assert.equal(item.actor, "Meera");
  assert.ok(item.summary.includes("In") || item.summary.includes("₹"), item.summary);
});

test("actor: falls back to filledBy, then Someone", () => {
  const [a] = buildActivityFeed([ev({ filledBy: "Bhuvana", payload: { records: [{ employee: "Bhuvana", report_date: "d", activations: 5 }] } })]);
  assert.equal(a.actor, "Bhuvana");
  const [b] = buildActivityFeed([ev({ archetype: "queue", payload: { records: [{ token: "1", counter: "C1", status: "done" }] } })]);
  assert.equal(b.actor, "Someone");
});

test("summary: translator's own first fact line, not raw counts", () => {
  const [item] = buildActivityFeed([
    ev({
      archetype: "checklist",
      consoleTitle: "KitchenGuard",
      payload: { records: [{ round: "Open", check: "a", assigned_to: "Anu", passed: 1 }, { round: "Open", check: "b", assigned_to: "Anu", passed: 0 }] },
    }),
  ]);
  assert.ok(item.summary.includes("pass rate"), item.summary);
  assert.equal(item.actor, "Anu");
});

test("roster: the worker is the subject of the line", () => {
  const [item] = buildActivityFeed([
    ev({ archetype: "roster", consoleTitle: "StitchPay", payload: { records: [{ name: "Ramesh", rate: 55, today_status: "full", month_units: 26 }] } }),
  ]);
  assert.equal(item.actor, "Ramesh");
});

test("sort + cap: newest first, capped at 12", () => {
  const many: FeedEvent[] = Array.from({ length: 20 }, (_, i) =>
    ev({ workflowId: `w${i}`, createdAt: new Date(Date.parse("2026-09-26T10:00:00Z") - i * 60_000), payload: { records: [{ token: "1", counter: "C1", status: "done" }] } }),
  );
  const feed = buildActivityFeed(many, 12);
  assert.equal(feed.length, 12);
  assert.equal(feed[0].workflowId, "w0", "newest first");
  assert.equal(feed[11].workflowId, "w11");
  const empty = buildActivityFeed([]);
  assert.deepEqual(empty, []);
});
