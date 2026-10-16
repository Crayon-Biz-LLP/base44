// Fresh one-shot for the three businesses the owner flagged — proves the
// archetype/dialect/service fixes land end-to-end.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { pickArchetype } = await import("../src/lib/infra/archetypes");
const { generateConsoleForPrompt } = await import("../src/lib/infra/console-router");
import type { ChassisArchetype } from "../src/lib/infra/artifact-design";

const CASES = [
  { name: "Sunrise Tuition Centre", prompt: "I run a tuition centre with 4 teachers. Each teacher takes 6 half-hour slots daily from 4pm to 8pm. Teachers Priya, Anand, Divya and Suresh." },
  { name: "Meenakshi Textiles Wholesale", prompt: "I run a wholesale textile shop in Surat. 10 shelving racks with 5 rows of fabric bales each. Track fabric type, grade and bale counts. Godown staff Ganesh and Vicky." },
  { name: "Patel Farm Equipment Rental", prompt: "I rent out tractors and tillers in Anand, Gujarat. 6 machines. Track running hours and service. Operators Bhavesh and Dipak log the hours." },
];

type Ac = {
  features?: unknown;
  field3?: { label?: string };
  serviceUnit?: string;
  assets?: { lastService?: number }[];
  resources?: { name?: string }[];
  slots?: unknown[];
};

for (const c of CASES) {
  const route = pickArchetype(c.prompt);
  try {
    const gen = await generateConsoleForPrompt(c.prompt);
    const ac = gen.config as Ac;
    writeFileSync(`/tmp/fix-${route.id}-${Date.now()}.html`, gen.html);
    let extra = "";
    if (gen.archetype === "spatial") extra = `features=${JSON.stringify(ac.features)} zoneUnit=${(ac.field3?.label || "").match(/\(([^)]+)\)/)?.[1] || "mm"}`;
    if (gen.archetype === "fleet") extra = `serviceUnit=${ac.serviceUnit} lastService=[${(ac.assets || []).map((a) => a.lastService).join(",")}] overdue-clock=${gen.html.includes("OVERDUE")} markServiced=${gen.html.includes("markServiced")}`;
    if (gen.archetype === "temporal") extra = `resources=[${(ac.resources || []).map((r) => r.name).join(",")}] slots=${(ac.slots || []).length}`;
    console.log(`✓ ${c.name} → ${gen.archetype} (${gen.productName}) | ${extra}`);
  } catch (e) {
    console.log(`✗ ${c.name}: ${String((e as { message?: string })?.message || e).slice(0, 120)}`);
  }
}
process.exit(0);
