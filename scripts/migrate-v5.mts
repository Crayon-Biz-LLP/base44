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
const { eq, lt, or, isNull } = await import("drizzle-orm");
const { lazyUpgradeWorkflowConfig } = await import("../src/lib/domain/upgrader");
const { generateArtifact } = await import("../src/lib/pipeline/artifact");

async function migrate() {
  console.log("Starting Manifest V5 Migration...");

  const targetWorkflows = await db
    .select()
    .from(workflows)
    .where(
      or(
        lt(workflows.schemaVersion, 5),
        isNull(workflows.schemaVersion)
      )
    );

  console.log(`Found ${targetWorkflows.length} workflows to migrate.`);

  let successCount = 0;
  let failCount = 0;

  for (const wf of targetWorkflows) {
    try {
      const currentVersion = (wf.schemaVersion as number) || 1;
      const config = wf.config as Record<string, unknown>;

      // 1. Upgrade schema deterministic visuals
      const upgradedConfig = lazyUpgradeWorkflowConfig(config, currentVersion) as Record<string, unknown>;

      // 2. Synthesize or retrieve userPrompt
      const userPrompt =
        typeof upgradedConfig.userPrompt === "string"
          ? upgradedConfig.userPrompt
          : `A functional app for ${typeof upgradedConfig.title === "string" ? upgradedConfig.title : "this specific workflow"}`;
      // Persist the effective prompt so later artifact regens stay lossless
      // instead of re-synthesizing a title-only fallback.
      upgradedConfig.userPrompt = userPrompt;
      
      // 3. Regenerate Artifact
      console.log(`Regenerating artifact for workflow: ${wf.id} (${upgradedConfig.title})`);
      const artifactHtml = await generateArtifact({
        userPrompt,
        title: typeof upgradedConfig.title === "string" ? upgradedConfig.title : "",
        schema: upgradedConfig.schema as unknown as Parameters<typeof generateArtifact>[0]["schema"]
      });

      if (artifactHtml) {
        upgradedConfig.artifactHtml = artifactHtml;
      }

      // 4. Save back to database
      await db.update(workflows)
        .set({
          config: upgradedConfig as typeof wf.config,
          schemaVersion: 5
        })
        .where(eq(workflows.id, wf.id));
        
      successCount++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to migrate workflow ${wf.id}:`, msg);
      failCount++;
    }
  }

  console.log(`Migration complete. Success: ${successCount}, Failed: ${failCount}`);
  process.exit(0);
}

migrate();