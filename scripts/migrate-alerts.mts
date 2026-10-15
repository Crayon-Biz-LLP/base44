// A-alerts migration — idempotent DDL, safe to run repeatedly.
//   1. tenants.alert_email / tenants.alert_phone (alert destinations)
//   2. alert_log (audit of every dispatched or skipped alert)
//   3. alert_state (hysteresis memory per tenant+lineage+rule)
// Run: npx tsx scripts/migrate-alerts.mts   (loads .env.local itself)
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { db } = await import("../src/db/index");
const { sql } = await import("drizzle-orm");

async function main() {
  console.log("Alerts migration: destinations, log, hysteresis state…");

  await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS alert_email text`);
  await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS alert_phone text`);
  console.log("  ✓ tenants.alert_email / alert_phone ready");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS alert_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      lineage_id uuid,
      rule text NOT NULL,
      severity text NOT NULL DEFAULT 'info',
      message text NOT NULL,
      channels jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'sent',
      detail jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  console.log("  ✓ alert_log ready");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS alert_state (
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      lineage_id uuid NOT NULL,
      rule text NOT NULL,
      fired_at timestamp,
      recovered boolean NOT NULL DEFAULT false,
      PRIMARY KEY (tenant_id, lineage_id, rule)
    )
  `);
  console.log("  ✓ alert_state ready");

  console.log("Migration complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
