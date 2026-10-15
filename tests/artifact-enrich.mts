import assert from "node:assert/strict";
import { enrichArtifact, deriveAccentHex, designPreamble, scoreArtifact } from "../src/lib/infra/artifact";

console.log("Artifact enrichment tests");

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

test("number inputs gain inputmode=decimal + enterKeyHint=done", () => {
  const out = enrichArtifact(`<input type="number" name="a" placeholder="0.00">`);
  assert.match(out, /type="number" name="a"[^>]*inputmode="decimal"/);
  assert.match(out, /enterKeyHint="done"/);
  assert.doesNotMatch(out, /inputmode="decimal"[^>]*inputmode="decimal"/);
});

test("enrichment is idempotent", () => {
  const once = enrichArtifact(`<input type="number" name="a">`);
  const twice = enrichArtifact(once);
  assert.equal(once, twice);
});

test("non-number inputs gain no inputmode", () => {
  const out = enrichArtifact(`<input type="date" name="d"><input type="text" name="t">`);
  assert.doesNotMatch(out, /<input[^>]*inputmode/);
});

test("preamble injects ops-ds kit + fonts into head", () => {
  const out = enrichArtifact(`<!DOCTYPE html><html><head><title>t</title></head><body></body></html>`);
  assert.match(out, /<head>\s*<link rel="preconnect"/);
  assert.ok(out.includes('id="ops-ds"'));
  assert.ok(out.includes("--ops-accent"));
  assert.ok(out.includes(".ops-hero"));
});

test("preamble injection is idempotent", () => {
  const once = enrichArtifact(`<html><body>hi</body></html>`);
  const twice = enrichArtifact(once);
  assert.equal(once, twice);
  assert.equal(once.match(/ops-ds/g)?.length, 1);
});

test("existing font links are not duplicated", () => {
  const html = `<html><head><link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet"></head><body></body></html>`;
  const out = enrichArtifact(html);
  assert.equal(out.match(/fonts\.googleapis\.com/g)?.length, 1);
});

test("deriveAccentHex picks first declared accent", () => {
  assert.equal(deriveAccentHex({ columns: [{ label: "A" }, { label: "B", visual: { accent: "emerald" } }] } as any), "#10b981");
  assert.equal(deriveAccentHex({ fields: [{ visual: { accent: "amber" } }] } as any), "#f59e0b");
  assert.equal(deriveAccentHex({ rows: [{ visual: { accent: "blue" } }] } as any), "#3b82f6");
});

test("deriveAccentHex falls back to neutral", () => {
  assert.equal(deriveAccentHex({} as any), "#0ea5e9");
  assert.equal(deriveAccentHex({ columns: [{ label: "A" }] } as any), "#0ea5e9");
});

test("imitated ops-ds block is replaced with the real kit", () => {
  const fake = `<html><head></head><body><style id="ops-ds">:root { --ops-accent: red; }</style></body></html>`;
  const out = enrichArtifact(fake, { accentHex: "#10b981" });
  assert.ok(out.includes("--ops-font-sans"), "real kit must be present");
  assert.doesNotMatch(out, /--ops-accent: red/);
  assert.ok(out.includes(".ops-chip"), "kit must include chip class");
  assert.ok(out.match(/ops-ds/g)?.length === 1, "exactly one style block");
});

test("scoreArtifact rewards full console anatomy", () => {
  const full = `<html><head><style>:root { --ops-font-sans: 'Inter'; --ops-bg: #0f172a; }</style></head><body>
    <input id="search" placeholder="SS304, 3mm">
    <div id="kpiUtil"></div><div id="statTotal"></div><div id="filledCount"></div>
    <div data-tab="map" class="viewTab"></div><div class="inspector"></div>
    <button class="filter-pill">MS</button>
    <div class="modal"></div>
    <button>Export CSV</button>
    <button>Clear demo data</button>
    <script>__opsDeskLoad__(); localStorage.setItem('k','v');</script>
  </body></html>`;
  const score = scoreArtifact(full);
  assert.equal(score, 10, `expected 10/10, got ${score}`);
});

test("scoreArtifact penalizes bare form (no console anatomy)", () => {
  const bare = `<html><body><input type="number" name="qty" placeholder="0"><button>Save</button></body></html>`;
  const score = scoreArtifact(bare);
  assert.ok(score <= 1, `bare form should score <=1, got ${score}`);
});

test("scoreArtifact is 0 for empty input", () => {
  assert.equal(scoreArtifact(""), 0);
});

test("preamble is valid style block with accent value", () => {
  const css = designPreamble("#10b981");
  assert.ok(css.startsWith("<style"));
  assert.ok(css.endsWith("</style>"));
  assert.ok(css.includes("--ops-accent: #10b981"));
});

console.log(`\nPassed: ${passed}`);