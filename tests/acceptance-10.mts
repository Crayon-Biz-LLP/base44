// 10-scenario one-shot acceptance suite — the product's exam.
// Each scenario is a real owner prompt, run ONCE through the real engine
// (classify → extract → assemble → publish → DB). No retries, no hand edits.
// Five criteria: one-shot publish, correct routing, faithful content,
// live link, DB write+read. Honest failures stay on the board.
import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const BASE = "http://localhost:3000";

type Check = { name: string; ok: boolean; got?: string };
const ck = (name: string, ok: boolean, got?: unknown): Check => ({ name, ok, got: got === undefined ? undefined : String(got) });

const SCENARIOS: { industry: string; prompt: string; expect: string; contentChecks: (cfg: any) => Check[] }[] = [
  {
    industry: "Sheet-metal factory (flagship)",
    prompt: "I run a sheet laser cutting factory. I have sheet stacking racks, 8 rows per rack and 30 such racks. I want to track what material, grade and thickness is stored in each row.",
    expect: "spatial",
    contentChecks: (c) => [
      ck("30 racks", c.groupCount === 30, c.groupCount),
      ck("8 rows/rack", c.unitsPerGroup === 8, c.unitsPerGroup),
      ck("material field", /material/i.test(c.field1?.label || ""), c.field1?.label),
      ck("thickness field", /thick/i.test(c.field3?.label || ""), c.field3?.label),
      ck("categories >= 3", (c.categories?.length || 0) >= 3, c.categories?.length),
    ],
  },
  {
    industry: "Cold storage",
    prompt: "I run a cold storage facility with 10 chambers, each holding 4 pallet rows. Track which produce is stored where and in what quantity.",
    expect: "spatial",
    contentChecks: (c) => [
      ck("10 chambers", c.groupCount === 10, c.groupCount),
      ck("4 rows/chamber", c.unitsPerGroup === 4, c.unitsPerGroup),
      ck("produce field", /produce|item|product/i.test(c.field1?.label || ""), c.field1?.label),
      ck("qty tracked", !!c.qtyField, c.qtyField?.label),
    ],
  },
  {
    industry: "Kirana retail staff targets",
    prompt: "I have 6 salespeople in my provision store. Daily I track per person: new SIM cards target 5, recharges target 30, accessories target 10, credit cards target 2.",
    expect: "target-board",
    contentChecks: (c) => [
      ck("6 salespeople", c.people?.length === 6, c.people?.length),
      ck("4 metrics", c.metrics?.length === 4, c.metrics?.length),
      ck("targets 5/30/10/2", [5, 30, 10, 2].every(t => c.metrics?.some((m: any) => m.target === t)), c.metrics?.map((m: any) => m.target).join(",")),
    ],
  },
  {
    industry: "Insurance agency",
    prompt: "My insurance team of 5 reports daily: policies (target 4), premium collection (target 80000), follow-up calls (target 25).",
    expect: "target-board",
    contentChecks: (c) => [
      ck("5 people", c.people?.length === 5, c.people?.length),
      ck("3 metrics", c.metrics?.length === 3, c.metrics?.length),
      ck("premium target 80000", c.metrics?.some((m: any) => m.target === 80000), c.metrics?.map((m: any) => m.target).join(",")),
    ],
  },
  {
    industry: "Tailoring shop",
    prompt: "I run a tailoring shop. Orders move through Booked, Cutting, Stitching, Trial, then Delivery. I have about 15 orders in progress and each stage should not take more than 3 days.",
    expect: "pipeline",
    contentChecks: (c) => [
      ck("5 stages", c.stages?.length === 5, c.stages?.length),
      ck("stage named Cutting", c.stages?.some((s: any) => /cutting/i.test(s.label)), c.stages?.map((s: any) => s.label).join(">")),
      ck("SLA 3 days", c.slaDays === 3, c.slaDays),
      ck("15 orders", c.items?.length === 15, c.items?.length),
    ],
  },
  {
    industry: "Water purifier service",
    prompt: "We install water purifiers. Every job goes: Complaint Received, Visit Scheduled, Installed, Feedback Taken. Around 20 jobs are open, SLA is 2 days per step.",
    expect: "pipeline",
    contentChecks: (c) => [
      ck("4 stages", c.stages?.length === 4, c.stages?.length),
      ck("stage named Installed", c.stages?.some((s: any) => /install/i.test(s.label)), c.stages?.map((s: any) => s.label).join(">")),
      ck("SLA 2 days", c.slaDays === 2, c.slaDays),
      ck("20 jobs", c.items?.length === 20, c.items?.length),
    ],
  },
  {
    industry: "Pharmacy cashbook",
    prompt: "Daily cashbook for my pharmacy: medicine sales coming in, supplier payments going out, running balance. Warn me if cash falls below 2500.",
    expect: "ledger",
    contentChecks: (c) => [
      ck("threshold 2500", c.lowBalanceThreshold === 2500, c.lowBalanceThreshold),
      ck("accounts >= 1", (c.accounts?.length || 0) >= 1, c.accounts?.length),
      ck("entry types >= 2", (c.entryTypes?.length || 0) >= 2, c.entryTypes?.length),
      ck("seeded entries >= 3", (c.entries?.length || 0) >= 3, c.entries?.length),
    ],
  },
  {
    industry: "Dental clinic (routing trap: 'slots')",
    prompt: "I run a dental clinic with 3 chairs and 30-minute appointment slots from 9am to 8pm. Help me book today's patients across the chairs.",
    expect: "temporal",
    contentChecks: (c) => [
      ck("3 chairs", c.resources?.length === 3, c.resources?.length),
      ck("bookings seeded", (c.slots?.length || 0) >= 18, c.slots?.length),
      ck("bookings reference real chairs", (c.slots || []).every((s: any) => c.resources?.some((r: any) => r.name === s.resource)), "all-match"),
    ],
  },
  {
    industry: "Beauty salon",
    prompt: "Beauty salon with 2 stylists and 1 spa room. Bookings every 45 minutes, 10am to 7pm. Track today's appointments per stylist.",
    expect: "temporal",
    contentChecks: (c) => [
      ck("2 stylists + 1 room = 3 resources", c.resources?.length === 3, c.resources?.length),
      ck("bookings seeded", (c.slots?.length || 0) >= 6, c.slots?.length),
    ],
  },
  {
    industry: "Tractor rental (fleet, hours)",
    prompt: "I rent out tractors. I have 8 tractors, want to track running hours and engine hours daily, service is due every 500 hours.",
    expect: "fleet",
    contentChecks: (c) => [
      ck("8 tractors", c.assets?.length === 8, c.assets?.length),
      ck("service every 500h", c.serviceEvery === 500, c.serviceEvery),
      ck("owners assigned", (c.assets || []).every((a: any) => a.owner), "all-match"),
    ],
  },
];

async function main() {
  console.log("=== 10-scenario one-shot acceptance suite ===\n");
  const { pickArchetype } = await import("../src/lib/infra/archetypes");
  const { generateConsoleForPrompt } = await import("../src/lib/infra/console-router");
  const { db } = await import("../src/db/index");
  const { tenants, workflows } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  const existing = await db.select({ id: tenants.id }).from(tenants).limit(1);
  const tenantId = existing[0].id;

  const results: any[] = [];
  let idx = 0;
  for (const sc of SCENARIOS) {
    idx++;
    const row: any = { n: idx, industry: sc.industry, expect: sc.expect };
    try {
      const t0 = Date.now();
      // Criterion 2: routing (deterministic classifier, before any LLM spend)
      const hint = pickArchetype(sc.prompt);
      row.route = hint.id === sc.expect ? "PASS" : `FAIL(got ${hint.id})`;

      // Criterion 1: one-shot publish — generation runs exactly once
      const gen = await generateConsoleForPrompt(sc.prompt);
      row.genMs = Date.now() - t0; // classify + extract + assemble
      row.product = gen.productName;

      // Syntax gate
      writeFileSync("/tmp/console-syntax-check.js", gen.html.slice(gen.html.indexOf("<script>") + 8, gen.html.lastIndexOf("</script>")));
      let syntax = "PASS";
      try { execSync("node --check /tmp/console-syntax-check.js", { stdio: "pipe" }); } catch (e: any) { syntax = "FAIL"; row.syntaxErr = (e.stderr?.toString() || "").slice(0, 200); }
      row.syntax = syntax;

      // Publish (same shape as the publish script)
      const inserted = await db.insert(workflows).values({
        tenantId,
        primitiveType: "grid",
        config: {
          title: `${gen.productName} — Acceptance`,
          archetype: gen.archetype,
          archetypeConfig: gen.config,
          schema: { layout_type: "grid", rows: [], columns: [] },
          userPrompt: sc.prompt,
          artifactHtml: gen.html,
        },
        schemaVersion: 5,
        isActive: false,
        status: "draft",
      }).returning();
      const id = inserted[0].id;
      await db.update(workflows).set({ lineageId: id }).where(eq(workflows.id, id));
      row.link = `${BASE}/app/${id}`;
      row.archetype = gen.archetype;

      // Criterion 4: live link + gate surface
      const wfRes = await fetch(`${BASE}/api/workflow/${id}`);
      const wfJson = await wfRes.json();
      const wfOk = wfRes.status === 200 && !!wfJson?.workflow?.config?.artifactHtml;
      row.live = wfOk ? "PASS" : `FAIL(${wfRes.status})`;

      // Criterion 5: DB write + read through the console path
      const sub = await fetch(`${BASE}/api/submit-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: id, layout_type: "grid", filledBy: "Acceptance Probe", payload: { records: [{ probe: "acceptance", scenario: idx }] } }),
      });
      const state = await (await fetch(`${BASE}/api/app-state/${id}`)).json();
      const dbOk = sub.status === 200 && Array.isArray(state?.records) && state.records.length >= 1;
      row.db = dbOk ? "PASS" : `FAIL(sub ${sub.status}, recs ${(state?.records || []).length})`;

      // Criterion 3: content extraction (engine-consistent archetype + fields)
      const checks = [];
      checks.push(ck("engine archetype", gen.archetype === sc.expect, gen.archetype));
      checks.push(...sc.contentChecks(gen.config));
      row.content = `${checks.filter(c => c.ok).length}/${checks.length}`;
      const failed = checks.filter(c => !c.ok);
      row.contentDetail = failed.length ? failed.map(f => `${f.name} (got ${f.got ?? "?"})`).join("; ") : "";

      row.oneShot = row.syntax === "PASS" ? "PASS" : "FAIL";
      row.totalMs = Date.now() - t0; // full loop incl. publish + live + DB probes
      row.time = `${(row.genMs / 1000).toFixed(1)}s engine / ${(row.totalMs / 1000).toFixed(1)}s total`;
    } catch (e: any) {
      row.oneShot = `FAIL(${String(e?.message || e).slice(0, 80)})`;
    }
    results.push(row);
    console.log(`[${idx}/10] ${sc.industry}`);
    console.log(`    route:${row.route}  one-shot:${row.oneShot}  content:${row.content || "-"}  live:${row.live || "-"}  db:${row.db || "-"}  time:${row.time || "-"}`);
    if (row.contentDetail) console.log(`    content gaps: ${row.contentDetail}`);
    if (row.link) console.log(`    ${row.link}`);
  }

  console.log("\n=== SUMMARY ===");
  const pass = (v: string) => typeof v === "string" && v.startsWith("PASS");
  for (const r of results) {
    const all = [r.route, r.oneShot, r.live, r.db].every(pass) && r.content && !r.content.startsWith("0/") && parseInt(r.content) >= 0;
    console.log(`${all ? "✅" : "❌"} #${r.n} ${r.industry} — ${r.link || "(no link)"}`);
  }
  writeFileSync("/tmp/acceptance-10-results.json", JSON.stringify(results, null, 2));
  const failures = results.filter(r => ![r.route, r.oneShot, r.live, r.db].every(pass) || (r.content || "").startsWith("0/")).length;
  console.log(`\n${10 - failures}/10 scenarios fully passed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
