// List the most recent acceptance-published consoles (one per scenario) with
// their live /app links. Zero LLM. Usage: npx tsx scripts/list-acceptance.mts
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { db } = await import("../src/db/index");
const { workflows } = await import("../src/db/schema");
const { desc } = await import("drizzle-orm");

// config is jsonb — filter in JS rather than fighting jsonb path operators.
const recent = await db.select().from(workflows).orderBy(desc(workflows.createdAt)).limit(80);
const rows = recent.filter((r: any) => String((r.config as any)?.title || "").includes("— Acceptance"));

const BASE = "http://localhost:3000";
const seen = new Set<string>();
for (const r of rows) {
  const cfg = (r.config ?? {}) as { title?: string; archetype?: string; userPrompt?: string };
  const key = `${cfg.archetype ?? ""}|${cfg.title ?? ""}`;
  if (seen.has(key)) continue; // keep newest per scenario
  seen.add(key);
  // Verify the link serves the real console bytes
  let live = "—";
  try {
    const res = await fetch(`${BASE}/api/workflow/${r.id}`);
    const j = await res.json();
    const html = j?.workflow?.config?.artifactHtml || "";
    live = res.status === 200 && html.length > 0 ? `200 (${html.length} bytes)` : `BAD(${res.status})`;
  } catch { live = "server-down"; }
  console.log(`${cfg.title ?? "(untitled)"}\n  archetype: ${cfg.archetype ?? "?"} | schema v${r.schemaVersion} | live: ${live}\n  prompt : "${(cfg.userPrompt || "").slice(0, 80)}"\n  link   : ${BASE}/app/${r.id}\n`);
}
process.exit(0);
