// ENGINE 1 (Studio) verification: the two-engine split — Engine 1 only
// (exemplar + craft rules, zero contract weight). Prints canonical anatomy
// score. Contract wiring is Engine 2's job, later.
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { generateStudioConsole, studioAnatomyScore } = await import("../src/lib/infra/studio");

const RACK_PROMPT = `I run a sheet lazer cutting factory. I have sheet stacking racks, 8 rows per rack and 30 such racks, i want to track what material, grade and thickness is stored in each of the rows in these 30 racks. Eventually I want to manage the storage efficiently. Build me a form or an app for this.`;

const t0 = Date.now();
const html = await generateStudioConsole({ userPrompt: RACK_PROMPT });
if (!html) {
  console.error("Studio produced no HTML");
  process.exit(1);
}
writeFileSync("/tmp/studio-rack.html", html);

const count = (re: RegExp) => (html.match(re) || []).length;
console.log("=== ENGINE 1 (Studio) RUN — exemplar-driven, zero contract ===");
console.log("chars          :", html.length);
console.log("elapsed        :", `${Date.now() - t0}ms`);
console.log("anatomy score  :", `${studioAnatomyScore(html)}/12`);
console.log("title          :", (html.match(/<title>([^<]*)<\/title>/i) || [])[1]);
console.log("30x8 loops     :", count(/for\s*\(\s*(let|var)\s+\w+\s*=\s*1\s*;\s*\w+\s*<=\s*(30|8)/i));
console.log("rack cards     :", count(/Rack\s*\$\{|\bRack\b/gi) > 5);
console.log("kpi hooks      :", count(/id="kpi[A-Za-z]*"|id="bar[A-Za-z]*"/i));
console.log("tabs/views     :", count(/mapView|detailView|listView|switchView/i));
console.log("demo seed      :", /seedDemo|Clear demo data/i.test(html));
console.log("search         :", html.includes('id="search"'));
console.log("localStorage   :", count(/localStorage/i));
console.log("CDN scripts    :", count(/<script[^>]*src=/i), "(must be 0)");
console.log("rack groups    :", count(/Rack\s*\$\{r\}|Rack\s*'\s*\+\s*r|Rack \$\{|group/i) > 2);
console.log("\nSaved to /tmp/studio-rack.html");
