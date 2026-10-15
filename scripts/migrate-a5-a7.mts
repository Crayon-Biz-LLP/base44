// A5 + A7 migration — idempotent DDL, safe to run repeatedly.
//   1. CREATE TABLE IF NOT EXISTS workflow_changes (audit trail)
//   2. ADD COLUMN IF NOT EXISTS workflows.config_version (config evolution)
//   3. Backfill config_version = 1 where it defaulted to 1 anyway
// Run: npx tsx scripts/migrate-a5-a7.mts   (loads .env.local itself)
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"/g, "");
}

const { db } = await import("../src/db/index");
const { sql } = await import("drizzle-orm");

async function main() {
  console.log("A5+A7 migration: ensuring workflow_changes + workflows.config_version…");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS workflow_changes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      lineage_id uuid NOT NULL,
      from_version integer,
      to_version integer,
      from_workflow_id uuid,
      to_workflow_id uuid,
      kind text NOT NULL,
      actor text NOT NULL DEFAULT 'owner',
      summary text,
      patch jsonb,
      config_hash text,
      request_id text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  console.log("  ✓ workflow_changes ready");

  await db.execute(sql`ALTER TABLE workflows ADD COLUMN IF NOT EXISTS config_version integer NOT NULL DEFAULT 1`);
  console.log("  ✓ workflows.config_version ready");

  const res = await db.execute(sql`UPDATE workflows SET config_version = 1 WHERE config_version IS NULL`);
  console.log(`  ✓ backfilled ${res.rowCount ?? 0} rows (defaulted rows already carry 1)`);

  console.log("Migration complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
