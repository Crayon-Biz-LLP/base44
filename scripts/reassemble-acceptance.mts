// Re-assemble stored acceptance rows from their own archetypeConfig — zero
// LLM. Assembly is deterministic, so this refreshes artifactHtml to current
// template bytes (design fixes, a11y, scroll-margin) without re-extracting.
// Usage: npx tsx scripts/reassemble-acceptance.mts
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { db } = await import("../src/db/index");
const { workflows } = await import("../src/db/schema");
const { desc, eq } = await import("drizzle-orm");
import type { ChassisArchetype } from "../src/lib/infra/artifact-design";
const { withChassis } = await import("../src/lib/infra/artifact-design");

const { assembleConsole } = await import("../src/lib/infra/studio-v2");
const { assembleTargetBoard } = await import("../src/lib/infra/target-board");
const { assemblePipeline } = await import("../src/lib/infra/pipeline");
const { assembleLedger } = await import("../src/lib/infra/ledger");
const { assembleTemporal } = await import("../src/lib/infra/temporal");
const { assembleFleet } = await import("../src/lib/infra/fleet");

type Assembler = (cfg: Record<string, unknown>) => string;
const ASSEMBLE: Record<string, Assembler> = {
  spatial: assembleConsole as unknown as Assembler,
  "target-board": assembleTargetBoard as unknown as Assembler,
  pipeline: assemblePipeline as unknown as Assembler,
  ledger: assembleLedger as unknown as Assembler,
  temporal: assembleTemporal as unknown as Assembler,
  fleet: assembleFleet as unknown as Assembler,
};

type WfConfig = {
  title?: string;
  userPrompt?: string;
  archetype?: string;
  archetypeConfig?: { dark?: boolean; accentHex?: string } & Record<string, unknown>;
};

const recent = await db.select().from(workflows).orderBy(desc(workflows.createdAt)).limit(80);
const rows = recent.filter((r) => String((r.config as { title?: string })?.title || "").includes("— Acceptance"));

// Newest per (prompt + archetype): one row per scenario
const seen = new Set<string>();
const keep: typeof rows = [];
for (const r of rows) {
  const c = r.config as WfConfig;
  const key = (c.userPrompt || "") + "|" + c.archetype;
  if (seen.has(key)) continue;
  seen.add(key);
  keep.push(r);
}

let updated = 0;
for (const r of keep) {
  const c = r.config as WfConfig;
  const fn = ASSEMBLE[c.archetype ?? ""];
  if (!fn || !c.archetypeConfig) { console.log(`skip ${c.title} (no assembler/config)`); continue; }
  const html = withChassis(fn(c.archetypeConfig), { dark: !!c.archetypeConfig.dark, accent: c.archetypeConfig.accentHex || "#f59e0b", archetype: c.archetype as ChassisArchetype });
  await db.update(workflows).set({ config: { ...c, artifactHtml: html } }).where(eq(workflows.id, r.id));
  console.log(`reassembled ${(c.archetype ?? "").padEnd(13)} ${(c.title ?? "").replace(" — Acceptance", "")}`);
  updated++;
}
console.log(`\n${updated} row(s) refreshed to current template bytes`);
process.exit(0);
