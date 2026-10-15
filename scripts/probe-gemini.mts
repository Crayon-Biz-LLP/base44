// Gemini probe — per-key, per-model diagnosis for the "high demand" 503s.
// Direct REST (no SDK) so we see raw status codes. Prints key prefixes only —
// never full keys. Usage: npx tsx scripts/probe-gemini.mts
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const keys = [
  ["KEY_1", process.env.GOOGLE_GENERATIVE_AI_API_KEY],
  ["KEY_2", process.env.GOOGLE_GENERATIVE_AI_API_KEY_2],
  ["KEY_3", process.env.GOOGLE_GENERATIVE_AI_API_KEY_3],
].filter(([, v]) => typeof v === "string" && v.length > 0) as [string, string][];

const MODELS = ["gemini-3.1-flash-lite", "gemini-2.0-flash"];

function mask(k: string): string {
  return k.slice(0, 6) + "…" + (k.startsWith("AIza") ? "AIza-key" : "AQ-key");
}

async function probe(label: string, key: string, model: string): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word: ok" }] }] }),
    });
    const retryAfter = res.headers.get("retry-after");
    if (res.ok) {
      console.log(`${label} × ${model}: 200 OK`);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } };
    const msg = (body.error?.message || "").slice(0, 90).replace(/\n/g, " ");
    console.log(`${label} × ${model}: ${res.status} ${body.error?.status || ""} ${msg}${retryAfter ? ` (retry-after: ${retryAfter})` : ""}`);
  } catch (e: any) {
    console.log(`${label} × ${model}: NETWORK ${e?.message?.slice(0, 80)}`);
  }
}

console.log(`probing ${keys.length} key(s) × ${MODELS.length} model(s)…\n`);
for (const [label, key] of keys) {
  for (const model of MODELS) {
    await probe(mask(key), key, model);
  }
  console.log("");
}
process.exit(0);
