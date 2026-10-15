// Seed a 14-day synthetic history for the alerts loop demo: week one healthy
// (7 synced days), week two collapsed (~−60% fewer workers logged). Run the
// cron right after and a headline-drop alert must fire.
// Usage: npx tsx scripts/seed-alert-demo.mts
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { db } = await import("../src/db/index");
const { workflows, events, locations } = await import("../src/db/schema");
const { and, desc, eq } = await import("drizzle-orm");

async function main() {
  const wf = (
    await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.isActive, true)))
      .orderBy(desc(workflows.createdAt))
      .limit(1)
  )[0];
  if (!wf) throw new Error("no active workflow found — seed one first");
  const cfg = wf.config as Record<string, unknown>;
  const base = (cfg.archetypeConfig ?? {}) as { workers?: { name: string; rate: number }[] };
  const workers = base.workers ?? [{ name: "Ramesh", rate: 55 }, { name: "Suresh", rate: 60 }];

  // events.locationId is NOT NULL → reuse the tenant's branch (create if absent).
  let loc = (await db.select().from(locations).where(eq(locations.tenantId, wf.tenantId)).limit(1))[0];
  if (!loc) loc = (await db.insert(locations).values({ tenantId: wf.tenantId, name: "Main Branch" }).returning())[0];

  const rows: (typeof events.$inferInsert)[] = [];
  for (let d = 13; d >= 0; d--) {
    const createdAt = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    const collapsed = d < 7; // this week (most recent 7 days) is the bad week
    const present = collapsed ? workers.slice(0, Math.max(1, Math.floor(workers.length * 0.4))) : workers;
    const records = present.map((w, i) => ({
      name: w.name,
      rate: w.rate,
      today_status: collapsed && i === 0 ? "half" : "full",
      month_units: collapsed ? 12 : 26,
    }));
    rows.push({
      tenantId: wf.tenantId,
      workflowId: wf.id,
      locationId: loc.id,
      status: "confirmed",
      imageUrl: "", // synthetic rows carry no receipt
      filledBy: "Alert Demo",
      payload: { records },
      schemaVersion: 2,
      createdAt,
    });
  }
  await db.insert(events).values(rows);
  console.log(JSON.stringify({ workflowId: wf.id, seededDays: 14, collapsedWeek: true }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
