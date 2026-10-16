// Zero-LLM seeder for the behavioral suites. Publishes ONE deterministic
// console per archetype from the shared fixtures (scripts/demo-fixtures.ts)
// so tests/{target-board,fleet,pipeline,lifecycle,ledger,temporal,studio}-
// behavior.mts + entry-behavior.mts run against a known roster/metric set
// instead of whatever generated tenant happens to be lying around.
//
// Writes the env map to /tmp/opsdesk-behavior-env.json (consumed by
// tests/behavior-all.mts) and prints an `export` block for manual runs.
//
// Usage: npx tsx scripts/seed-behavior.mts
import { reassemble } from "../src/lib/infra/assemble-registry";
import { spatial, targetBoard, pipeline, ledger, temporal, fleet } from "./demo-fixtures";
import type { ArchetypeId } from "../src/lib/infra/archetypes";
import { readFileSync, writeFileSync } from "node:fs";

// Load .env.local before the DB client reads process.env.DATABASE_URL.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const ACCESS = "chennai2026";

const SPECS: { env: string; archetype: ArchetypeId; title: string; config: unknown }[] = [
  { env: "TB_WF", archetype: "target-board", title: "Behavior — Target Board", config: targetBoard },
  { env: "FL_WF", archetype: "fleet", title: "Behavior — Fleet", config: fleet },
  { env: "PL_WF", archetype: "pipeline", title: "Behavior — Pipeline", config: pipeline },
  { env: "TM_WF", archetype: "temporal", title: "Behavior — Temporal", config: temporal },
  { env: "LG_WF", archetype: "ledger", title: "Behavior — Ledger", config: ledger },
  { env: "SP_WF", archetype: "spatial", title: "Behavior — Spatial (Studio)", config: spatial },
];

export async function seedBehaviorWorkflows(): Promise<Record<string, string>> {
  const { db } = await import("../src/db/index");
  const { tenants, workflows } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  let tenant = (await db.select().from(tenants).where(eq(tenants.accessCode, ACCESS)).limit(1))[0];
  if (!tenant) {
    tenant = (
      await db.insert(tenants).values({ name: "Behavior Suite Demo", accessCode: ACCESS, staffPin: "1234", tier: "growth" }).returning()
    )[0];
    console.error("created tenant", tenant.id);
  }

  const env: Record<string, string> = {};
  for (const s of SPECS) {
    const html = reassemble(s.archetype, s.config);
    const row = (
      await db
        .insert(workflows)
        .values({
          tenantId: tenant.id,
          primitiveType: "grid",
          config: {
            title: s.title,
            archetype: s.archetype,
            archetypeConfig: s.config,
            schema: { layout_type: "grid", rows: [], columns: [] },
            userPrompt: `${s.archetype} behavior-suite seed (zero-LLM)`,
            artifactHtml: html,
          },
          lineageId: crypto.randomUUID(),
          schemaVersion: 5,
          isActive: true,
          status: "published",
        })
        .returning()
    )[0];
    env[s.env] = row.id;
  }
  env.OPSDESK_TENANT_ID = tenant.id;
  return env;
}

// Run directly → seed + persist the env map.
if (process.argv[1]?.endsWith("seed-behavior.mts") || process.argv[1]?.endsWith("seed-behavior.ts")) {
  const env = await seedBehaviorWorkflows();
  writeFileSync("/tmp/opsdesk-behavior-env.json", JSON.stringify(env, null, 2));
  console.log(JSON.stringify(env, null, 2));
  console.log("\n# manual run:\n" + Object.entries(env).map(([k, v]) => `export ${k}=${v}`).join("\n"));
  process.exit(0);
}
