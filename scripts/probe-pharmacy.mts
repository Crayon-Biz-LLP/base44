// Isolated retry of the one failed E2E business (pharmacy ledger).
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { pickArchetype } = await import("../src/lib/infra/archetypes");
const { generateConsoleForPrompt } = await import("../src/lib/infra/console-router");

const PROMPT = "I run Sri Balaji Pharmacy in Pune. Daily cashbook: medicine sales in, distributor payments out, UPI batches in. Staff Ravi and Meera work the counter. Opening balance around 25000 rupees, alert me below 8000.";
console.log("archetype:", pickArchetype(PROMPT).id);
try {
  const gen = await generateConsoleForPrompt(PROMPT);
  console.log("OK:", gen.archetype, "—", gen.productName);
} catch (e: any) {
  console.log("FAIL:", String(e?.message || e).slice(0, 300));
  if (e?.cause) console.log("CAUSE:", String(e.cause?.message || e.cause).slice(0, 300));
}
process.exit(0);
