// Runs the browser behavioral suites against a freshly-seeded fixture set.
// Reads the env map written by scripts/seed-behavior.mts and spawns each test
// (each calls process.exit, so they cannot share one process).
//
// Usage: npx tsx scripts/seed-behavior.mts && npx tsx tests/behavior-all.mts
// (the dev server must be up)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = "/tmp/opsdesk-behavior-env.json";
if (!existsSync(ENV_FILE)) {
  console.error(`Missing ${ENV_FILE} — run \`npx tsx scripts/seed-behavior.mts\` first.`);
  process.exit(1);
}
const env = JSON.parse(readFileSync(ENV_FILE, "utf8")) as Record<string, string>;

const TESTS = [
  "target-board-behavior",
  "fleet-behavior",
  "pipeline-behavior",
  "lifecycle-behavior",
  "ledger-behavior",
  "temporal-behavior",
  "studio-behavior",
  "entry-behavior",
];

const failed: string[] = [];
for (const t of TESTS) {
  console.log(`\n──────── ${t} ────────`);
  try {
    execFileSync("npx", ["tsx", `tests/${t}.mts`], { stdio: "inherit", env: { ...process.env, ...env } });
  } catch {
    failed.push(t);
  }
}

console.log(`\n${TESTS.length - failed.length}/${TESTS.length} behavior suites passed`);
if (failed.length) {
  console.error(`failed: ${failed.join(", ")}`);
  process.exit(1);
}
