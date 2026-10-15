// A6 migration — concurrency hardening, idempotent, safe to run repeatedly.
//   1. Dedupe multi-active heads (pre-activation-bug legacy): keep the newest
//      version as the head, deactivate the rest.
//   2. Renumber duplicate (lineage_id, schema_version) rows: two rows claiming
//      one version is corruption from the old base+1 allocation — extras move
//      to lineage-max + 1, oldest first. Loops until clean.
//   3. CREATE UNIQUE INDEX IF NOT EXISTS:
//        - one ACTIVE row per lineage (partial index)
//        - one row per (lineage_id, schema_version)
// Run: npx tsx scripts/migrate-a6.mts   (loads .env.local itself)
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { db } = await import("../src/db/index");
const { sql } = await import("drizzle-orm");

async function main() {
  console.log("A6 migration: lineage invariants…");

  const deduped = await db.execute(sql`
    UPDATE workflows w
    SET is_active = false, deprecated_at = COALESCE(w.deprecated_at, now())
    WHERE w.is_active = true
      AND EXISTS (
        SELECT 1 FROM workflows w2
        WHERE w2.lineage_id = w.lineage_id
          AND w2.id <> w.id
          AND w2.is_active = true
          AND (
            w2.schema_version > w.schema_version
            OR (w2.schema_version = w.schema_version AND w2.created_at > w.created_at)
            OR (w2.schema_version = w.schema_version AND w2.created_at = w.created_at AND w2.id > w.id)
          )
      )
  `);
  console.log(`  ✓ deduped multi-active lineages (${deduped.rowCount ?? 0} rows deactivated)`);

  // Renumber duplicate versions, one row at a time (max+1), looping until no
  // duplicates remain. Duplicates were never meaningful history.
  let renumbered = 0;
  for (let pass = 0; pass < 100; pass++) {
    const dups = await db.execute(sql`
      SELECT lineage_id, schema_version, count(*) AS n
      FROM workflows
      GROUP BY lineage_id, schema_version
      HAVING count(*) > 1
      ORDER BY lineage_id, schema_version
      LIMIT 50
    `);
    if (!dups.rows.length) break;
    for (const d of dups.rows) {
      // Deactivate all but the oldest, then push the extras to max+1 one by one.
      const extras = await db.execute(sql`
        SELECT id FROM workflows
        WHERE lineage_id = ${d.lineage_id} AND schema_version = ${d.schema_version}
        ORDER BY created_at, id
        OFFSET 1
      `);
      for (const e of extras.rows) {
        await db.execute(sql`
          UPDATE workflows
          SET schema_version = (SELECT COALESCE(MAX(schema_version), 0) + 1 FROM workflows WHERE lineage_id = ${d.lineage_id})
          WHERE id = ${e.id}
        `);
        renumbered++;
      }
    }
  }
  console.log(`  ✓ renumbered ${renumbered} duplicate-version rows to lineage-max + 1`);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS workflow_lineage_head_uq
    ON workflows (lineage_id) WHERE is_active
  `);
  console.log("  ✓ unique head index ready (one active row per lineage)");

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS workflow_lineage_version_uq
    ON workflows (lineage_id, schema_version)
  `);
  console.log("  ✓ unique (lineage_id, schema_version) index ready");

  console.log("Migration complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
