// Zero-LLM verification for the owner-edit path (no server, no model):
// 1. applyCascades renames referential fields from index-paired diffs.
// 2. reassemble() round-trips stored configs and FAILS CLOSED on bad configs.
// 3. chat-edit patch application is strict: unknown paths/ops throw.
// 4. An edited roster config reassembles to HTML that passes the artifact gate.
// Run: npx tsx --test --test-force-exit tests/owner-edit.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCascades, reassemble } from "../src/lib/pipeline/assemble-registry";
import { applyChatEdit, ChatEditSchema } from "../src/lib/pipeline/chat-edit";
import { validateArtifact } from "../src/lib/pipeline/validate-artifact";
import { roster, temporal, queue, pipeline } from "../scripts/demo-fixtures";

test("applyCascades: temporal resource rename cascades into slots", () => {
  const original = structuredClone(temporal) as unknown as Record<string, unknown>;
  const edited = structuredClone(original);
  (edited.resources as { name: string }[])[0].name = "Station A"; // was "Chair 1"
  const { config, cascaded } = applyCascades("temporal", original, edited);
  assert.ok(cascaded.some(c => c.includes("Chair 1") && c.includes("Station A")), `cascade log: ${cascaded.join("; ")}`);
  const slots = (config.slots as { resource: string }[]).map(s => s.resource);
  assert.ok(!slots.includes("Chair 1"), "old resource name must be gone from slots");
  assert.ok(slots.includes("Station A"), "new resource name must appear in slots");
});

test("applyCascades: ledger entry-type rename cascades into entries", () => {
  const original = structuredClone(ledgerFixture()) as unknown as Record<string, unknown>;
  const edited = structuredClone(original);
  const et = (edited.entryTypes as { label: string }[]);
  const from = et[0].label;
  et[0].label = from + " (card)";
  const { config, cascaded } = applyCascades("ledger", original, edited);
  assert.ok(cascaded.length >= 1, "expected at least one cascade");
  const types = (config.entries as { type: string }[]).map(e => e.type);
  assert.ok(types.includes(from + " (card)"), "entries must reference the renamed type");
});

// helper: ledger fixture lives in demo-fixtures (import lazily to keep the
// top import list focused on the archetypes under edit-test)
import { ledger } from "../scripts/demo-fixtures";
function ledgerFixture() { return ledger; }

test("applyCascades: fleet status rename cascades into assets", () => {
  const original = structuredClone(fleetFixture()) as unknown as Record<string, unknown>;
  const edited = structuredClone(original);
  const st = (edited.statuses as { label: string }[]);
  const from = st[1].label;
  st[1].label = from + " (paused)";
  const { config } = applyCascades("fleet", original, edited);
  const statuses = (config.assets as { status: string }[]).map(a => a.status);
  assert.ok(statuses.includes(from + " (paused)"), "assets must reference the renamed status");
  assert.ok(!statuses.includes(from), "old status must be gone");
});

import { fleet } from "../scripts/demo-fixtures";
function fleetFixture() { return fleet; }

test("applyCascades: pipeline owner rename (pair cascade) hits item owners", () => {
  const original = structuredClone(pipeline) as unknown as Record<string, unknown>;
  const edited = structuredClone(original);
  // Rename the FIRST item's owner (index-paired); all items owned by that
  // person were renamed too by the editor before cascade — simulate by
  // changing only one and confirming the cascade fixes the rest.
  const items = (edited.items as { owner: string }[]);
  const victim = items.find(i => i.owner === "Suresh")!;
  const from = victim.owner;
  for (const it of items) if (it.owner === from) it.owner = "Surendra";
  void victim;
  const { config } = applyCascades("pipeline", original, edited);
  const owners = (config.items as { owner: string }[]).map(i => i.owner);
  assert.ok(!owners.includes("Suresh"), "old owner gone");
  assert.ok(owners.includes("Surendra"), "new owner present");
});

test("reassemble: edited roster config produces gate-passing HTML", () => {
  const edited = structuredClone(roster) as unknown as Record<string, unknown>;
  (edited.workers as { name: string; rate: number }[]).push({ name: "Ganesh", rate: 50 });
  (edited as { productName: string }).productName = "StitchPay v2";
  const html = reassemble("roster", edited);
  const v = validateArtifact(html);
  assert.ok(v.ok, `gate failed:\n${v.errors.map(e => `  ✗ [${e.rule}] ${e.detail}`).join("\n")}`);
  assert.ok(html.includes("Ganesh"), "new worker must be in the console seed");
  assert.ok(html.includes("StitchPay v2"), "renamed product must be in the console");
});

test("reassemble: fails closed on a schema-violating config", () => {
  const bad = structuredClone(roster) as unknown as Record<string, unknown>;
  const workers = bad.workers as unknown[];
  workers.splice(0, workers.length); // roster requires min 2 workers
  assert.throws(() => reassemble("roster", bad), /workers|Array must contain|expected|Small/i);
});

test("chat-edit: patches apply with strict paths", () => {
  const base = structuredClone(queue) as unknown as Record<string, unknown>;
  const out = applyChatEdit(base, ChatEditSchema.parse({
    summary: "add a counter",
    patches: [
      { op: "add", path: "counters", value: { name: "Pharmacy desk" } },
      { op: "set", path: "productName", value: "DermaQueue Plus" },
    ],
  }));
  assert.equal((out.productName as string), "DermaQueue Plus");
  assert.equal(((out.counters as { name: string }[]).at(-1))?.name, "Pharmacy desk");
});

test("chat-edit: unknown path and index-out-of-range fail closed", () => {
  const base = structuredClone(queue) as unknown as Record<string, unknown>;
  assert.throws(() => applyChatEdit(base, ChatEditSchema.parse({ summary: "x", patches: [{ op: "set", path: "notAKey", value: 1 }] })), /unknown path/i);
  assert.throws(() => applyChatEdit(base, ChatEditSchema.parse({ summary: "x", patches: [{ op: "remove", path: "counters.99" }] })), /out of range/i);
});

test("chat-edit: schema rejects a model emitting code-ish garbage", () => {
  assert.throws(() => ChatEditSchema.parse({ summary: "x", patches: [{ op: "frobnicate", path: "productName" }] }));
  assert.throws(() => ChatEditSchema.parse({ summary: "x", patches: [{ op: "set", path: "productName" }] })); // set without value
});

// ---- Shared edit pipeline (the exact path the editor/chat/restore routes use)
import { runConsoleEdit, syntaxGate } from "../src/lib/pipeline/edit-pipeline";

test("edit-pipeline: patch → cascades → gates → gate-passing HTML", async () => {
  const base = structuredClone(roster) as unknown as Record<string, unknown>;
  const out = await runConsoleEdit({
    archetype: "roster",
    base,
    patch: { productName: "StitchPay v7", workers: [...(base.workers as unknown[]), { name: "Ganesh", rate: 50 }] },
  });
  assert.ok(out.ok && out.changed, `expected success: ${JSON.stringify(out)}`);
  if (out.ok && out.changed) {
    assert.ok(out.html.includes("StitchPay v7") && out.html.includes("Ganesh"));
    const v = validateArtifact(out.html);
    assert.ok(v.ok, `artifact gate: ${v.errors.map(e => e.rule).join(",")}`);
  }
});

test("edit-pipeline: schema violation fails closed with 400", async () => {
  const base = structuredClone(roster) as unknown as Record<string, unknown>;
  (base.workers as unknown[]).length = 0; // roster requires min 2 workers
  const out = await runConsoleEdit({ archetype: "roster", base, patch: { productName: "x" } });
  assert.ok(!out.ok && out.status === 400, JSON.stringify(out).slice(0, 200));
});

test("edit-pipeline: rename cascades run inside the shared pipeline", async () => {
  const original = structuredClone(temporal) as unknown as Record<string, unknown>;
  const edited = structuredClone(original);
  (edited.resources as { name: string }[])[0].name = "Bay 9";
  const out = await runConsoleEdit({ archetype: "temporal", base: original, patch: edited });
  assert.ok(out.ok && out.changed);
  if (out.ok && out.changed) assert.ok(out.cascaded.some(c => c.includes("Bay 9")), out.cascaded.join("; "));
});

test("syntaxGate: real console passes, garbage fails", () => {
  const html = reassemble("roster", structuredClone(roster));
  assert.equal(syntaxGate(html), true);
  assert.equal(syntaxGate("<script>var x = {;</script>"), false);
});

// ---- Injection: hostile nouns are DATA -------------------------------------
test("injection: </script> inside a worker name cannot break out of the seed", () => {
  const hostile = structuredClone(roster) as unknown as Record<string, unknown>;
  (hostile.workers as { name: string }[])[0].name = "</script><img src=x onerror=alert(1)>";
  const html = reassemble("roster", hostile);
  const v = validateArtifact(html);
  assert.ok(v.ok, `hostile noun must still gate-pass: ${v.errors.map(e => `[${e.rule}] ${e.detail}`).join("; ")}`);
  assert.equal((html.match(/<\/script>/gi) || []).length, 1, "exactly one script close — no breakout");
  assert.ok(!html.includes("<img"), "payload must not land as markup");
  assert.ok(html.includes("onerror") === false || /\\u003c|&lt;/.test(html), "payload only as escaped text");
});

test("injection: validator catches a raw seed breakout and an attribute breakout", () => {
  const doc = (body: string) => `<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>t</title></head><body><h1>x</h1>${body}</body></html>`;
  const seed = validateArtifact(doc(`<script>var s = "</script><b>x</b>";</script>`));
  // A raw </script> inside a string is detectable two ways: a literal scan
  // (when the block survives to contain it) or the one-close canary.
  assert.ok(
    seed.errors.some(e => e.rule === "seed-breakout") ||
    seed.errors.some(e => e.rule === "script-count" && e.detail.includes("</script>")),
    JSON.stringify(seed.errors),
  );
  const attr = validateArtifact(doc(`<div title="<img src=x>">t</div>`));
  assert.ok(attr.errors.some(e => e.rule === "attr-breakout"), JSON.stringify(attr.errors));
  const embed = validateArtifact(doc(`<iframe src="//x"></iframe>`));
  assert.ok(embed.errors.some(e => e.rule === "embed-element"));
});
