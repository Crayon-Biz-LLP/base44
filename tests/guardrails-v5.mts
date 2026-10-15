// Deterministic unit tests for the manifest guardrails.
// Run: npm run test:unit   (tsx, no server required)
import assert from "node:assert/strict";
import {
  ManifestSchema,
  ensureCanonicalKeys,
  type Manifest,
  type GridManifest,
  type ListManifest,
} from "../src/lib/domain/manifest";
import { applyGuardrails, validateIntegrity, extractPromptTargets } from "../src/lib/domain/guardrails";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

function gridOf(m: Manifest): GridManifest {
  assert.equal(m.layout_type, "grid");
  return m as GridManifest;
}

console.log("Manifest guardrails unit tests");

// ---------------------------------------------------------------------------
// Fixture A: the real DPT build failure — targets misplaced into invariants
// with invented keys (newMetric/day10), columns untyped/targetless, shared mode.
// ---------------------------------------------------------------------------
const fixtureA: GridManifest = {
  layout_type: "grid",
  columns: [
    { label: "New" },
    { label: "10DDay" },
    { label: "20Days" },
    { label: "30DDay" },
    { label: "100DDay" },
    { label: "MC" },
    { label: "Family" },
    { label: "Chronic" },
  ],
  rows: [
    { label: "Bhuvana", required: true, type: "number" },
    { label: "Srimathi", required: true, type: "number" },
    { label: "Shamla", required: true, type: "number" },
    { label: "Niharshana", required: true, type: "number" },
  ],
  intelligence: {
    entities: [
      { key: "bhuvana", label: "Bhuvana" },
      { key: "srimathi", label: "Srimathi" },
      { key: "shamla", label: "Shamla" },
      { key: "niharshana", label: "Niharshana" },
    ],
    invariants: [
      { leftKey: "newMetric", op: "gte", rightValue: 3, errorMessage: "New must be at least 3", severity: "block" },
      { leftKey: "day10", op: "gte", rightValue: 20, errorMessage: "10DDay must be at least 20", severity: "block" },
    ],
  },
  entryMode: "shared",
};

const schemaA = gridOf(ensureCanonicalKeys(ManifestSchema.parse(fixtureA)) as Manifest);
const userPromptA = "Every day I need my 4 employees to report their actual numbers for New (target 3), 10DDay (target 20). Each employee updates their own numbers alone.";
const reportA = applyGuardrails(schemaA, userPromptA);

test("Fixture A — invented 'newMetric' target is rescued onto the New column (target 3)", () => {
  const newCol = schemaA.columns!.find((c) => c.label === "New");
  assert.ok(newCol);
  assert.equal(newCol.target, 3);
  assert.equal(newCol.type, "number");
  assert.deepEqual(newCol.quickChips, [1, 2, 3]);
});
test("Fixture A — rescued invariant is recorded as a fix, not an error", () => {
  assert.ok(reportA.fixes.some((f) => f.includes("newMetric")));
  assert.ok(!reportA.errors.some((e) => e.includes("newMetric")));
});
test("Fixture A — irrecoverable 'day10' phantom is dropped and surfaced as an error", () => {
  assert.ok(reportA.errors.some((e) => e.includes("day10")));
});
test("Fixture A — no invariant may reference a nonexistent field after normalization", () => {
  assert.equal(schemaA.intelligence!.invariants, undefined);
});
test("Fixture A — user prompt demanding per-person reporting forces entryMode personal", () => {
  assert.equal(schemaA.entryMode, "personal");
});

// ---------------------------------------------------------------------------
// Fixture B: the live dd689b3f defect — 'sales gte 0' vs metric columns.
// ---------------------------------------------------------------------------
const fixtureB: GridManifest = {
  layout_type: "grid",
  columns: [{ label: "Evening Shift Target" }, { label: "Morning Shift Target" }],
  rows: [{ label: "Anil", required: true, type: "number" }, { label: "Priya", required: true, type: "number" }, { label: "Ramesh", required: true, type: "number" }, { label: "Suresh", required: true, type: "number" }],
  entryMode: "shared",
  intelligence: {
    invariants: [{ leftKey: "sales", op: "gte", rightValue: 0, errorMessage: "Sales units cannot be negative", severity: "block" }],
  },
};
const schemaB = gridOf(ensureCanonicalKeys(ManifestSchema.parse(fixtureB)) as Manifest);
const reportB = applyGuardrails(schemaB, "Daily sales tracker (shared)");

test("Fixture B — phantom 'sales' invariant is dropped with an error", () => {
  assert.ok(reportB.errors.some((e) => e.includes("sales")));
  assert.equal(schemaB.intelligence!.invariants, undefined);
});
test("Fixture B — no column is mutated when a phantom cannot be resolved", () => {
  const cols = schemaB.columns!.map((c) => ({ label: c.label ?? "", target: c.target ?? null, type: c.type ?? null }));
  assert.deepEqual(cols, [
    { label: "Evening Shift Target", target: null, type: null },
    { label: "Morning Shift Target", target: null, type: null },
  ]);
});
test("Fixture B — shared prompt does NOT flip entryMode", () => {
  assert.equal(schemaB.entryMode, "shared");
});

// ---------------------------------------------------------------------------
// Fixture C: the live 5f6425ca defect — 'status not_empty' vs checklist fields.
// ---------------------------------------------------------------------------
const fixtureC: ListManifest = {
  layout_type: "list",
  fields: [
    { label: "Cash Counted", type: "boolean", required: true },
    { label: "Doors Locked", type: "boolean", required: true },
    { label: "Lights Off", type: "boolean", required: true },
    { label: "Oven Cleaned", type: "boolean", required: true },
  ],
  intelligence: {
    invariants: [{ leftKey: "status", op: "not_empty", errorMessage: "All items must be checked", severity: "block" }],
  },
};
const schemaC = ensureCanonicalKeys(ManifestSchema.parse(fixtureC)) as ListManifest;
const reportC = applyGuardrails(schemaC, undefined);

test("Fixture C — phantom 'status' on a checklist is dropped with an error", () => {
  assert.ok(reportC.errors.some((e) => e.includes("status")));
  assert.equal(schemaC.intelligence!.invariants, undefined);
});

// ---------------------------------------------------------------------------
// Fixture D: legit invariants on real keys are preserved, ok=true.
// ---------------------------------------------------------------------------
const fixtureD: GridManifest = {
  layout_type: "grid",
  columns: [{ label: "Amount" }],
  rows: [{ label: "Item", required: true, type: "number" }],
  entryMode: "shared",
  intelligence: {
    invariants: [{ leftKey: "amount", op: "gt", rightValue: 0, errorMessage: "Amount must be positive", severity: "block" }],
  },
};
const schemaD = gridOf(ensureCanonicalKeys(ManifestSchema.parse(fixtureD)) as Manifest);
const reportD = applyGuardrails(schemaD, "Invoice line items (shared)");

test("Fixture D — invariant on a real column key is preserved", () => {
  assert.equal(reportD.ok, true);
  assert.equal(schemaD.intelligence!.invariants!.length, 1);
  assert.equal(schemaD.intelligence!.invariants![0].leftKey, "amount");
});

// ---------------------------------------------------------------------------
// Fixture E: typless + chip-less target columns get type + derived chips.
// ---------------------------------------------------------------------------
const fixtureE: GridManifest = {
  layout_type: "grid",
  columns: [{ label: "MC", type: "text", target: 20 }],
  rows: [{ label: "Staff", required: true, type: "number" }],
  entryMode: "shared",
};
const schemaE = gridOf(ensureCanonicalKeys(ManifestSchema.parse(fixtureE)) as Manifest);
const reportE = applyGuardrails(schemaE, "Tracking (shared)");

test("Fixture E — target column re-typed to number", () => {
  assert.equal(schemaE.columns![0].type, "number");
});
test("Fixture E — quickChips derived from target", () => {
  assert.deepEqual(schemaE.columns![0].quickChips, [5, 10, 20]);
  assert.ok(reportE.fixes.some((f) => f.includes("quickChips")));
});

// ---------------------------------------------------------------------------
// Fixture F: normalization is idempotent.
// ---------------------------------------------------------------------------
const schemaF = gridOf(ensureCanonicalKeys(ManifestSchema.parse(fixtureE)) as Manifest);
applyGuardrails(schemaF, "Tracking (shared)");
const reportF = applyGuardrails(schemaF, "Tracking (shared)");

test("Fixture F — second pass is a no-op", () => {
  assert.equal(reportF.fixes.length, 0);
  assert.equal(reportF.errors.length, 0);
  assert.equal(reportF.ok, true);
});

// ---------------------------------------------------------------------------
// validateIntegrity is read-only.
// ---------------------------------------------------------------------------
const fixtureG: GridManifest = {
  layout_type: "grid",
  columns: [{ label: "MC" }],
  rows: [{ label: "Staff", required: true, type: "number" }],
  entryMode: "shared",
  intelligence: {
    invariants: [{ leftKey: "phantom", op: "gte", rightValue: 1, errorMessage: "x", severity: "block" }],
  },
};
const schemaG = gridOf(ensureCanonicalKeys(ManifestSchema.parse(fixtureG)) as Manifest);
const beforeG = JSON.stringify(schemaG);
const issuesG = validateIntegrity(schemaG);

test("validateIntegrity reports phantom key without mutating", () => {
  assert.ok(issuesG.some((e) => e.includes("phantom")));
  assert.equal(JSON.stringify(schemaG), beforeG);
});

// ---------------------------------------------------------------------------
// Fixture H: prompt-stated targets bind deterministically onto columns.
// ---------------------------------------------------------------------------
const fixtureH: GridManifest = {
  layout_type: "grid",
  columns: [{ label: "New" }, { label: "10DDay" }, { label: "MC" }],
  rows: [{ label: "Staff", required: true, type: "number" }],
  entryMode: "shared",
};
const schemaH = gridOf(ensureCanonicalKeys(ManifestSchema.parse(fixtureH)) as Manifest);
const reportH = applyGuardrails(schemaH, "New 3, 10DDay 20, MC 20");

test("Fixture H — prompt-stated targets bind deterministically (New->3, 10DDay->20, MC->20)", () => {
  const byLabel = new Map(schemaH.columns!.map((c) => [c.label, c]));
  for (const [label, want] of Object.entries({ New: 3, "10DDay": 20, MC: 20 })) {
    const col = byLabel.get(label)!;
    assert.equal(col.target, want, `${label} target`);
    assert.equal(col.type, "number", `${label} type`);
    assert.ok(Array.isArray(col.quickChips) && col.quickChips.length > 0, `${label} chips`);
  }
  assert.ok(reportH.fixes.some((f) => f.includes("New") && f.includes("3")));
  assert.equal(reportH.ok, true);
});

test("Fixture H — explicit targets are never overwritten by the prompt", () => {
  const fixture: GridManifest = {
    layout_type: "grid",
    columns: [{ label: "MC", target: 25 }],
    rows: [{ label: "Staff", required: true, type: "number" }],
    entryMode: "shared",
  };
  const h = gridOf(ensureCanonicalKeys(ManifestSchema.parse(fixture)) as Manifest);
  const r = applyGuardrails(h, "New 3, MC 20");
  assert.equal(h.columns![0].target, 25);
  assert.ok(h.columns!.every((c) => !r.fixes.some((f) => f.includes("MC 20"))));
});

test("extractPromptTargets handles clause-embedded headings like 'every day: New 3'", () => {
  const got = extractPromptTargets(
    "create a tool for my 4 employees Bhuvana, Srimathi, Shamla, Niharshana to report 8 daily metrics every day: New 3, 10DDay 20, 20Days 18, 30DDay 10, 100DDay 10, MC 20, Family 20, Chronic 6, each employee reporting their own numbers alone"
  );
  assert.equal(got.get("new")?.value, 3, "new -> 3");
  assert.equal(got.get("new")?.display, "New", "new display case preserved");
  assert.equal(got.get("10dday")?.value, 20, "10dday -> 20");
  assert.equal(got.get("chronic")?.value, 6, "chronic -> 6");
  assert.equal(got.size, 8, "all 8 targets extracted");
});

// ---------------------------------------------------------------------------
// Fixture I: model collapsed metric columns; prompt enumerates them.
// ---------------------------------------------------------------------------
const fixtureI: GridManifest = {
  layout_type: "grid",
  columns: [{ label: "New" }, { label: "MC" }],
  rows: [{ label: "Staff", required: true, type: "number" }],
  entryMode: "shared",
};
const schemaI = gridOf(ensureCanonicalKeys(ManifestSchema.parse(fixtureI)) as Manifest);
const reportI = applyGuardrails(schemaI, "New 3, 10DDay 20, 20Days 18, MC 20, Family 20, Chronic 6");

test("Fixture I — collapsed prompt metrics are materialized as columns (10DDay/Family/Chronic...)", () => {
  const want = { New: 3, "10DDay": 20, "20Days": 18, MC: 20, Family: 20, Chronic: 6 };
  const byLabel = new Map(schemaI.columns!.map((c) => [c.label, c]));
  assert.equal(Object.keys(want).length, 6, "all six expected columns");
  for (const [label, tgt] of Object.entries(want)) {
    const col = byLabel.get(label);
    assert.ok(col, `column ${label} exists`);
    assert.equal(col!.target, tgt, `${label} target`);
    assert.equal(col!.type, "number", `${label} type`);
  }
  assert.ok(reportI.fixes.some((f) => f.includes("materialized") && f.includes("10DDay")));
});

test("Fixture I — date-rule (roster) grids are never materialized", () => {
  const fixture: GridManifest = {
    layout_type: "grid",
    columns: [{ label: "Beginners" }],
    rows: [{ dateRule: { type: "specific_dates", specificDates: ["2026-10-01"] }, required: true, type: "number" }],
    entryMode: "shared",
  };
  const h = gridOf(ensureCanonicalKeys(ManifestSchema.parse(fixture)) as Manifest);
  const r = applyGuardrails(h, "Beginners 1, Ramesh 2");
  assert.equal(h.columns!.length, 1, "no synthetic columns on rosters");
  assert.equal(r.ok, true);
});

console.log(`Guardrail report summary: D ok=${reportD.ok} | A errors=${reportA.errors.length} fixes=${reportA.fixes.length} | B errors=${reportB.errors.length}`);
console.log(`\nPassed: ${passed}`);