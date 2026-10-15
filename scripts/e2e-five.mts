// 5-business one-shot E2E — new scenarios, surfaces the original 10-tenant run
// never touched: token queue, kitchen checklist, renewal calendar, payroll
// roster, and a parts-billing pipeline. Each business = one prompt → one shot
// → gates → live console + staff data round-trip through the real APIs.
//
// Differences vs e2e-india: consoles are published as the ACTIVE head (the
// dashboard overview shows them), and the probe carries the signed staff
// cookie (app-tier endpoints are tenant-private since the auth hardening).
// Dev server must be up. Usage: npx tsx scripts/e2e-five.mts
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { pickArchetype } = await import("../src/lib/infra/archetypes");
const { generateConsoleForPrompt } = await import("../src/lib/infra/console-router");
const { validateArtifact } = await import("../src/lib/infra/validate-artifact");

const BUSINESSES: { name: string; prompt: string }[] = [
  {
    name: "DermaGlow Clinic",
    prompt:
      "I run DermaGlow skin clinic in Koramangala, Bangalore. 2 counters — Dr. Rao and therapist Neha. Tokens for patients, about 12 minutes per consultation, 9 patients waiting this morning.",
  },
  {
    name: "Hotel Green Leaf",
    prompt:
      "I run Hotel Green Leaf in Mysore. Kitchen checklist every day: Morning prep, Evening prep and Closing with items like fridge temperature, oil change, counter wipe. Staff Ravi, Lakshmi and Kiran do the rounds, pass target 90%.",
  },
  {
    name: "BrightSmile Dental",
    prompt:
      "My dental practice BrightSmile in Pune needs a renewal calendar. Front desk handled by Asha. Track renewals: implant checkup 5 days away, braces review in 12 days, scaling due in 45 days, X-ray archive in 90 days, and one payment overdue by 3 days.",
  },
  {
    name: "Rajput Stitching Unit",
    prompt:
      "Tailoring unit in Jaipur. 5 tailors — Ramesh 55, Suresh 60, Divya 50, Kavya 55, Ganesh 45 rupees per piece. Track daily attendance full day, half day or absent and month tally to settle at month end.",
  },
  {
    name: "Khan Mobile Repair",
    prompt:
      "Mobile repair shop in Old Delhi. Job cards move Received, Diagnosed, Repairing, Ready, Delivered. 10 jobs in flight. Technicians Imran and Salim. Parts: screens 1200 rupees, batteries 700, charging ports 300. Only I move cards into Delivered.",
  },
];

const BASE = "http://localhost:3000";
const OWNER_PIN = "2468";
const STAFF_PIN = "1357";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function syntaxGate(html: string): boolean {
  try {
    writeFileSync("/tmp/five-syntax-check.js", html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>")));
    execSync("node --check /tmp/five-syntax-check.js", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`=== 5-business one-shot E2E — ${BUSINESSES.length} new scenarios ===\n`);
  let pass = 0;
  let fail = 0;
  const lines: string[] = [];

  for (const b of BUSINESSES) {
    const t0 = Date.now();
    try {
      // 1. Tenant
      const { db } = await import("../src/db/index");
      const { tenants, workflows, events, locations } = await import("../src/db/schema");
      const { eq } = await import("drizzle-orm");
      const ins = await db.insert(tenants).values({ name: b.name, accessCode: OWNER_PIN, staffPin: STAFF_PIN, tier: "starter" } as any).returning();
      const tenantId = ins[0].id;

      // 2. One-shot generation through the production router
      const hint = pickArchetype(b.prompt);
      const gen = await generateConsoleForPrompt(b.prompt);
      const ms = Date.now() - t0;

      // 3. Gates
      const syntax = syntaxGate(gen.html);
      const v = validateArtifact(gen.html);
      if (!syntax || !v.ok) throw new Error(`gates failed (syntax=${syntax}, artifact=${v.ok}: ${v.errors.map((e) => e.rule).join(",")})`);

      // 4. Publish as the ACTIVE head (dashboard shows it)
      const wIns = await db.insert(workflows).values({
        tenantId,
        primitiveType: "grid",
        config: {
          title: `${gen.productName} — ${b.name}`,
          archetype: gen.archetype,
          archetypeConfig: gen.config,
          schema: { layout_type: "grid", rows: [], columns: [] },
          userPrompt: b.prompt,
          artifactHtml: gen.html,
        },
        lineageId: crypto.randomUUID(),
        schemaVersion: 5,
        configVersion: 1,
        isActive: true,
        status: "published",
      }).returning();
      const wfId = wIns[0].id;
      await db.update(workflows).set({ lineageId: wfId }).where(eq(workflows.id, wfId));

      // 5. Staff session + probe through the REAL gated APIs
      const sess = await fetch(`${BASE}/api/workflow/staff-session`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: STAFF_PIN, staffName: "E2E Staff", tenantId }),
      });
      const sessOk = (await sess.json()).success === true;
      const cookiePair = (sess.headers.get("set-cookie") || "").split(";")[0];
      const cookieHeaders: Record<string, string> = { "Content-Type": "application/json", ...(cookiePair ? { cookie: cookiePair } : {}) };

      const loc = (await db.select().from(locations).where(eq(locations.tenantId, tenantId)).limit(1))[0]
        ?? (await db.insert(locations).values({ tenantId, name: "Main Branch" }).returning())[0];
      const probe = {
        workflowId: wfId, filledBy: "E2E Staff", layout_type: "grid",
        payload: { records: [{ probe: "e2e-five", business: b.name, at: new Date().toISOString() }] },
      };
      const sub = await fetch(`${BASE}/api/submit-form`, { method: "POST", headers: cookieHeaders, body: JSON.stringify(probe) });
      const subOk = sub.status === 200;

      await sleep(300);
      const st = await (await fetch(`${BASE}/api/app-state/${wfId}`, { headers: { cookie: cookiePair } })).json();
      const roundTrip = Array.isArray(st.records) && st.records.some((r: any) => r?.probe === "e2e-five");

      const ok = sessOk && subOk && roundTrip;
      if (ok) pass++;
      else fail++;
      console.log(`${ok ? "✓" : "✗"} ${b.name}`);
      console.log(`    archetype: ${gen.archetype} (classifier: ${hint.id}${hint.id === gen.archetype ? "" : " → routed " + gen.archetype}) · ${gen.productName} · ${ms}ms · gates OK`);
      console.log(`    integrity: session=${sessOk} submit=${subOk} roundtrip=${roundTrip}`);
      console.log(`    owner: ${BASE}/app/${wfId}          (PIN ${OWNER_PIN})`);
      console.log(`    staff: ${BASE}/app/${wfId}?as=staff   (PIN ${STAFF_PIN})`);
      lines.push(`${ok ? "✓" : "✗"} ${b.name} — ${gen.archetype} — owner ${BASE}/app/${wfId} — staff ${BASE}/app/${wfId}?as=staff`);
    } catch (e: any) {
      fail++;
      console.log(`✗ ${b.name}: ${String(e?.message || e).slice(0, 200)}`);
      lines.push(`✗ ${b.name} — FAILED: ${String(e?.message || e).slice(0, 120)}`);
    }
  }

  console.log(`\n=== ${pass}/${BUSINESSES.length} passed ===`);
  writeFileSync("/tmp/e2e-five-links.txt", lines.join("\n") + "\n");
  console.log("links written to /tmp/e2e-five-links.txt");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
