import { readFileSync } from "node:fs";
import { join } from "node:path";

// 1. Load Environment Variables
for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

// 2. Dynamic Imports
const { db } = await import("../src/db/index");
const { workflows } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");
const { enrichArtifact } = await import("../src/lib/pipeline/artifact");

async function backfill() {
  console.log("Starting deterministic backfill (no LLM)...");

  const all = await db
    .select({ id: workflows.id, config: workflows.config })
    .from(workflows);

  let enrichCount = 0;
  let promptCount = 0;

  for (const wf of all) {
    const config = (wf.config ?? {}) as Record<string, unknown>;
    if (typeof config !== "object" || config === null) continue;
    let changed = false;

    // Artifact enrichment: decimal keyboard on every number input.
    if (typeof config.artifactHtml === "string") {
      const enriched = enrichArtifact(config.artifactHtml);
      if (enriched !== config.artifactHtml) {
        config.artifactHtml = enriched;
        changed = true;
        enrichCount++;
      }
    }

    // Lossless prompt persistence: synthesize only when absent.
    if (typeof config.userPrompt !== "string" && typeof config.title === "string") {
      config.userPrompt = `A functional app for ${config.title}`;
      changed = true;
      promptCount++;
    }

    if (changed) {
      await db.update(workflows).set({ config }).where(eq(workflows.id, wf.id));
    }
  }

  console.log(`Done. Enriched ${enrichCount} artifacts, persisted ${promptCount} prompts.`);
}

backfill()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Backfill failed:", msg);
    process.exit(1);
  });