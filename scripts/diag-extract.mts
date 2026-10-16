// Diag: print the full extracted ConsoleConfig for an arbitrary prompt —
// shows how the classifier adapts semantics (features, qty, categories) per domain.
// Usage: npx tsx scripts/diag-extract.mts "prompt text"
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { extractConsoleConfig } = await import("../src/lib/consoles/studio-v2");

const userPrompt = process.argv.slice(2).join(" ") ||
  "I run a cold storage facility. I have 12 freezer racks with 6 shelves each. I want to track which crates are stored on each shelf, what contents, and the target temperature zone.";

const t0 = Date.now();
const cfg = await extractConsoleConfig(userPrompt);
console.log(`extracted in ${Date.now() - t0}ms`);
console.log(JSON.stringify(cfg, null, 2));
process.exit(0);
