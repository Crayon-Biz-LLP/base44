// One-prompt extraction probe — is the cold-storage failure deterministic or
// flash-lite variance? Runs the real extractor N times, no dev server needed.
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { extractConsoleConfig } = await import("../src/lib/infra/studio-v2");

const PROMPT = "I run a cold storage facility with 10 chambers, each holding 4 pallet rows. Track which produce is stored where and in what quantity.";
const RUNS = 3;

for (let i = 1; i <= RUNS; i++) {
  try {
    const cfg = await extractConsoleConfig(PROMPT);
    console.log(`[${i}/${RUNS}] OK — ${cfg.productName} | ${cfg.groupCount} ${cfg.groupLabel}s × ${cfg.unitsPerGroup} ${cfg.countLabel}s | fields: ${cfg.field1.label}/${cfg.field2.label}/${cfg.field3.label}`);
  } catch (e) {
    console.log(`[${i}/${RUNS}] FAIL — ${String((e as { message?: string })?.message || e).slice(0, 200)}`);
  }
}
process.exit(0);
