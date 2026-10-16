// Cross-console activity feed — the "who logged what" stream. PURE: event
// snapshots in, human feed lines out. One line per SYNC (an event is a whole
// console-day snapshot), not per record — a 20-entry cashbook sync is one
// line with the translator's own summary, not twenty rows of noise.
//
// Actor resolution per archetype, most specific first:
//   record-level actor (logged_by / assigned_to / owner / employee / name)
//   → event-level filledBy → "Someone".
import { translateRecords } from "../pipeline/translators";
import { istDay } from "./trends";
import type { ArchetypeId } from "../pipeline/archetypes";

export interface FeedEvent {
  workflowId: string;
  consoleTitle: string;
  archetype: string;
  filledBy: string | null;
  createdAt: Date;
  payload: Record<string, unknown> | null;
}

export interface FeedItem {
  workflowId: string;
  consoleTitle: string;
  actor: string;
  summary: string; // the translator's first fact line, or a record count
  recordCount: number;
  at: string; // ISO
  day: string; // IST day key
}

/** The record field that names the actor for this archetype (best effort). */
const ACTOR_FIELD: Partial<Record<string, string>> = {
  ledger: "logged_by",
  checklist: "assigned_to",
  pipeline: "owner",
  fleet: "owner",
  "target-board": "employee",
  roster: "name", // subject: "Ramesh marked absent" reads better than the syncer
  spatial: "logged_by",
};

function extractRecords(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload.records)) return payload.records as Record<string, unknown>[];
  if (Array.isArray(payload.grid)) return payload.grid as Record<string, unknown>[];
  return [];
}

/** Pure: newest-first feed, capped. */
export function buildActivityFeed(events: FeedEvent[], cap = 12): FeedItem[] {
  const items = events.map((e) => {
    const records = extractRecords(e.payload);
    const field = ACTOR_FIELD[e.archetype];
    const recordActor = field ? records.map((r) => r[field]).find((v) => typeof v === "string" && v.trim()) : undefined;
    const actor = (typeof recordActor === "string" && recordActor.trim()) || e.filledBy?.trim() || "Someone";

    let summary = `${records.length} record${records.length === 1 ? "" : "s"}`;
    if (records.length) {
      const facts = translateRecords(e.archetype as ArchetypeId, records, null);
      if (facts.lines[0]) summary = facts.lines[0];
    }
    return {
      workflowId: e.workflowId,
      consoleTitle: e.consoleTitle,
      actor,
      summary,
      recordCount: records.length,
      at: e.createdAt.toISOString(),
      day: istDay(e.createdAt),
    };
  });
  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, cap);
}
