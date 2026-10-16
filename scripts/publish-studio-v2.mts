// Studio V2 end-to-end: raw prompt → archetype classify → content config (one
// small structured LLM call) → deterministic console assembly → published
// workflow at /app/<id>. The model NEVER writes code; it only extracts nouns.
// Usage: npx tsx scripts/publish-studio-v2.mts "your prompt here"
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { pickArchetype } = await import("../src/lib/infra/archetypes");
const { generateConsoleForPrompt } = await import("../src/lib/infra/console-router");
const { extractConsoleConfig } = await import("../src/lib/infra/studio-v2");
const { extractTargetBoardConfig } = await import("../src/lib/infra/target-board");
const { db } = await import("../src/db/index");
const { tenants, workflows } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");

const userPrompt = process.argv.slice(2).join(" ") ||
  "I run a sheet laser cutting factory. I have sheet stacking racks, 8 rows per rack and 30 such racks. I want to track what material, grade and thickness is stored in each row.";

console.log("── Studio: classify → extract → assemble → publish");
const hint = pickArchetype(userPrompt);
console.log(`  archetype: ${hint.id} (keyword score ${hint.score}${hint.runnerUp ? `, runner-up ${hint.runnerUp}` : ""})`);

const t0 = Date.now();
const gen = await generateConsoleForPrompt(userPrompt);
console.log(`  ${gen.productName} — ${gen.archetype} console assembled in ${Date.now() - t0}ms (zero model-written code)`);

const html = gen.html;
writeFileSync("/tmp/studio-v2-rack.html", html);

// SYNTAX GATE: no console goes live unchecked.
writeFileSync("/tmp/console-syntax-check.js", html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>")));
const { execSync } = await import("node:child_process");
try {
  execSync("node --check /tmp/console-syntax-check.js", { stdio: "pipe" });
  console.log("  syntax gate: PASS");
} catch (e) {
  console.error("  syntax gate: FAIL — emitted console has a JS syntax error:\n", (e as { stderr?: { toString(): string } }).stderr?.toString());
  process.exit(1);
}

// ARTIFACT GATE — #2, zero-LLM (Section D). The not-slop floor: a11y,
// motion safety, self-containment. Errors block publish; warnings report.
const { validateArtifact } = await import("../src/lib/infra/validate-artifact");
const v = validateArtifact(html);
if (!v.ok) {
  console.error("  artifact gate: FAIL — console would ship broken:");
  for (const i of v.errors) console.error(`    ✗ [${i.rule}] ${i.detail}`);
  process.exit(1);
}
console.log(`  artifact gate: PASS (${v.warnings.length} warning${v.warnings.length === 1 ? "" : "s"})`);
for (const i of v.warnings) console.log(`    ! [${i.rule}] ${i.detail}`);

// Diagnostics for the prompt under test (extraction shape transparency)
if (hint.id === "spatial") {
  const cfg = await extractConsoleConfig(userPrompt); // n.b. test path only; generation already used its own extraction
  console.log("  spatial config: " + cfg.productName + " · " + cfg.groupCount + " " + cfg.groupLabel + "s × " + cfg.unitsPerGroup + " " + cfg.countLabel + "s");
} else if (hint.id === "target-board") {
  const cfg = await extractTargetBoardConfig(userPrompt);
  console.log("  target-board config: " + cfg.productName + " · " + cfg.people.length + " people × " + cfg.metrics.length + " metrics (" + cfg.metrics.map(m => m.label + "/" + m.target).join(", ") + ")");
}

const existing = await db.select({ id: tenants.id }).from(tenants).limit(1);
const tenantId = existing[0].id;

const inserted = await db.insert(workflows).values({
  tenantId,
  primitiveType: "grid",
  config: {
    title: `${gen.productName} — Studio`,
    archetype: gen.archetype, // stamped so downstream surfaces (digest, accrual) know which translator to read records with
    archetypeConfig: gen.config, // the extracted nouns (targets, threshold, stages…) the translators interpret records against
    schema: { layout_type: "grid", rows: [], columns: [] },
    userPrompt,
    artifactHtml: html,
  },
  schemaVersion: 5,
  isActive: false,
  status: "draft",
}).returning();
const id = inserted[0].id;
await db.update(workflows).set({ lineageId: id }).where(eq(workflows.id, id));

console.log("Workflow ID:", id);
console.log("Owner link (PIN, full console): http://localhost:3000/app/" + id);
console.log("Staff link (PIN, entry view)  : http://localhost:3000/app/" + id + "?as=staff");
console.log("Form link (legacy)            : http://localhost:3000/submit/" + id);
process.exit(0);
