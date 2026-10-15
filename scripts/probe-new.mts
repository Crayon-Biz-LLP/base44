// Live one-shot probe for the four NEW archetypes — proves the full pipeline
// (classifier → Gemini extraction → assembler → chassis) on realistic Indian
// SMB prompts. Output HTML lands in /tmp with stable names for review.
import { readFileSync, writeFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { pickArchetype } = await import("../src/lib/infra/archetypes");
const { generateConsoleForPrompt } = await import("../src/lib/infra/console-router");

const CASES = [
  {
    file: "new-queue",
    name: "Jaipur Skin Clinic (queue)",
    prompt: "I run a skin clinic in Jaipur. Walk-in patients take a token at reception and are served in order. Dr. Mehta and Dr. Kaur consult while billing is a separate counter. About 40 patients a day, around 8 minutes each.",
    expect: "queue",
  },
  {
    file: "new-checklist",
    name: "Pune Cloud Kitchen (checklist)",
    prompt: "My cloud kitchen in Pune must run hygiene checklists every day — an opening checklist and a closing checklist, plus an evening hygiene round. Items like chimney exhaust, oil temp, cold storage temperature, waste bins, gas valve. Supervisors Anand and Kavya run the rounds.",
    expect: "checklist",
  },
  {
    file: "new-roster",
    name: "Surat Stitching Unit (roster)",
    prompt: "I run a tailoring unit with 5 tailors paid per piece: Ramesh 55 rupees, Suresh 60, Divya 50, Kavya 55 and Manoj 45. I mark attendance every day and need the monthly payout calculated for each tailor.",
    expect: "roster",
  },
  {
    file: "new-calendar",
    name: "Pharmacy Compliance Diary (calendar)",
    prompt: "My pharmacy needs to track medicine batch expiry dates, the GST filing due dates every month and our drug license renewal. Front desk Lata keeps the diary. Nothing should ever expire without warning.",
    expect: "calendar",
  },
];

for (const c of CASES) {
  const t0 = Date.now();
  const route = pickArchetype(c.prompt);
  try {
    const gen = await generateConsoleForPrompt(c.prompt);
    const ac: any = gen.config;
    writeFileSync(`/tmp/${c.file}.html`, gen.html);
    let extra = "";
    if (gen.archetype === "queue") extra = `counters=[${(ac.counters || []).map((x: any) => x.name).join(",")}] tokens=${(ac.tokens || []).length} avgMin=${ac.avgMinutes}`;
    if (gen.archetype === "checklist") extra = `rounds=[${(ac.rounds || []).map((x: any) => x.name).join(" | ")}] items=${(ac.items || []).length} staff=[${(ac.staff || []).map((x: any) => x.name).join(",")}]`;
    if (gen.archetype === "roster") extra = `workers=${(ac.workers || []).length} rates=[${(ac.workers || []).map((x: any) => x.rate).join(",")}] unit=${ac.unitLabel}`;
    if (gen.archetype === "calendar") extra = `events=${(ac.events || []).length} renewals=${(ac.renewals || []).length} dueIn=[${(ac.renewals || []).map((x: any) => x.dueInDays).join(",")}]`;
    console.log(`✓ ${c.name} → ${gen.archetype} "${gen.productName}" (${Date.now() - t0}ms) | ${extra}`);
  } catch (e: any) {
    console.log(`✗ ${c.name}: classified ${route.id} but extraction failed: ${String(e?.message || e).slice(0, 140)}`);
  }
}
process.exit(0);
