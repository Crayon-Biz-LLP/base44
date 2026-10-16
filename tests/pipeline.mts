// Pipeline tests: invariance across two workflows + structural checks.
import { assemblePipeline, type PipelineConfig } from "../src/lib/consoles/pipeline";

const SHOP: PipelineConfig = {
  productName: "JobFlow Pro",
  logoText: "JF",
  tagline: "Two-wheeler service bay",
  accentHex: "#38bdf8",
  dark: true,
  stages: [{ label: "Received" }, { label: "Diagnosis" }, { label: "Repair" }, { label: "Quality Check" }, { label: "Delivered" }],
  items: [
    { title: "Honda Activa — brake noise", stageIdx: 0, owner: "Ravi" },
    { title: "TVS Jupiter — clutch", stageIdx: 1, owner: "Ravi" },
    { title: "Bajaj Pulsar — chain", stageIdx: 2, owner: "Mohan" },
    { title: "Yamaha FZ — servicing", stageIdx: 3, owner: "Kiran" },
    { title: "Hero Splendor — electrical", stageIdx: 4, owner: "Kiran" },
  ],
  slaDays: 5,
  searchHint: "bike, owner, stage",
  advisory: "Move every card at least once a day to keep aging honest.",
};

const CLAIMS: PipelineConfig = {
  productName: "ClaimTrack",
  logoText: "CT",
  tagline: "Insurance adjudication",
  accentHex: "#34d399",
  dark: false,
  stages: [{ label: "Intake" }, { label: "Verification" }, { label: "Approval" }, { label: "Settled" }],
  items: [
    { title: "Claim #8801 — windshield", stageIdx: 0, owner: "Priya" },
    { title: "Claim #8802 — bumper", stageIdx: 1, owner: "Priya" },
    { title: "Claim #8803 — headlight", stageIdx: 2, owner: "Arun" },
    { title: "Claim #8804 — hail damage", stageIdx: 3, owner: "Arun" },
  ],
  slaDays: 4,
  searchHint: "claim, owner",
  advisory: "Verify documents within 24h of intake to keep settlement on SLA.",
};

let passes = 0, failures = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { passes++; console.log(`  ok  ${name} ${extra}`); }
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}

function surface(html: string): string {
  const i = html.indexOf("<script>");
  const j = html.lastIndexOf("</script>");
  const s = html.slice(i + 8, j);
  return s
    .replace(/var STAGES = [^;]+;/, "")
    .replace(/var SLA = [^;]+;/, "")
    .replace(/var state = \{ items: [\s\S]*?\} ?, /, "")
    .replace(/(['"])(?:\\.|[^\\])*?\1/g, "''")
    .replace(/\b\d+(\.\d+)?\b/g, "N")
    .replace(/\s+/g, "");
}

const a = assemblePipeline(SHOP);
const b = assemblePipeline(CLAIMS);

check("control flow identical across pipelines", surface(a) === surface(b));

check("stages verbatim in kanban", a.includes("Received") && a.includes("Quality Check") && a.includes("Delivered"));
check("items with owners and deterministic aging seed", a.includes("Honda Activa") && a.includes("Ravi") && a.includes('"d":7'));
check("breach seed tied to SLA (item 0 = slaDays + 2)", JSON.parse(a.match(/var state = \{ items: (\[[\s\S]*?\]) ?\}/)?.[1] || "[]")[0].d === 7);
check("SLA compiled into aging logic", a.includes("var SLA = 5") && a.includes("ageClass"));
check("bottleneck + breach intelligence wired", a.includes("BOTTLENECK") && a.includes("auditBanner") && a.includes("breached"));
check("stage move resets aging", /newStage !== it\.s[\s\S]{0,200}it\.d = 0/.test(a));
check("spotlight dim/hit on cards", a.includes(".pcard.dim") && a.includes(".pcard.hit"));
check("modal contract (focus, close, apply)", a.includes("editF0').focus()") && a.includes("classList.add('open')") && a.includes("classList.remove('open')"));

check("Engine 2: hydrate on boot + autosave on edit", a.includes("PERSIST.hydrate()") && a.includes("PERSIST.schedule()") && a.includes("function applyLoaded(records)"));
check("Engine 2: sync-state chip + shared buildRecords", a.includes('id="syncState"') && a.split("buildRecords()").length >= 3);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
