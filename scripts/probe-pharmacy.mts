// Isolated retry of the one failed E2E business (pharmacy ledger).
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { pickArchetype } = await import("../src/lib/pipeline/archetypes");
const { generateConsoleForPrompt } = await import("../src/lib/pipeline/console-router");

const PROMPT = "I run Sri Balaji Pharmacy in Pune. Daily cashbook: medicine sales in, distributor payments out, UPI batches in. Staff Ravi and Meera work the counter. Opening balance around 25000 rupees, alert me below 8000.";
console.log("archetype:", pickArchetype(PROMPT).id);
try {
  const gen = await generateConsoleForPrompt(PROMPT);
  console.log("OK:", gen.archetype, "—", gen.productName);
} catch (e) {
  const err = e as { message?: string; cause?: { message?: string } | string };
  console.log("FAIL:", String(err?.message || e).slice(0, 300));
  if (err?.cause) console.log("CAUSE:", String(typeof err.cause === "string" ? err.cause : err.cause.message).slice(0, 300));
}
process.exit(0);
