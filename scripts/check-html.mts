// Tiny CLI: run the zero-LLM artifact validator on built HTML files.
// Usage: npx tsx scripts/check-html.mts <file.html> [more.html...]
import { readFileSync } from "node:fs";
import { validateArtifact } from "../src/lib/infra/validate-artifact";

let bad = 0;
for (const f of process.argv.slice(2)) {
  const v = validateArtifact(readFileSync(f, "utf8"));
  const tag = v.ok ? "PASS" : "FAIL";
  if (!v.ok) bad++;
  console.log(`${tag}  ${f}  (${v.errors.length} errors, ${v.warnings.length} warnings)`);
  for (const e of v.errors) console.log(`      ✗ [${e.rule}] ${e.detail}`);
}
process.exit(bad ? 1 : 0);
