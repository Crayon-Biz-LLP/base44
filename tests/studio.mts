import assert from "node:assert/strict";
import { studioAnatomyScore } from "../src/lib/infra/studio";
import { pickStudioExemplar, SPATIAL_EXEMPLAR } from "../src/lib/infra/studio-exemplars";

console.log("Studio engine unit tests");
let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log(`  ok  ${name}`); }

test("classifier picks spatial exemplar for warehouse language", () => {
  assert.equal(pickStudioExemplar("I have 30 racks with 8 rows of sheet storage"), SPATIAL_EXEMPLAR);
  assert.equal(pickStudioExemplar("track bins in my warehouse"), SPATIAL_EXEMPLAR);
});

test("classifier falls back gracefully for non-spatial prompts", () => {
  assert.equal(typeof pickStudioExemplar("daily petty cash log"), "string");
});

test("anatomy score is maximal for a canonical console", () => {
  const html = `<html><head><style>:root { --bg:#0f172a; } body { font-family:'JetBrains Mono'; }</style></head>
  <body><input id="search"><button id="syncBtn"></button><div id="kpiUtil"></div><div id="barUtil"></div>
  <div id="mapView"></div><div id="detailView"></div><div id="listView"></div>
  <div id="modal"></div><div id="toast"></div><script>function seedDemo(){} Clear demo data</script></body></html>`;
  assert.equal(studioAnatomyScore(html), 12);
});

test("anatomy score is low for a bare form", () => {
  assert.ok(studioAnatomyScore(`<html><body><input name="qty"><button>Save</button></body></html>`) <= 1);
});

test("anatomy score is 0 for empty input", () => {
  assert.equal(studioAnatomyScore(""), 0);
});

console.log(`\nPassed: ${passed}`);
