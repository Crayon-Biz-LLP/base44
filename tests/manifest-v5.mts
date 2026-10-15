// Deterministic unit tests for the Manifest V5 vocabulary.
// Run: npm run test:unit   (tsx, no server required)
import assert from "node:assert/strict";
import {
  deriveChips,
  sanitizeChips,
  isCurrencyField,
  ICON_SET,
  VisualSchema,
  MANIFEST_SCHEMA_VERSION,
  type VisualOptions,
} from "../src/lib/domain/manifest";
import { resolveIcon, NEUTRAL_ICON, assertIconCoverage } from "../src/components/ds/icons";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("Manifest V5 unit tests");
assert.equal(MANIFEST_SCHEMA_VERSION, 5, "schema version is 5");

// ---------------------------------------------------------- deriveChips
console.log("deriveChips — guards");

test("no chips for missing target", () => assert.equal(deriveChips({ type: "currency" }), undefined));
test("no chips for zero target", () => assert.equal(deriveChips({ target: 0, primitive: "cash" }), undefined));
test("no chips for negative target", () => assert.equal(deriveChips({ target: -1000, primitive: "cash" }), undefined));
test("no chips for fractional currency target", () => assert.equal(deriveChips({ target: 0.5, primitive: "cash" }), undefined));
test("no chips for non-finite target", () => assert.equal(deriveChips({ target: Infinity, primitive: "cash" }), undefined));

console.log("deriveChips — currency regime");
test("₹5,000 → [500, 1000, 2000, 5000]", () =>
  assert.deepEqual(deriveChips({ target: 5000, primitive: "cash" }), [500, 1000, 2000, 5000]));
test("type currency → [500, 1000, 2000, 5000]", () =>
  assert.deepEqual(deriveChips({ target: 5000, type: "currency" }), [500, 1000, 2000, 5000]));
test("₹20,000 → [2000, 4000, 8000, 20000]", () =>
  assert.deepEqual(deriveChips({ target: 20000, primitive: "digital" }), [2000, 4000, 8000, 20000]));
test("₹250,000 → deduped deciles, ascending", () => {
  const chips = deriveChips({ target: 250000, primitive: "gross_sales" })!;
  assert.ok(chips.length >= 2 && chips.length <= 4);
  assert.ok(chips.every((n, i) => n > 0 && (i === 0 || n > chips[i - 1])), "positive, strictly ascending");
  assert.equal(chips[chips.length - 1], 250000, "top chip is the target");
});

console.log("deriveChips — integer regime");
test("count 20 → [5, 10, 20]", () =>
  assert.deepEqual(deriveChips({ target: 20, primitive: "qty" }), [5, 10, 20]));
test("count 20 type number → [5, 10, 20]", () =>
  assert.deepEqual(deriveChips({ target: 20, type: "number" }), [5, 10, 20]));
test("count 1 → no chips", () => assert.equal(deriveChips({ target: 1, type: "number" }), undefined));
test("fractional integer target stays integer", () => {
  const chips = deriveChips({ target: 20.5, type: "number" })!;
  assert.ok(chips.every(Number.isInteger), "all integer-bound");
});

console.log("deriveChips — bounds clamping");
test("target 20 min 8 → clamped up", () =>
  assert.deepEqual(deriveChips({ target: 20, min: 8, type: "number" }), [8, 10, 20]));
test("target 20 max 15 → clamped down", () =>
  assert.deepEqual(deriveChips({ target: 20, max: 15, type: "number" }), [5, 10, 15]));
test("invalid bounds (min > max) treated as unbounded", () => {
  const chips = deriveChips({ target: 20, min: 30, max: 10, type: "number" })!;
  assert.deepEqual(chips, [5, 10, 20]);
});

// ---------------------------------------------------------- sanitizeChips
console.log("sanitizeChips — LLM-provided values");

test("dedupe, drop non-finite and non-positive, sort ascending", () => {
  const out = sanitizeChips([50, 50, 2.7, 100, -5, NaN, Infinity, 999999, 20], { target: 5000, primitive: "cash" })!;
  assert.deepEqual(out, [3, 20, 50, 100, 999999]);
});
test("integer regime rounds floats to integers", () => {
  const out = sanitizeChips([2.7, 5, 10], { target: 20, type: "number" })!;
  assert.ok(out.every(Number.isInteger));
  assert.ok(out.includes(3));
});
test("clamps to [min,max]", () => {
  assert.deepEqual(sanitizeChips([1, 100, 50], { target: 20, min: 8, max: 60, type: "number" }), [8, 50, 60]);
});
test("empty / invalid input → undefined", () => {
  assert.equal(sanitizeChips([], { target: 20, type: "number" }), undefined);
  assert.equal(sanitizeChips("100", { target: 20, type: "number" }), undefined);
  assert.equal(sanitizeChips(null, { target: 20, type: "number" }), undefined);
});
test("caps at 8 chips", () => {
  const out = sanitizeChips([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { target: 100, type: "currency" })!;
  assert.ok(out.length <= 8);
});

// ---------------------------------------------------------- isCurrencyField
console.log("isCurrencyField");
test("currency type / cash+digital+outflow primitives are currency", () => {
  assert.equal(isCurrencyField({ type: "currency" }), true);
  for (const p of ["cash", "digital", "gross_sales", "outflow"]) assert.equal(isCurrencyField({ primitive: p }), true);
});
test("integer primitives are not currency", () => {
  for (const p of ["qty", "count", "percent_achieved"]) assert.equal(isCurrencyField({ primitive: p }), false);
  assert.equal(isCurrencyField({ type: "number" }), false);
});

// ---------------------------------------------------------- VisualSchema
console.log("VisualSchema");
test("inner defaults apply on empty visual block", () => {
  const v: VisualOptions = VisualSchema.parse({});
  assert.equal(v.variant, "standard");
  assert.equal(v.accent, "neutral");
});
test("unknown accent / variant rejected by enum", () => {
  assert.throws(() => VisualSchema.parse({ accent: "neon" }));
  assert.throws(() => VisualSchema.parse({ variant: "godmode" }));
});
test("icon bounded by ICON_SET", () => {
  assert.throws(() => VisualSchema.parse({ icon: "nonsense-icon" }));
  assert.equal(VisualSchema.parse({ icon: "banknote" }).icon, "banknote");
});

// ---------------------------------------------------------- icons
console.log("icons");
test("ICON_SET is single source of truth and fully covered", () => {
  assert.equal(assertIconCoverage(), true);
});
test("every ICON_SET name resolves to a component", () => {
  for (const key of ICON_SET) assert.ok(resolveIcon(key), `resolveIcon('${key}')`);
});
test("unknown / absent icon falls back to NEUTRAL_ICON, never throws", () => {
  assert.equal(resolveIcon("not-a-real-icon"), NEUTRAL_ICON);
  assert.equal(resolveIcon(undefined), NEUTRAL_ICON);
  assert.equal(resolveIcon(null), NEUTRAL_ICON);
});

console.log(`\n${passed} tests passed`);