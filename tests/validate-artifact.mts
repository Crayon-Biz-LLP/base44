// Validator suite — Section D gates, proven in BOTH directions per the plan:
// the six real fixture consoles must PASS, and every rule must CATCH a
// deliberately broken document (a validator that tests itself is a validator
// worth having). Zero LLM, zero network. Fixtures are the same ones the demo
// gallery assembles (scripts/demo-fixtures.mts) — one source of truth.
// Run: npx tsx --test --test-force-exit tests/validate-artifact.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateArtifact } from "../src/lib/pipeline/validate-artifact";
import { assembleConsole } from "../src/lib/consoles/studio-v2";
import { assembleTargetBoard } from "../src/lib/consoles/target-board";
import { assemblePipeline } from "../src/lib/consoles/pipeline";
import { assembleLedger } from "../src/lib/consoles/ledger";
import { assembleTemporal } from "../src/lib/consoles/temporal";
import { assembleFleet } from "../src/lib/consoles/fleet";
import { withChassis } from "../src/lib/pipeline/artifact-design";
import { spatial, targetBoard, pipeline, ledger, temporal, fleet } from "../scripts/demo-fixtures";

// Minimal compliant document — every fail-case below mutates exactly one thing.
const DOC = (body = "", extraHead = "") =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>T</title><style>.btn:focus-visible{outline:2px solid #f00}</style>${extraHead}</head><body><h1>T</h1>${body}<script>var x=1;</script></body></html>`;

const ruleOf = (r: ReturnType<typeof validateArtifact>, rule: string) =>
  r.errors.find(e => e.rule === rule);

// ---- Pass direction: the real product --------------------------------------

test("all six fixture consoles pass the artifact gate", () => {
  const cases: [string, string][] = [
    ["spatial", assembleConsole(spatial)],
    ["target-board", assembleTargetBoard(targetBoard)],
    ["pipeline", assemblePipeline(pipeline)],
    ["ledger", assembleLedger(ledger)],
    ["temporal", assembleTemporal(temporal)],
    ["fleet", assembleFleet(fleet)],
  ];
  for (const [name, html] of cases) {
    const v = validateArtifact(html);
    assert.ok(v.ok, `${name} failed the gate:\n${v.errors.map(e => `  ✗ [${e.rule}] ${e.detail}`).join("\n")}`);
  }
});

test("chassis layer does not break validation", () => {
  const after = withChassis(assembleTargetBoard(targetBoard), { dark: true, accent: "#f59e0b", archetype: "target-board" });
  const v = validateArtifact(after);
  assert.ok(v.ok, `chassis introduced errors:\n${v.errors.map(e => `  ✗ [${e.rule}] ${e.detail}`).join("\n")}`);
  assert.ok(!v.warnings.some(w => w.rule === "reduced-motion"), "chassis carries the motion bank + reduce guard — validator must not warn");
});

test("consoles may warn without failing (touch targets, fonts)", () => {
  const v = validateArtifact(assembleLedger(ledger));
  assert.ok(v.ok);
  assert.ok(v.warnings.length > 0, "real consoles carry advisory warnings (row onclick targets)");
});

// ---- Fail direction: every rule catches its defect --------------------------

test("doctype rule", () => {
  const v = validateArtifact(DOC().replace("<!DOCTYPE html>", ""));
  assert.ok(ruleOf(v, "doctype"));
  assert.equal(v.ok, false);
});

test("lang rule", () => {
  const v = validateArtifact(DOC().replace('<html lang="en">', "<html>"));
  assert.ok(ruleOf(v, "lang"));
});

test("viewport rule", () => {
  const v = validateArtifact(DOC().replace(/<meta name="viewport"[^>]*>/, ""));
  assert.ok(ruleOf(v, "viewport"));
});

test("title rule", () => {
  const v = validateArtifact(DOC().replace(/<title>[^<]*<\/title>/, ""));
  assert.ok(ruleOf(v, "title"));
  const v2 = validateArtifact(DOC().replace(/<title>[^<]*<\/title>/, "<title>  </title>"));
  assert.ok(ruleOf(v2, "title"));
});

test("h1 rule — zero and two", () => {
  const none = DOC("").replace("<h1>T</h1>", "");
  assert.ok(ruleOf(validateArtifact(none), "h1"));
  assert.ok(ruleOf(validateArtifact(DOC("<h1>a</h1>")), "h1"));
});

test("control-label rule", () => {
  const v = validateArtifact(DOC('<input id="a" placeholder="guess">'));
  assert.ok(ruleOf(v, "control-label"));
  // aria-label satisfies it
  const ok = validateArtifact(DOC('<input id="b" placeholder="x" aria-label="X">'));
  assert.equal(ruleOf(ok, "control-label"), undefined);
  // label[for] satisfies it
  const ok2 = validateArtifact(DOC('<label for="c">Amt</label><input id="c">'));
  assert.equal(ruleOf(ok2, "control-label"), undefined);
  // hidden/submit controls are exempt
  const ok3 = validateArtifact(DOC('<input type="hidden" id="d"><input type="submit" value="Go">'));
  assert.equal(ruleOf(ok3, "control-label"), undefined);
});

test("focus-style rule", () => {
  const v = validateArtifact(DOC().replace(/\.btn:focus-visible\{[^}]*\}/, ""));
  assert.ok(ruleOf(v, "focus-style"));
});

test("reduced-motion rule — keyframes without guard is an error", () => {
  const v = validateArtifact(DOC("", "<style>@keyframes spin{from{opacity:0}to{opacity:1}}</style>"));
  assert.ok(ruleOf(v, "reduced-motion"));
});

test("external-script rule", () => {
  const v = validateArtifact(DOC('<script src="https://cdn.example.com/lib.js"></script>'));
  assert.ok(ruleOf(v, "external-script"));
});

test("javascript-url rule", () => {
  const v = validateArtifact(DOC('<a href="javascript:alert(1)">x</a>'));
  assert.ok(ruleOf(v, "javascript-url"));
});

test("external-style rule — remote CSS is an error, fonts warn only", () => {
  const v = validateArtifact(DOC("", '<link rel="stylesheet" href="https://cdn.example.com/x.css">'));
  assert.ok(ruleOf(v, "external-style"));
  const w = validateArtifact(DOC("", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap">'));
  assert.equal(w.ok, true, "Google Fonts must warn, not fail");
  assert.ok(w.warnings.some(x => x.rule === "external-font"));
});

test("input-size rule — sub-16px inputs would zoom iOS", () => {
  const v = validateArtifact(DOC("", "<style>.input{font-size:14px;color:red}</style>"));
  assert.ok(ruleOf(v, "input-size"));
  const inline = validateArtifact(DOC('<input style="font-size:13px">'));
  assert.ok(ruleOf(inline, "input-size"));
});

test("script-count rule", () => {
  const v = validateArtifact(DOC("", "<script>var y=2;</script>"));
  assert.ok(ruleOf(v, "script-count"));
});

test("touch-target is advisory, never blocking", () => {
  const v = validateArtifact(DOC('<div onclick="go()">row</div>'));
  assert.equal(v.ok, true);
  assert.ok(v.warnings.some(w => w.rule === "touch-target"));
});
