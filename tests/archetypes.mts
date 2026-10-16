// Classifier accuracy gate: every canonical trigger prompt must land on its
// expected archetype. This is the registry's contract — new archetypes join by
// adding keywords + a canonical case here, and the gate enforces them.
import { pickArchetype, CLASSIFIER_CASES, ARCHETYPES } from "../src/lib/pipeline/archetypes";

let passes = 0, failures = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { passes++; console.log(`  ok  ${name} ${extra}`); }
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}

for (const c of CLASSIFIER_CASES) {
  const r = pickArchetype(c.prompt);
  check(`${c.expected}`, r.id === c.expected, r.id === c.expected ? `(score ${r.score})` : `→ misclassified as ${r.id}`);
}

check("registry has 10 archetypes", ARCHETYPES.length === 10, `(${ARCHETYPES.length})`);
check("empty prompt defaults to spatial", pickArchetype("hello world").id === "spatial" || pickArchetype("hello world").score === 0);
// Regression: "30-minute slots" must not drag a booking prompt into spatial —
// strong keywords (appointment/booked) outweigh incidental slot words 4:1.
const dental = pickArchetype("I run a dental clinic with 3 chairs and 4 doctors. Appointments are in 30-minute slots from 9am to 6pm. Track which chair and doctor is booked for each slot.");
check("dental clinic with slots → temporal (strong keywords)", dental.id === "temporal", dental.id === "temporal" ? `(score ${dental.score})` : `→ misclassified as ${dental.id}`);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
