// 10-tenant end-to-end test — the full product promise, exercised:
//   1. Ten Indian-market businesses → owner-voice prompts
//   2. One-shot generation (classify → extract → assemble → gates → DB)
//   3. Two links per business: owner dashboard + staff entry (staff PIN)
//   4. Staff logs data through the real API → DB integrity verified per tenant
// Zero fixtures: every console is Gemini-extracted from its prompt, live.
// Usage: npx tsx scripts/e2e-india.mts   (dev server must be up)
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { pickArchetype } = await import("../src/lib/infra/archetypes");
const { generateConsoleForPrompt } = await import("../src/lib/infra/console-router");
const { validateArtifact } = await import("../src/lib/infra/validate-artifact");

// ---- 10 businesses that resonate with the Indian market --------------------
const BUSINESSES: { name: string; prompt: string }[] = [
  { name: "Anand Sweets & Savouries", prompt: "I run Anand Sweets in Jayanagar, Bangalore. 8 counter racks, each with 4 trays. My counter staff Meera, Ravi and Lakshmi record which sweets are in which tray and how many kilos." },
  { name: "Sri Balaji Pharmacy", prompt: "I run Sri Balaji Pharmacy in Pune. Daily cashbook: medicine sales in, distributor payments out, UPI batches in. Staff Ravi and Meera work the counter. Opening balance around 25000 rupees, alert me below 8000." },
  { name: "Chennai Silks Tailoring", prompt: "I run a tailoring unit in T. Nagar, Chennai. 6 tailors. Orders move through Booked, Cutting, Stitching, Trial, Delivery. 24 orders in flight. Tailors Suresh, Divya, Kavya and Manoj report daily." },
  { name: "Gupta Electronics Repair", prompt: "I run an electronics repair shop in Karol Bagh, Delhi. Track each repair job: Received, Diagnosed, Repairing, Ready, Delivered. 15 repairs open now. Technicians Vimlesh and Santosh." },
  { name: "Sharma Dental Clinic", prompt: "I run a dental clinic in Indore with 3 chairs and 30-minute appointment slots from 9am to 1pm and 5pm to 8pm. Dentists Dr. Meera and Dr. Arjun." },
  { name: "Patel Farm Equipment Rental", prompt: "I rent out tractors and tillers in Anand, Gujarat. 6 machines. Track running hours and service. Operators Bhavesh and Dipak log the hours." },
  { name: "Lakshmi Kirana Store", prompt: "My kirana store in Indore has 12 shelves with 6 bins each. Track what's stored on each shelf bin and how many packets. Helpers Anu, Priya and Karthik." },
  { name: "Royal Motors Two-Wheelers", prompt: "My two-wheeler showroom floor has 5 sales staff with daily targets: new vehicle bookings target 6, insurance 8, accessories 10, service bookings 12. Staff: Rahul, Sneha, Amit, Pooja, Vikram." },
  { name: "Meenakshi Textiles Wholesale", prompt: "I run a wholesale textile shop in Surat. 10 shelving racks with 5 rows of fabric bales each. Track fabric type, grade and bale counts. Godown staff Ganesh and Vicky." },
  { name: "Sunrise Tuition Centre", prompt: "I run a tuition centre with 4 teachers. Each teacher takes 6 half-hour slots daily from 4pm to 8pm. Teachers Priya, Anand, Divya and Suresh." },
];

const BASE = "http://localhost:3000";
const OWNER_PIN = "2468";
const STAFF_PIN = "1357";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function syntaxGate(html: string): boolean {
  try {
    writeFileSync("/tmp/console-syntax-check.js", html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>")));
    execSync("node --check /tmp/console-syntax-check.js", { stdio: "pipe" });
    return true;
  } catch { return false; }
}

async function main() {
  console.log(`=== 10-tenant E2E — ${BUSINESSES.length} businesses, one-shot each ===\n`);
  let pass = 0, fail = 0;
  const lines: string[] = [];

  for (const b of BUSINESSES) {
    const t0 = Date.now();
    try {
      // 1. Test account (tenant): owner PIN + staff PIN
      const { db } = await import("../src/db/index");
      const { tenants, workflows, events } = await import("../src/db/schema");
      const { eq } = await import("drizzle-orm");
      const ins = await db.insert(tenants).values({ name: b.name, accessCode: OWNER_PIN, staffPin: STAFF_PIN, tier: "starter" } as any).returning();
      const tenantId = ins[0].id;

      // 2. One-shot generation through the production router
      const hint = pickArchetype(b.prompt);
      const gen = await generateConsoleForPrompt(b.prompt);
      const ms = Date.now() - t0;

      // 3. Gates: syntax + artifact validator
      const syntax = syntaxGate(gen.html);
      const v = validateArtifact(gen.html);
      if (!syntax || !v.ok) throw new Error(`gates failed (syntax=${syntax}, artifact=${v.ok}: ${v.errors.map(e => e.rule).join(",")})`);

      // 4. Publish row (same shape as the publish script)
      const wIns = await db.insert(workflows).values({
        tenantId,
        primitiveType: "grid",
        config: {
          title: `${gen.productName} — E2E`,
          archetype: gen.archetype,
          archetypeConfig: gen.config,
          schema: { layout_type: "grid", rows: [], columns: [] },
          userPrompt: b.prompt,
          artifactHtml: gen.html,
        },
        schemaVersion: 5,
        isActive: false,
        status: "draft",
      }).returning();
      const wfId = wIns[0].id;
      await db.update(workflows).set({ lineageId: wfId }).where(eq(workflows.id, wfId));

      // 5. Data integrity: staff logs through the REAL API, round-trips the DB
      const sess = await fetch(`${BASE}/api/workflow/staff-session`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: STAFF_PIN, staffName: "E2E Staff", tenantId }),
      });
      const sessOk = (await sess.json()).success === true;
      // Live data endpoints are tenant-private now — carry the signed session.
      const cookiePair = (sess.headers.get("set-cookie") || "").split(";")[0];
      const cookieHeaders: Record<string, string> = cookiePair ? { cookie: cookiePair } : {};

      const probe = { workflowId: wfId, filledBy: "E2E Staff", layout_type: "grid", payload: { records: [{ probe: "e2e-india", business: b.name, at: new Date().toISOString() }] } };
      const sub = await fetch(`${BASE}/api/submit-form`, { method: "POST", headers: { "Content-Type": "application/json", ...cookieHeaders }, body: JSON.stringify(probe) });
      const subOk = sub.status === 200;

      await sleep(300);
      const st = await (await fetch(`${BASE}/api/app-state/${wfId}`, { headers: cookieHeaders })).json();
      const roundTrip = Array.isArray(st.records) && st.records.some((r: any) => r?.probe === "e2e-india" && r?.business === b.name);

      const evRows = await db.select().from(events).where(eq(events.workflowId, wfId));
      const evOk = evRows.length >= 1 && evRows[0].status === "confirmed" && evRows[0].filledBy === "E2E Staff";

      const ok = sessOk && subOk && roundTrip && evOk;
      if (ok) pass++; else fail++;
      const tag = ok ? "✓" : "✗";
      console.log(`${tag} ${b.name}`);
      console.log(`    archetype: ${gen.archetype} (${gen.productName}) · ${ms}ms · gates: syntax+artifact OK`);
      console.log(`    integrity: session=${sessOk} submit=${subOk} roundtrip=${roundTrip} event=${evOk}${evRows.length ? ` (confirmed, filledBy=${evRows[0].filledBy})` : ""}`);
      console.log(`    owner: ${BASE}/app/${wfId}   (PIN ${OWNER_PIN})`);
      console.log(`    staff: ${BASE}/app/${wfId}?as=staff   (PIN ${STAFF_PIN})`);
      lines.push(`${ok ? "✓" : "✗"} ${b.name} — ${gen.archetype} — owner ${BASE}/app/${wfId} — staff ${BASE}/app/${wfId}?as=staff`);
    } catch (e: any) {
      fail++;
      console.log(`✗ ${b.name}: ${String(e?.message || e).slice(0, 160)}`);
      lines.push(`✗ ${b.name} — FAILED: ${String(e?.message || e).slice(0, 100)}`);
    }
  }

  console.log(`\n=== ${pass}/${BUSINESSES.length} tenants passed, ${fail} failed ===`);
  writeFileSync("/tmp/e2e-india-links.txt", lines.join("\n") + "\n");
  console.log("links written to /tmp/e2e-india-links.txt");
  process.exit(fail > 0 ? 1 : 0);
}

main();
