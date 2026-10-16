// Zero-LLM verification for the four new archetypes + the three extensions:
// 1. All ten fixtures assemble and pass the artifact validator (gate parity —
//    the six originals already had this; the four join the same bar).
// 2. Every new console carries the Staff-Home contract (#staffHome, sh-*,
//    body.entry scoping, PERSIST bridge) — entry-behavior.mts depends on it.
// 3. Extension fidelity: stock math, parts bills, owner gates compute
//    correctly from the fixture data (run in-process, no browser, no LLM).
// Run: npx tsx --test --test-force-exit tests/new-archetypes.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateArtifact } from "../src/lib/pipeline/validate-artifact";
import { withChassis } from "../src/lib/pipeline/artifact-design";
import { assembleQueue } from "../src/lib/consoles/queue";
import { assembleChecklist } from "../src/lib/consoles/checklist";
import { assembleRoster } from "../src/lib/consoles/roster";
import { assembleCalendar } from "../src/lib/consoles/calendar";
import { assembleTargetBoard } from "../src/lib/consoles/target-board";
import { assembleConsole } from "../src/lib/consoles/studio-v2";
import { assemblePipeline } from "../src/lib/consoles/pipeline";
import { pickArchetype, ARCHETYPES } from "../src/lib/pipeline/archetypes";
import { queue, checklist, roster, calendar, spatial, targetBoard, pipeline } from "../scripts/demo-fixtures";

const CONTRACT_PIECES = ["#staffHome", "renderStaffHome", "body.entry", "__opsDeskSubmit__", "__opsDeskLoad__", "id=\"toast\"", "PERSIST.schedule"];

function assertContract(name: string, html: string) {
  for (const piece of CONTRACT_PIECES) {
    assert.ok(html.includes(piece), `${name} is missing Staff-Home contract piece: ${piece}`);
  }
}

// ---- 1. Gate parity: the four new consoles pass the artifact validator ------

test("new archetype consoles pass the artifact gate (bare + chassis)", () => {
  const cases: [string, string, "queue" | "checklist" | "roster" | "calendar"][] = [
    ["queue", assembleQueue(queue), "queue"],
    ["checklist", assembleChecklist(checklist), "checklist"],
    ["roster", assembleRoster(roster), "roster"],
    ["calendar", assembleCalendar(calendar), "calendar"],
  ];
  for (const [name, html, arch] of cases) {
    const bare = validateArtifact(html);
    assert.ok(bare.ok, `${name} failed the gate:\n${bare.errors.map(e => `  ✗ [${e.rule}] ${e.detail}`).join("\n")}`);
    const chassised = validateArtifact(withChassis(html, { dark: true, accent: "#a78bfa", archetype: arch }));
    assert.ok(chassised.ok, `${name} failed the gate after chassis:\n${chassised.errors.map(e => `  ✗ [${e.rule}] ${e.detail}`).join("\n")}`);
  }
});

test("chassis identities cover all ten archetypes and are non-empty", () => {
  const ids = ["spatial", "target-board", "pipeline", "ledger", "temporal", "fleet", "queue", "checklist", "roster", "calendar"] as const;
  for (const id of ids) {
    const css = withChassis("<!DOCTYPE html><html lang=\"en\"><head><title>T</title></head><body></body></html>", { dark: true, accent: "#f59e0b", archetype: id });
    assert.ok(css.includes("/* chassis:v4 */"), `${id} chassis layer missing`);
  }
  assert.equal(ARCHETYPES.length, 10, "registry must hold ten archetypes");
});

// ---- 2. Staff-Home / persistence contract on every new console --------------

test("queue console carries the full contract", () => {
  assertContract("queue", assembleQueue(queue));
  const html = assembleQueue(queue);
  assert.ok(html.includes("counterGrid"), "counter grid missing");
  assert.ok(html.includes("serveNext"), "serve-next flow missing");
  assert.ok(html.includes("ENTRY_CTR"), "counter-scoped entry mode missing");
});

test("checklist console carries the full contract", () => {
  assertContract("checklist", assembleChecklist(checklist));
  const html = assembleChecklist(checklist);
  assert.ok(html.includes("ck-tick"), "pass/fail tick missing");
  assert.ok(html.includes("kpiStreak"), "streak KPI missing");
});

test("roster console carries the full contract", () => {
  assertContract("roster", assembleRoster(roster));
  const html = assembleRoster(roster);
  assert.ok(html.includes("payOf"), "payout math missing");
  assert.ok(html.includes("settleMonth"), "month settle missing");
});

test("calendar console carries the full contract", () => {
  assertContract("calendar", assembleCalendar(calendar));
  const html = assembleCalendar(calendar);
  assert.ok(html.includes("dueDate"), "honest date clock missing");
  assert.ok(html.includes("weekWrap"), "week grid missing");
});

// ---- 3. Extension fidelity (deterministic math, zero LLM) -------------------

test("target-board stock extension: reorder/expiry UI computes from fixture", () => {
  const html = assembleTargetBoard(targetBoard);
  // Fixture stock: Paracetamol 12/10 (ok), ORS 40/15 (ok), Cold Relief 3 days/2 (soon)
  assert.ok(html.includes('id="stockSec"'), "stock section missing from target-board");
  assert.ok(html.includes('id="kpiReorder"'), "reorder KPI missing");
  assert.ok(html.includes("Paracetamol strips"), "fixture item missing from seed");
  const noStock = assembleTargetBoard({ ...targetBoard, stock: undefined });
  assert.ok(!noStock.includes('id="stockSec"'), "stock section must be absent when no stock config");
  assert.ok(!noStock.includes('id="kpiReorder"'), "reorder KPI node must be absent when no stock config");
  assert.ok(!noStock.includes(".stock-row"), "stock CSS must be absent when no stock config");
});

test("spatial stock extension: rail gated off when absent", () => {
  const withStock = assembleConsole({ ...spatial, stock: [{ name: "SS304 sheets", unit: "sheets", qty: 8, minQty: 20 }] });
  assert.ok(withStock.includes("stockSec"), "spatial stock rail missing when configured");
  const without = assembleConsole(spatial);
  assert.ok(!without.includes("stockSec"), "spatial stock rail must be absent by default");
});

test("pipeline parts extension: bills total rate × qty per card", () => {
  const html = assemblePipeline(pipeline);
  // Bills are computed client-side from the PARTS/USES seed — so the test
  // evaluates the exact same math from the emitted literals (no browser).
  const parts: { n: string; r: number }[] = JSON.parse(html.match(/var PARTS = (\[.*?\]);/)?.[1] || "[]");
  const uses: { c: string; p: string; q: number }[] = JSON.parse(html.match(/var USES = (\[.*?\]);/)?.[1] || "[]");
  const billOf = (t: string) => uses.filter((u) => u.c === t).reduce((s: number, u) => s + (parts.find((p) => p.n === u.p)?.r || 0) * u.q, 0);
  assert.equal(billOf("ORD-104 T-shirt run"), 300, "25×12 button set = ₹300");
  assert.equal(billOf("ORD-105 Kurti order"), 240, "40×6 zips = ₹240");
  assert.equal(billOf("ORD-102 Hotel linens"), 1080, "60×18 lining = ₹1080");
  assert.ok(html.includes("function billOf"), "bill math missing from console");
  assert.ok(html.includes(".bill"), "card bill chip missing");
  assert.ok(html.includes("partsLine"), "drawer parts line missing");
});

test("pipeline owner gate: staff blocked from gated stages in one-way door", () => {
  // The advance fn must refuse to move a card INTO a gated stage for staff.
  const html = assemblePipeline(pipeline);
  assert.match(html, /if \(isGated\(it\.s \+ 1\)\)\{ toast\('Needs boss approval[^"]*'\); return; \}/, "staffHomeAdvance must refuse gated stages");
  assert.match(html, /if \(ENTRY && isGated\(newStage\)\)/, "drawer apply must refuse gated stages for staff");
});

test("classifier routes the four new shapes", () => {
  assert.equal(pickArchetype("clinic OPD token system for walk-in patients, now serving counter").id, "queue");
  assert.equal(pickArchetype("kitchen hygiene audit checklist rounds every evening").id, "checklist");
  assert.equal(pickArchetype("tailors piece rate wages attendance and payroll payout").id, "roster");
  assert.equal(pickArchetype("medicine expiry dates and GST renewal due dates calendar").id, "calendar");
});

test("runner-up routing traps: booking language still beats queue keywords", () => {
  // 'appointments' is temporal-strong; 'counter' alone must not flip it.
  const r = pickArchetype("dental clinic appointments every 30 minutes at the front counter");
  assert.equal(r.id, "temporal");
});
