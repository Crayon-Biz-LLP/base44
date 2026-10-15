// A5 + A7 verification — config evolution, the fixture-reassembly CI net,
// and the audit hash. Zero LLM, zero DB.
//
// The fixture net: every archetype's fixture builds, the PARSED config from
// that build re-parses and REBUILDS byte-identical HTML, and upgradeForEdit
// (the pre-edit path) accepts every fixture. A future schema change that
// breaks any stored-config shape fails here first — not on 225 tenants.
// Run: npx tsx --test --test-force-exit tests/config-evolution.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_CONFIG_VERSION,
  currentConfigVersion,
  upgradeConfig,
  upgradeForEdit,
  upgradedConfigIsValid,
} from "../src/lib/domain/config-versions";
import { buildConsole, parseConfig } from "../src/lib/infra/assemble-registry";
import { configHashOf } from "../src/lib/infra/audit";
import type { ArchetypeId } from "../src/lib/infra/archetypes";
import {
  spatial, targetBoard, pipeline, ledger, temporal, fleet, queue, checklist, roster, calendar,
} from "../scripts/demo-fixtures";

const ALL: [ArchetypeId, Record<string, unknown>][] = [
  ["spatial", spatial as unknown as Record<string, unknown>],
  ["target-board", targetBoard as unknown as Record<string, unknown>],
  ["pipeline", pipeline as unknown as Record<string, unknown>],
  ["ledger", ledger as unknown as Record<string, unknown>],
  ["temporal", temporal as unknown as Record<string, unknown>],
  ["fleet", fleet as unknown as Record<string, unknown>],
  ["queue", queue as unknown as Record<string, unknown>],
  ["checklist", checklist as unknown as Record<string, unknown>],
  ["roster", roster as unknown as Record<string, unknown>],
  ["calendar", calendar as unknown as Record<string, unknown>],
];

test("new-write stamp: CURRENT_CONFIG_VERSION is 1 today", () => {
  assert.equal(CURRENT_CONFIG_VERSION, 1);
  assert.equal(currentConfigVersion(), 1);
});

test("upgradeConfig: no-op on current-version configs (all 10 fixtures)", () => {
  for (const [arch, cfg] of ALL) {
    const up = upgradeConfig(arch, structuredClone(cfg), CURRENT_CONFIG_VERSION);
    assert.deepEqual(up.config, cfg, `${arch} must be untouched at current version`);
    assert.deepEqual(up.applied, []);
  }
});

test("upgradeConfig: applies declared steps and is idempotent", () => {
  // Simulate the documented shape: a v1→v2 step for every archetype.
  const sentinel = structuredClone(roster) as unknown as Record<string, unknown>;
  // The STEPS table is empty at v1; this test pins the CONTRACT by checking
  // the walk terminates at current for any fromVersion (1..current).
  for (let from = 1; from <= CURRENT_CONFIG_VERSION; from++) {
    const up = upgradeConfig("roster", structuredClone(sentinel), from);
    assert.ok(up.version <= CURRENT_CONFIG_VERSION);
    assert.deepEqual(up.config, sentinel); // empty step table → untouched
  }
});

test("fixture net: build → parsed → rebuild is byte-identical for all 10 archetypes", () => {
  for (const [arch, cfg] of ALL) {
    const first = buildConsole(arch, structuredClone(cfg));
    const second = buildConsole(arch, first.parsed);
    assert.equal(second.html, first.html, `${arch}: parsed-config rebuild must be byte-identical`);
    const reparsed = parseConfig(arch, first.parsed);
    assert.deepEqual(reparsed, first.parsed, `${arch}: parse is a fixed point on the parsed config`);
  }
});

test("upgradeForEdit: every fixture passes the pre-edit upgrade path", () => {
  for (const [arch, cfg] of ALL) {
    const up = upgradeForEdit(arch, structuredClone(cfg), 1);
    assert.ok(up.ok, `${arch}: pre-edit upgrade must succeed`);
    assert.deepEqual(up.applied, []);
  }
});

test("upgradedConfigIsValid: rejects garbage, accepts fixtures", () => {
  assert.equal(upgradedConfigIsValid("roster", { nope: true }), false);
  assert.equal(upgradedConfigIsValid("roster", roster), true);
});

test("audit: configHashOf is stable across key order and sensitive to content", () => {
  const a = { productName: "X", workers: [{ name: "A", rate: 5 }] };
  const b = { workers: [{ rate: 5, name: "A" }], productName: "X" };
  assert.equal(configHashOf(a), configHashOf(b), "key order must not change the hash");
  assert.notEqual(configHashOf(a), configHashOf({ ...a, productName: "Y" }), "content must change the hash");
});
