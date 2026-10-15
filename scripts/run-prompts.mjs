// Run prompts through the live /api/chat endpoint and print /submit links.
// Usage: node scripts/run-prompts.mjs ["prompt 1", "prompt 2"]  (defaults to a representative corpus)
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const DELAY_MS = Number(process.env.DELAY_MS || 6000);

const DEFAULT_PROMPTS = [
  "petty cash log",
  "track todays total sales for my bakery",
  "daily attendance for 9 staff",
  "invoice form for my store",
  "Daily closing checklist for a cafe with: lights off, cash counted, doors locked, oven cleaned",
  "daily sales targets for 2 staff, Ramesh 20, Suresh 15",
];

const prompts = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_PROMPTS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let authCookie = null;
async function authenticate() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode: "chennai2026" }),
  });
  if (!res.ok) throw new Error(`Login failed: HTTP ${res.status} — ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) authCookie = setCookie.split(";")[0];
  if (!authCookie) throw new Error("No session cookie returned");
}

const results = [];
await authenticate();
for (const prompt of prompts) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authCookie ? { Cookie: authCookie } : {}) },
      body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (data.workflowId) {
      results.push({ prompt, ok: true, secs, id: data.workflowId, layout: data.ui_schema?.layout_type, title: data.app_title, artifact: !!data.artifact, version: data.version });
    } else if (data.message) {
      results.push({ prompt, ok: true, secs, clarification: data.message });
    } else {
      results.push({ prompt, ok: false, secs, error: data.error || `HTTP ${res.status}` });
    }
  } catch (e) {
    results.push({ prompt, ok: false, secs: ((Date.now() - t0) / 1000).toFixed(1), error: e.message });
  }
  await sleep(DELAY_MS);
}

console.log("\n=== RESULTS ===\n");
for (const r of results) {
  if (r.id) {
    console.log(`✅ "${r.prompt}"`);
    console.log(`   ${BASE_URL.replace("127.0.0.1", "localhost")}/submit/${r.id}`);
    console.log(`   title: "${r.title}" | layout: ${r.layout} | v${r.version} | artifact: ${r.artifact} | ${r.secs}s\n`);
  } else if (r.clarification) {
    console.log(`💬 "${r.prompt}" → clarification: "${r.clarification}" (${r.secs}s)\n`);
  } else {
    console.log(`❌ "${r.prompt}" → ${r.error} (${r.secs}s)\n`);
  }
}
