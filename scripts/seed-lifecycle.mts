// Seed one deterministic console lineage for the lifecycle e2e (zero LLM):
// ensures the demo tenant exists and publishes a fresh roster console from
// the shared fixture, then prints its workflow id for LC_WF.
// Usage: npx tsx scripts/seed-lifecycle.mts
import { reassemble } from "../src/lib/pipeline/assemble-registry";
import { roster } from "./demo-fixtures";

async function main() {
  const { db } = await import("../src/db/index");
  const { tenants, workflows } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  const ACCESS = "chennai2026";
  let tenant = (await db.select().from(tenants).where(eq(tenants.accessCode, ACCESS)).limit(1))[0];
  if (!tenant) {
    tenant = (await db.insert(tenants).values({ name: "Lifecycle Demo", accessCode: ACCESS, staffPin: "1234", tier: "starter" }).returning())[0];
    console.error("created tenant", tenant.id);
  }

  const html = reassemble("roster", roster);
  const row = (
    await db
      .insert(workflows)
      .values({
        tenantId: tenant.id,
        primitiveType: "grid",
        config: {
          title: "StitchPay — lifecycle",
          archetype: "roster",
          archetypeConfig: roster,
          schema: { layout_type: "grid", rows: [], columns: [] },
          userPrompt: "roster for tailors — lifecycle e2e seed",
          artifactHtml: html,
        },
        lineageId: crypto.randomUUID(),
        schemaVersion: 1,
        isActive: true,
        status: "published",
      })
      .returning()
  )[0];

  console.log(JSON.stringify({ workflowId: row.id, tenantId: tenant.id, accessCode: ACCESS }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
