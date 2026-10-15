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
const { applyGuardrails } = await import("../src/lib/domain/guardrails");
const { ManifestSchema, ensureCanonicalKeys } = await import("../src/lib/domain/manifest");

const KNOWN_POISONED = ["dd689b3f-0e59-4267-9bd9-11e2ae883baa", "5f6425ca-e437-4dca-8397-fb7f9f6b1aaf"];
const KNOWN_VALID = ["faf64c34", "00da4708"];

async function sweep() {
  console.log("Starting guardrail sweep (deterministic, no LLM)...");

  const all = await db.select({ id: workflows.id, config: workflows.config }).from(workflows);

  let v5 = 0;
  let changed = 0;
  const poisonedReport: { id: string; invariantsBefore: number; invariantsAfter: number }[] = [];
  const validChecked: string[] = [];
  const skipped: { id: string; why: string }[] = [];

  for (const wf of all) {
    const config = (wf.config ?? {}) as Record<string, unknown>;
    const rawSchema = config.schema;
    if (!rawSchema || typeof rawSchema !== "object" || rawSchema === null) {
      skipped.push({ id: wf.id, why: "no config.schema" });
      continue;
    }
    const layout = (rawSchema as Record<string, unknown>).layout_type;
    if (layout !== "grid" && layout !== "list") {
      skipped.push({ id: wf.id, why: `layout_type=${String(layout)}` });
      continue;
    }
    v5++;

    let parsed;
    try {
      parsed = ManifestSchema.parse(rawSchema);
    } catch (e) {
      skipped.push({ id: wf.id, why: `schema parse failed: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    const prompt = typeof config.userPrompt === "string" ? config.userPrompt : null;
    const invariantsBefore = parsed.intelligence?.invariants?.length ?? 0;

    const cleaned = ensureCanonicalKeys(parsed);
    const report = applyGuardrails(cleaned, prompt, { enforceEntryMode: false });

    if (KNOWN_VALID.some((k) => wf.id.startsWith(k))) {
      validChecked.push(wf.id);
      if (report.errors.length > 0) {
        console.error(`  !! known-valid workflow ${wf.id} incurred errors:`, report.errors);
      }
      if (report.fixes.length > 0) {
        console.error(`  !! known-valid workflow ${wf.id} incurred fixes:`, report.fixes);
      }
    }
    if (KNOWN_POISONED.some((k) => wf.id.startsWith(k))) {
      const invariantsAfter = Array.isArray(cleaned.intelligence?.invariants) ? cleaned.intelligence.invariants.length : 0;
      poisonedReport.push({ id: wf.id, invariantsBefore, invariantsAfter });
    }

    if (report.fixes.length > 0 || report.errors.length > 0) {
      changed++;
      const next = { ...config, schema: cleaned };
      await db.update(workflows).set({ config: next }).where(eq(workflows.id, wf.id));
      console.log(`\n[${wf.id}]`);
      if (report.fixes.length) console.log(`  fixes: ${report.fixes.join(" | ")}`);
      if (report.errors.length) console.log(`  errors: ${report.errors.join(" | ")}`);
    }
  }

  console.log("\n===== Sweep summary =====");
  console.log(`v5 (intelligence-capable) workflows: ${v5}`);
  console.log(`workflows written back: ${changed}`);
  if (poisonedReport.length) {
    for (const p of poisonedReport) {
      console.log(`poisoned ${p.id}: invariants ${p.invariantsBefore} -> ${p.invariantsAfter}`);
    }
  }
  if (validChecked.length) console.log(`known-valid checked (expect no errors/fixes): ${validChecked.join(", ")}`);
  if (skipped.length) console.log(`skipped: ${skipped.length} workflows (${skipped.slice(0, 5).map((s) => `${s.id}: ${s.why}`).join(", ")}...)`);
}

sweep()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Sweep failed:", msg);
    process.exit(1);
  });