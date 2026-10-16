import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroStatInput } from "../src/components/ds/HeroStatInput";
import { GridForm } from "../src/components/forms/GridForm";

console.log("Renderer V5 tests");

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

test("HeroStatInput - DOM contract: inputMode, type='button', stack order", () => {
  const html = renderToStaticMarkup(
    React.createElement(HeroStatInput, {
      label: "Total Cash",
      value: "5000",
      chips: [500, 1000, 2000, 5000],
      accent: "emerald",
    })
  );

  // Assert inputMode="decimal"
  assert.ok(html.includes('inputMode="decimal"'), "Missing inputMode='decimal'");
  assert.ok(html.includes('enterKeyHint="done"'), "Missing enterKeyHint='done'");

  // Assert chips are rendered as type="button"
  assert.ok(html.includes('type="button"'), "Chips must be type='button'");
  
  // Assert chip values exist
  assert.ok(html.includes("+500"), "Missing chip 500");
  assert.ok(html.includes("+5000"), "Missing chip 5000");

  // Assert chips sit above the input. In the HTML string, the chips container should appear before the input element.
  const chipsIdx = html.indexOf("+5000");
  const inputIdx = html.indexOf("<input");
  assert.ok(chipsIdx !== -1 && inputIdx !== -1 && chipsIdx < inputIdx, "Chips must appear before the input in DOM order");
});

test("GridForm personal mode - matches canonical row key against display staff name", () => {
  const html = renderToStaticMarkup(
    React.createElement(GridForm, {
      schema: {
        layout_type: "grid",
        entryMode: "personal",
        rows: [
          { key: "bhuvana", label: "Bhuvana", type: "number", required: true },
          { key: "shamla", label: "Shamla", type: "number", required: true },
        ],
        columns: [{ key: "mc", label: "MC", type: "number", target: 20 }],
        intelligence: {},
      },
      formState: {},
      setFormState: () => {},
      selectedPersona: "Bhuvana",
    })
  );
  assert.ok(html.includes("Bhuvana"), "Own row must render");
  assert.doesNotMatch(html, /Shamla/, "Other employees must be hidden");
});

console.log(`\n${passed} tests passed`);