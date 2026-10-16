import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local","utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g,"");
}
const { db } = await import("../src/db/index");
const { workflows } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");
const id = "4f439d8e-c2ae-49e1-940c-f13e9aa1e139";
const wf = await db.select({ config: workflows.config }).from(workflows).where(eq(workflows.id, id)).limit(1);
const c = wf[0].config as { schema?: unknown };
console.log(JSON.stringify(c.schema, null, 2));
