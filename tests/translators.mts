// Translator unit tests — the bridge between generic ledger records and
// human-readable facts must be deterministic and exact. Fixtures mirror each
// assembler's buildRecords() shape (keep in lockstep with the assemblers).
import { translateRecords } from "../src/lib/pipeline/translators";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { passes++; console.log(`  ok  ${name} ${extra}`); }
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}

const all = JSON.stringify;

// ── Target Board ───────────────────────────────────────────────────────────
{
  const cfg = { metrics: [
    { key: "new", label: "New", target: 3 },
    { key: "dd", label: "10DDay", target: 20 },
  ], people: [{ name: "Bhuvana" }, { name: "Srimathi" }] };
  const recs = [
    { employee: "Bhuvana", report_date: "2026-09-23", new: 3, dd: 20 },
    { employee: "Srimathi", report_date: "2026-09-23", new: 1, dd: 12 },
    { employee: "Shamla", report_date: "2026-09-23", new: 0, dd: 0 },
  ];
  const t = translateRecords("target-board", recs, cfg);
  check("TB: hit line for Bhuvana", t.lines.some(l => l.startsWith("Bhuvana hit")), all(t.lines));
  check("TB: miss line for Srimathi", t.lines.some(l => l.startsWith("Srimathi reported")), all(t.lines));
  check("TB: all-miss alert for Shamla", t.alerts.some(l => l.startsWith("Shamla missed all")), all(t.alerts));
  check("TB: achievement stat", t.stats.achievementPct === 33, String(t.stats.achievementPct));
  check("TB: no records → empty", translateRecords("target-board", [], cfg).lines.length === 0);
}

// ── Pipeline ───────────────────────────────────────────────────────────────
{
  const cfg = { slaDays: 5, stages: [{ label: "Received" }, { label: "Repair" }] };
  const recs = [
    { title: "Bike A", stage: "Received", owner: "Ravi", days_in_stage: 2 },
    { title: "Bike B", stage: "Repair", owner: "Sam", days_in_stage: 7 },
  ];
  const t = translateRecords("pipeline", recs, cfg);
  check("PL: flow line has stage counts", t.lines.some(l => l.includes("Received: 1") && l.includes("Repair: 1")), all(t.lines));
  check("PL: breach alert names card", t.alerts.some(l => l.includes("Bike B") && l.includes("7d")), all(t.alerts));
  check("PL: oldest resident line", t.lines.some(l => l.includes("Longest resident: Bike B")), all(t.lines));
  check("PL: breach stat", t.stats.breached === 1);
  const clean = translateRecords("pipeline", [recs[0]], cfg);
  check("PL: no alerts when within SLA", clean.alerts.length === 0, all(clean.alerts));
}

// ── Ledger ─────────────────────────────────────────────────────────────────
{
  const cfg = { lowBalanceThreshold: 5000 };
  const recs = [
    { day: 1, label: "Sales", type: "Receipt", account: "Cash", amount: 8000, balance_after: 8000 },
    { day: 2, label: "Rent", type: "Payment", account: "Cash", amount: -6000, balance_after: 2000 },
    { day: 3, label: "Sales", type: "Receipt", account: "Cash", amount: 4000, balance_after: 6000 },
  ];
  const t = translateRecords("ledger", recs, cfg);
  check("LG: in/out/closing line", t.lines.some(l => l.includes("In 12,000") && l.includes("Out 6,000") && l.includes("Closing balance 6,000")), all(t.lines));
  check("LG: dip alert fired", t.alerts.some(l => l.includes("5,000 safety line")), all(t.alerts));
  check("LG: dip stat flagged", t.stats.dippedBelowThreshold === 1, String(t.stats.dippedBelowThreshold));
  const safe = translateRecords("ledger", [recs[0]], cfg);
  check("LG: no alert when above line", safe.alerts.length === 0);
}

// ── Temporal ───────────────────────────────────────────────────────────────
{
  const cfg = { resources: [{ name: "Chair 1" }, { name: "Chair 2" }], slots: ["09:00", "09:30", "10:00"] };
  const recs = [
    { slot: "09:00", resource: "Chair 1", purpose: "Ravi cleaning" },
    { slot: "09:30", resource: "Chair 1", purpose: "Filling" },
    { slot: "09:00", resource: "Chair 2", purpose: "Extraction" },
    { slot: "09:00", resource: "Chair 2", purpose: "Checkup duplicate" },
  ];
  const t = translateRecords("temporal", recs, cfg);
  check("TM: utilization line", t.lines.some(l => l.includes("4 of 6 slots booked (67%")), all(t.lines));
  check("TM: conflict alert names resource+slot", t.alerts.some(l => l.includes("Chair 2") && l.includes("09:00")), all(t.alerts));
  check("TM: conflict stat", t.stats.conflicts === 1);
  const calm = translateRecords("temporal", [recs[0]], cfg);
  check("TM: no conflicts when clean", calm.alerts.length === 0);
}

// ── Fleet ──────────────────────────────────────────────────────────────────
{
  const recs = [
    { name: "Truck-001", status: "On Road", owner: "Ravi", reading: 15400, service_state: "svc-due" },
    { name: "Truck-002", status: "Idle", owner: "Sam", reading: 9000, service_state: "svc-ok" },
  ];
  const t = translateRecords("fleet", recs, null);
  check("FL: status mix line", t.lines.some(l => l.includes("On Road: 1") && l.includes("Idle: 1")), all(t.lines));
  check("FL: due alert with meter", t.alerts.some(l => l.includes("Truck-001") && l.includes("15,400")), all(t.alerts));
  check("FL: due stat", t.stats.serviceDue === 1);
}

// ── Spatial ────────────────────────────────────────────────────────────────
{
  const cfg = { groupLabel: "Rack", countLabel: "Row", fields: [{ key: "material", label: "Material" }], qtyField: { key: "qty", label: "Qty" } };
  const recs = [
    { rack_id: 1, slot_no: 1, material: "SS304", qty: 40 },
    { rack_id: 1, slot_no: 2, material: "MS IS2062", qty: 10 },
    { rack_id: 1, slot_no: 3, material: "", qty: 0 },
    { rack_id: 2, slot_no: 1, material: "Al 5052", qty: 25 },
  ];
  const t = translateRecords("spatial", recs, cfg);
  check("SP: fill line 3/4", t.lines.some(l => l.includes("3/4 slots filled (75%)")), all(t.lines));
  check("SP: qty total", t.stats.totalQty === 75, String(t.stats.totalQty));
  check("SP: no fullness alert below 95%", t.alerts.length === 0, all(t.alerts));
  const packed = translateRecords("spatial", recs.slice(0, 3).map(r => ({ ...r, material: r.material || "MS" })), cfg);
  check("SP: near-full alert at 100%", packed.alerts.some(l => l.includes("nearly full")), all(packed.alerts));
}

// ── Dispatcher robustness ──────────────────────────────────────────────────
check("Unknown archetype → empty facts", translateRecords("mystery", [{ a: 1 }], null).lines.length === 0);
check("Null config tolerated", translateRecords("fleet", [{ name: "X", status: "S", service_state: "svc-due" }], null).stats.serviceDue === 1);

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
