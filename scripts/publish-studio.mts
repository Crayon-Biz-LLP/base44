// Publish the Studio console output (/tmp/studio-rack.html) as a draft
// workflow so it can be viewed at /app/<id>. No LLM calls — pure DB save.
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { db } = await import("../src/db/index");
const { tenants, workflows } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");

const html = readFileSync("/tmp/studio-rack.html", "utf8");

const existing = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).limit(1);
const tenantId = existing[0].id;

const inserted = await db.insert(workflows).values({
  tenantId,
  primitiveType: "grid",
  config: {
    title: "LaserSheet 360 — Studio Console",
    schema: { layout_type: "grid", rows: [], columns: [] },
    userPrompt: "Sheet laser factory: 30 racks x 8 rows storage console (Engine 1 Studio output)",
    artifactHtml: html,
  },
  schemaVersion: 5,
  isActive: false,
  status: "draft",
}).returning();
const id = inserted[0].id;
await db.update(workflows).set({ lineageId: id }).where(eq(workflows.id, id));

console.log("Workflow ID:", id);
console.log("App link   : http://localhost:3000/app/" + id);
console.log("Form link  : http://localhost:3000/submit/" + id);
