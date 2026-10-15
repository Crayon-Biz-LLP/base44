// Peek at the generated artifact: print structural markers + save to /tmp for inspection.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { db } = await import("../src/db/index");
const { workflows } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");

const id = process.argv[2] || "0b618ca0-4a43-4c4d-94ca-ea90d109d3b1";
const rows = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
const cfg = rows[0].config as Record<string, unknown>;
const html = cfg.artifactHtml as string;

const markers = {
  length: html.length,
  opsKit: html.includes('id="ops-ds"'),
  tailwindCDN: html.includes("cdn.tailwindcss.com"),
  customTailwindTheme: html.includes("tailwind.config"),
  googleFonts: (html.match(/fonts\.googleapis\.com/g) || []).length,
  tabs: /viewTab|tab-btn|data-tab|switchView/i.test(html),
  kpiCards: (html.match(/stat[A-Z]\w+|kpi/i) || []).length,
  gridOf30: /30|grid-cols/i.test(html),
  rackCards: (html.match(/rack/i) || []).length,
  heroInput: /ops-hero|hero-input/i.test(html),
  productTitle: (html.match(/<title>([^<]+)<\/title>/) || [])[1],
  h1: (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]?.replace(/<[^>]+>/g, "").trim().slice(0, 60),
  savePath: html.includes("__opsDeskSubmit__"),
  formAction: /<form[^>]*action=/i.test(html),
};

console.log(JSON.stringify(markers, null, 2));

writeFileSync("/tmp/rack-artifact.html", html);
console.log("\nSaved to /tmp/rack-artifact.html");
console.log("\n--- First 80 lines ---");
console.log(html.split("\n").slice(0, 80).join("\n"));
