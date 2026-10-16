// Console lineage lifecycle.
//
// A console's versions form one lineage (workflows.lineageId). Exactly ONE row
// per lineage is the live head (isActive, status "published"); edits and chat
// revisions land as DRAFT rows behind it and only activation (approve / make
// live / restore) swaps the head — atomically, so a lineage is never headless
// while any row exists.
//
// Serve rules (resolveServeRow):
// - active rows serve themselves;
// - an inactive row that is the NEWEST of its lineage serves itself — its
//   explicit id is a preview link (old links keep serving the live head);
// - any older inactive row forwards to the active head, or — if the lineage is
//   headless (legacy rows deactivated before activation was lineage-aware) —
//   to the newest row, so a stale console can never outrank a newer version.
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { currentConfigVersion } from "@/lib/domain/config-versions";

/**
 * Lineage mutex, take 2: a transaction-scoped advisory lock keyed on the
 * lineage id. Row locks (FOR UPDATE) cannot see rows INSERTED by a concurrent
 * transaction (phantoms), so two waiters could both compute lineage-max+1 and
 * race to the unique index. The advisory lock serializes EVERY lineage
 * mutation — inserts included — for the whole transaction.
 */
async function lockLineageAdvisory(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], lineageId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lineageId}))`);
}

type Row = typeof workflows.$inferSelect;

/** Newest row of a lineage (highest schemaVersion, id as tiebreak). */
export async function newestInLineage(lineageId: string): Promise<Row | null> {
  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.lineageId, lineageId))
    .orderBy(desc(workflows.schemaVersion), desc(workflows.id))
    .limit(1);
  return rows[0] ?? null;
}

/** Active head of a lineage, if one exists. */
export async function activeHeadOf(lineageId: string): Promise<Row | null> {
  const rows = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.lineageId, lineageId), eq(workflows.isActive, true)))
    .orderBy(desc(workflows.schemaVersion))
    .limit(1);
  return rows[0] ?? null;
}

/** Resolve which row a workflow id should SERVE (see module docstring). */
export async function resolveServeRow(id: string): Promise<Row | null> {
  const initial = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
  if (!initial.length) return null;
  const row = initial[0];
  if (row.isActive || !row.lineageId) return row;
  const newest = await newestInLineage(row.lineageId);
  if (newest && newest.id === row.id) return row; // draft preview link
  const head = await activeHeadOf(row.lineageId);
  if (head) return head;
  return newest ?? row; // headless fallback — never serve a stale orphan
}

/**
 * Lock every row of a lineage FOR UPDATE, always in the same order (by id).
 * This is the lineage mutex: any transaction that holds it excludes every
 * other lineage mutation. Locking the whole set in ONE statement removes the
 * lock-order inversion that deadlocked two concurrent activations.
 */
async function lockLineage(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], lineageId: string): Promise<Row[]> {
  return tx
    .select()
    .from(workflows)
    .where(eq(workflows.lineageId, lineageId))
    .orderBy(workflows.id)
    .for("update");
}

/**
 * Atomically make `id` the single active head of its lineage: every sibling is
 * deactivated and the row itself is activated + published, in ONE transaction
 * under the lineage mutex. A unique partial index backs this at the storage
 * layer (see scripts/migrate-a6.mts). Safe to call on a lineage whose
 * lineageId was never self-set (legacy rows).
 */
export async function activateLineageHead(id: string): Promise<{ head: Row; previous: Row | null }> {
  return db.transaction(async (tx) => {
    const probe = await tx.select().from(workflows).where(eq(workflows.id, id)).limit(1);
    if (!probe.length) throw new Error("Workflow not found");
    const lineageId = probe[0].lineageId ?? probe[0].id;
    await lockLineageAdvisory(tx, lineageId);

    const rows = await lockLineage(tx, lineageId);
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error("Workflow not found");
    const previous = rows.find((r) => r.isActive && r.id !== row.id) ?? null;

    await tx
      .update(workflows)
      .set({ isActive: false, deprecatedAt: new Date() })
      .where(and(eq(workflows.lineageId, lineageId), ne(workflows.id, row.id)));
    const updated = await tx
      .update(workflows)
      .set({ isActive: true, status: "published", deprecatedAt: null, lineageId })
      .where(eq(workflows.id, row.id))
      .returning();
    return { head: updated[0], previous: previous && previous.id !== row.id ? previous : null };
  });
}

/**
 * Insert a new DRAFT version on an existing lineage (same conventions as the
 * one-shot publish minus deactivation: drafts never touch the live head —
 * activation is a separate, explicit step).
 */
/**
 * Insert a new DRAFT version on an existing lineage in ONE transaction.
 *
 * Concurrency: the referenced row is locked FOR UPDATE first (edits resolve
 * to the lineage head, so this serializes drafts per lineage), and the new
 * schemaVersion is allocated as LINEAGE MAX + 1 — never base+1 — so two
 * concurrent edits can't both claim the same next version. The unique
 * (lineage_id, schema_version) index backs this at the storage layer.
 */
export async function insertDraftVersion(opts: {
  wf: Row;
  config: Record<string, unknown>;
  html: string;
  summary: string;
}): Promise<{ newId: string; version: number }> {
  return db.transaction(async (tx) => {
    const probe = await tx.select().from(workflows).where(eq(workflows.id, opts.wf.id)).limit(1);
    if (!probe.length) throw new Error("Workflow not found");
    const lineageId = probe[0].lineageId ?? probe[0].id;
    await lockLineageAdvisory(tx, lineageId);

    // Same mutex as activation: lineage-wide lock, deterministic order.
    const rows = await lockLineage(tx, lineageId);
    const wf = rows.find((r) => r.id === opts.wf.id) ?? probe[0];

    const newest = rows.reduce((m, r) => Math.max(m, (r.schemaVersion as number) || 1), 1);
    const nextVersion = newest + 1;

    const cfg = { ...opts.config, artifactHtml: opts.html, lastEditSummary: opts.summary };
    const ins = await tx
      .insert(workflows)
      .values({
        tenantId: wf.tenantId,
        primitiveType: wf.primitiveType,
        config: cfg,
        lineageId,
        schemaVersion: nextVersion,
        configVersion: currentConfigVersion(), // new drafts are always current
        isActive: false,
        status: "draft",
      })
      .returning();
    return { newId: ins[0].id, version: nextVersion };
  });
}
