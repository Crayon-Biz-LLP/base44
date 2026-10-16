// Shared fixtures — one realistic config per archetype, the exact shape the
// extractors emit. Single source of truth for scripts/demo-before-after.mts
// and tests/validate-artifact.mts so every gate assembles identical bytes.
import type { ConsoleConfig } from "../src/lib/consoles/studio-v2";
import type { TargetBoardConfig } from "../src/lib/consoles/target-board";
import type { PipelineConfig } from "../src/lib/consoles/pipeline";
import type { LedgerConfig } from "../src/lib/consoles/ledger";
import type { TemporalConfig } from "../src/lib/consoles/temporal";
import type { FleetConfig } from "../src/lib/consoles/fleet";
import type { QueueConfig } from "../src/lib/consoles/queue";
import type { ChecklistConfig } from "../src/lib/consoles/checklist";
import type { RosterConfig } from "../src/lib/consoles/roster";
import type { CalendarConfig } from "../src/lib/consoles/calendar";

export const spatial: ConsoleConfig = {
  productName: "LaserRack Pro", logoText: "LR", tagline: "Sheet metal yard, 30 racks × 8 rows",
  accentHex: "#f59e0b", dark: true,
  countLabel: "Row", groupLabel: "Rack", unitsPerGroup: 8, groupCount: 30,
  field1: { key: "material", label: "Material", type: "text" },
  field2: { key: "grade", label: "Grade", type: "text" },
  field3: { key: "thickness", label: "Thickness (mm)", type: "number" },
  qtyField: { key: "sheets", label: "sheets" },
  categories: [
    { id: "ss", label: "Stainless", colorHex: "#38bdf8", match: "SS" },
    { id: "ms", label: "Mild Steel", colorHex: "#f87171", match: "MS" },
    { id: "al", label: "Aluminium", colorHex: "#34d399", match: "AL" },
  ],
  searchHint: "SS304, 3mm, Rack 12",
  advisory: "Log thickness on every sheet — tonnage math is only as honest as the thinnest entry.",
  features: { tonnage: true, weightAudit: true, balanceBadge: true },
  densityMap: [{ match: "SS", d: 7.9 }, { match: "MS", d: 7.85 }, { match: "AL", d: 2.7 }],
  sheetAreaM2: 2.973,
  audit: { heavySlotKg: 150, elevatedRow: 4, heavyRowKg: 3500 },
  voice: {
    sectionTitle: "Yard", sectionSubtitle: "Heavy base to light top", unitNoun: "sheet",
    searchExamples: ["SS304", "3mm", "MS"],
    guidelines: [
      { title: "Heavy base to light top", detail: "Plates above 6mm live on rows 1–3; elevated heavy loads trip the audit banner." },
      { title: "Grade before gauge", detail: "Picking starts with grade, then thickness — search grade first." },
    ],
  },
  heuristics: { heavyGaugeMinMm: 6, rowCapacityTons: 4.5, lowRows: 3, midRows: 6 },
};

export const targetBoard: TargetBoardConfig = {
  productName: "MetricFlow Pro", logoText: "MF", tagline: "Daily floor scoreboard",
  accentHex: "#f59e0b", dark: true,
  people: [{ name: "Bhuvana" }, { name: "Rahul" }, { name: "Meera" }, { name: "Arjun" }, { name: "Priya" }, { name: "Sana" }],
  metrics: [
    { key: "activations", label: "Activations", target: 40 },
    { key: "collections", label: "Collections", target: 25 },
    { key: "siteVisits", label: "Site Visits", target: 12 },
    { key: "renewals", label: "Renewals", target: 8 },
  ],
  searchHint: "Find a person…",
  advisory: "Log site visits by noon — afternoon walk-ins convert 2× better with a morning visit on record.",
  voice: {
    boardTitle: "Sales Floor Standup", unitNoun: "activation", searchExamples: ["Bhuvana", "Renew", "Site"],
    guidelines: [
      { title: "Front-load the floor", detail: "First two hours carry the day — activations before 11am double the close rate." },
      { title: "Collections follow visits", detail: "Every above-target collection this month had a site visit logged the prior day." },
      { title: "Renewals are a 10-minute task", detail: "Call the three oldest expiring policies first; renewal pace tracks call order." },
    ],
  },
  heuristics: { onTargetPct: 70, paceHour: 18, minPacePct: 60 },
  stock: [
    { name: "Paracetamol strips", unit: "pcs", qty: 12, minQty: 10 },
    { name: "ORS sachets", unit: "pcs", qty: 40, minQty: 15 },
    { name: "Cold Relief batches", unit: "5 days", qty: 3, minQty: 2 },
  ],
};

export const pipeline: PipelineConfig = {
  productName: "StitchFlow", logoText: "SF", tagline: "Garment unit, 42 open job cards",
  accentHex: "#38bdf8", dark: true, searchHint: "Suresh, stitching, ORD", advisory: "Cutting empty while stitching piles up means the cutting table is the jam — pull work forward.",
  slaDays: 5,
  stages: [{ label: "Cutting" }, { label: "Stitching" }, { label: "QC" }, { label: "Packing" }, { label: "Dispatch" }],
  items: [
    { title: "ORD-101 School uniforms", stageIdx: 0, owner: "Suresh" },
    { title: "ORD-102 Hotel linens", stageIdx: 1, owner: "Ravi" },
    { title: "ORD-103 Aprons batch", stageIdx: 1, owner: "Ravi" },
    { title: "ORD-104 T-shirt run", stageIdx: 2, owner: "Divya" },
    { title: "ORD-105 Kurti order", stageIdx: 2, owner: "Divya" },
    { title: "ORD-106 Saree blouses", stageIdx: 3, owner: "Kavya" },
    { title: "ORD-107 Denim jackets", stageIdx: 4, owner: "Kavya" },
    { title: "ORD-108 Scrubs", stageIdx: 1, owner: "Manoj" },
    { title: "ORD-109 Towels", stageIdx: 3, owner: "Manoj" },
    { title: "ORD-110 Curtains", stageIdx: 0, owner: "Suresh" },
  ].map((i, n) => ({ title: `ORD-${101 + n} ${i.title.split(" ").slice(1).join(" ")}`, stageIdx: i.stageIdx, owner: i.owner })),
  voice: {
    boardTitle: "Shop Floor Board", itemNoun: "job card", searchExamples: ["Suresh", "stitching", "ORD"],
    guidelines: [
      { title: "Cutting feeds everything", detail: "An empty cutting stage starves all four lanes downstream within a shift." },
      { title: "QC is not a parking lot", detail: "Anything over 3 days in QC goes back to the line lead, not forward." },
    ],
  },
  heuristics: { starvedStageIdx: 0, agingDays: 3 },
  parts: [{ name: "Zip", rate: 40 }, { name: "Button set", rate: 25 }, { name: "Lining (m)", rate: 60 }],
  repairs: [
    { card: "ORD-104 T-shirt run", part: "Button set", qty: 12 },
    { card: "ORD-105 Kurti order", part: "Zip", qty: 6 },
    { card: "ORD-102 Hotel linens", part: "Lining (m)", qty: 18 },
  ],
  ownerStages: [{ label: "Dispatch" }],
};

export const ledger: LedgerConfig = {
  productName: "CashBook Pro", logoText: "CB", tagline: "Kirana counter khata, daily",
  accentHex: "#34d399", dark: true, searchHint: "supplier, cash sale, rent", advisory: "Match every UPI batch to a cash sale entry before closing — drift starts at 40 rupees.",
  openingBalance: 18000, lowBalanceThreshold: 5000,
  accounts: [{ name: "Cash" }, { name: "Bank" }],
  entryTypes: [
    { label: "Cash Sale", sign: "in" }, { label: "UPI Sale", sign: "in" },
    { label: "Supplier Payment", sign: "out" }, { label: "Rent", sign: "out" },
  ],
  entries: [
    { label: "Morning cash sale", amount: 4200, type: "Cash Sale" },
    { label: "UPI batch — noon", amount: 6100, type: "UPI Sale" },
    { label: "Grocer fresh stock", amount: 9800, type: "Supplier Payment" },
    { label: "Evening cash sale", amount: 5300, type: "Cash Sale" },
    { label: "Shop rent", amount: 12000, type: "Rent" },
    { label: "UPI batch — evening", amount: 4800, type: "UPI Sale" },
    { label: "Wholesale flour", amount: 7200, type: "Supplier Payment" },
    { label: "Late cash sale", amount: 3100, type: "Cash Sale" },
  ],
  voice: {
    boardTitle: "Counter Khata", entryNoun: "entry", searchExamples: ["supplier", "cash sale", "rent"],
    guidelines: [
      { title: "Close the day, close the drift", detail: "Reconcile UPI batches against cash sale entries nightly; weekly reconciliation hides leaks." },
      { title: "Big outflows wait for morning", detail: "Rent and wholesale payments go out after the first sale lands — never from opening float." },
    ],
  },
  heuristics: { outflowCapPct: 60 },
};

export const temporal: TemporalConfig = {
  productName: "ChairFlow", logoText: "CF", tagline: "Salon floor, four chairs, today",
  accentHex: "#a78bfa", dark: true, searchHint: "cleaning, Ramesh, 10:30", advisory: "Slot hair spas next to a gap — they run 20 minutes over and the next walk-in waits.",
  resources: [{ name: "Chair 1" }, { name: "Chair 2" }, { name: "Chair 3" }, { name: "Chair 4" }],
  slots: [
    { purpose: "Haircut — walk-in", resource: "Chair 1" },
    { purpose: "Beard trim", resource: "Chair 1" },
    { purpose: "Hair spa", resource: "Chair 2" },
    { purpose: "Colour touch-up", resource: "Chair 2" },
    { purpose: "Kids haircut", resource: "Chair 3" },
    { purpose: "Shave", resource: "Chair 3" },
    { purpose: "Haircut — Ramesh", resource: "Chair 4" },
    { purpose: "Facial", resource: "Chair 4" },
    { purpose: "Blow dry", resource: "Chair 1" },
    { purpose: "Head massage", resource: "Chair 2" },
  ],
  voice: {
    boardTitle: "Chair Chart", resourceNoun: "chair", searchExamples: ["cleaning", "Ramesh", "spa"],
    guidelines: [
      { title: "Leave walk-in gaps", detail: "Two open slots per chair per hour; a fully booked chart turns walk-ins away." },
      { title: "Spas take a chair for 45", detail: "Book hair spas at the top of the hour or the next guest waits 20 minutes." },
    ],
  },
  heuristics: { busyThresholdPct: 75 },
};

export const fleet: FleetConfig = {
  productName: "FleetPulse", logoText: "FP", tagline: "Six trucks, two routes, service tracking",
  accentHex: "#38bdf8", dark: true, searchHint: "TN-01, hydraulic, Idle", advisory: "Book service the week a truck crosses 90% of interval — tyre and clutch failures cluster past that line.",
  serviceEvery: 10000,
  serviceUnit: "km",
  statuses: [{ label: "Running" }, { label: "Idle" }, { label: "Maintenance" }],
  assets: [
    { name: "TN-01-AB-1234", status: "Running", owner: "Karthik", lastService: 40000 },
    { name: "TN-01-AB-5678", status: "Running", owner: "Mohan", lastService: 52000 },
    { name: "TN-02-CD-9012", status: "Idle", owner: "Ramesh", lastService: 24000 },
    { name: "TN-02-CD-3456", status: "Maintenance", owner: "Vijay", lastService: 30000 },
    { name: "TN-03-EF-7890", status: "Running", owner: "Karthik", lastService: 12000 },
    { name: "TN-03-EF-2345", status: "Running", owner: "Mohan", lastService: 5000 },
  ],
  readings: [
    { asset: "TN-01-AB-1234", value: 48200 },
    { asset: "TN-01-AB-5678", value: 59500 },
    { asset: "TN-02-CD-9012", value: 31500 },
    { asset: "TN-02-CD-3456", value: 40100 },
    { asset: "TN-03-EF-7890", value: 19800 },
    { asset: "TN-03-EF-2345", value: 9200 },
  ],
  voice: {
    boardTitle: "Yard Status", assetNoun: "truck", searchExamples: ["TN-01", "Idle", "hydraulic"],
    guidelines: [
      { title: "Driver logs at trip end", detail: "Meter readings logged at trip end catch service windows a week earlier than depot audits." },
      { title: "Idle trucks rust fastest", detail: "An Idle truck over 3 days goes next into Maintenance — rotate or route it." },
    ],
  },
  heuristics: { runTargetPct: 70 },
};

export const queue: QueueConfig = {
  productName: "TokenSetu", logoText: "TS", tagline: "Walk-in OPD, three counters",
  accentHex: "#a78bfa", dark: true, searchHint: "23, fever, Dr. Rao", advisory: "Call the next token before the current patient leaves — dead counter seconds are where queues are born.",
  avgMinutes: 8,
  counters: [{ name: "Dr. Rao" }, { name: "Dr. Iyer" }, { name: "Billing" }],
  tokens: [
    { label: "18", purpose: "BP check", },
    { label: "19", purpose: "Fever", },
    { label: "20", purpose: "Wound dressing", },
    { label: "21", purpose: "Fever — child", },
    { label: "22", purpose: "Injection", },
    { label: "23", purpose: "BP check", },
    { label: "24", purpose: "Skin rash", },
    { label: "25", purpose: "Fever", },
    { label: "26", purpose: "Report review", },
    { label: "27", purpose: "BP check", },
    { label: "28", purpose: "Walk-in", },
    { label: "29", purpose: "Walk-in", },
  ],
  voice: {
    boardTitle: "OPD Line", personNoun: "patient", searchExamples: ["23", "fever", "Billing"],
    guidelines: [
      { title: "Six is the rush line", detail: "Six waiting per counter means 45+ minutes — open the extra counter before it shows on faces." },
      { title: "Billing runs ahead of the last chair", detail: "Send the bill with the last injection, not after — the exit queue is the one patients remember." },
    ],
  },
  heuristics: { rushPerCounter: 6 },
};

export const checklist: ChecklistConfig = {
  productName: "SafeRound", logoText: "SR", tagline: "Cloud kitchen, daily hygiene rounds",
  accentHex: "#34d399", dark: true, searchHint: "chimney, closing, oil", advisory: "Close the round before the last shift leaves — a miss logged at 9pm is fixed in 10 minutes, at 9am it's a violation.",
  passTargetPct: 90,
  rounds: [{ name: "Opening checklist" }, { name: "Evening hygiene round" }, { name: "Closing checklist" }],
  items: [
    { round: "Opening checklist", text: "Chimney exhaust on" },
    { round: "Opening checklist", text: "Oil temp logged" },
    { round: "Opening checklist", text: "Handwash station stocked" },
    { round: "Evening hygiene round", text: "Prep counters degreased" },
    { round: "Evening hygiene round", text: "Waste bins cleared" },
    { round: "Evening hygiene round", text: "Cold storage at 4°C" },
    { round: "Closing checklist", text: "Gas line valve shut" },
    { round: "Closing checklist", text: "Wet floor sign placed" },
  ],
  staff: [{ name: "Anand" }, { name: "Kavya" }],
  voice: {
    boardTitle: "Daily Rounds", roundNoun: "round", searchExamples: ["chimney", "closing", "gas"],
    guidelines: [
      { title: "Tick it where you see it", detail: "Rounds done from memory fail audits — walk with the phone, tick at the equipment." },
      { title: "A red tick is information", detail: "Honest crosses get fixed; hidden ones get fined. Never mark a pass to end the day faster." },
    ],
  },
  heuristics: { streakTarget: 5 },
};

export const roster: RosterConfig = {
  productName: "WageBook", logoText: "WB", tagline: "Tailoring unit, piece-rate hajri",
  accentHex: "#f59e0b", dark: true, searchHint: "Ramesh, half", advisory: "Pay the week's tally every Monday — a predictable payout day is why good tailors stay.",
  unitLabel: "piece",
  workers: [
    { name: "Ramesh", rate: 55 },
    { name: "Suresh", rate: 60 },
    { name: "Divya", rate: 50 },
    { name: "Kavya", rate: 55 },
    { name: "Manoj", rate: 45 },
  ],
  attendance: [
    { name: "Ramesh", status: "full" },
    { name: "Suresh", status: "full" },
    { name: "Divya", status: "half" },
    { name: "Kavya", status: "full" },
    { name: "Manoj", status: "absent" },
  ],
  voice: {
    boardTitle: "Hajri Book", unitNoun: "piece", searchExamples: ["Ramesh", "half"],
    guidelines: [
      { title: "Half days are still days", detail: "A half mark beats a blank — regulars with half days return; workers with zeroed weeks don't." },
      { title: "Rate changes go in the book", detail: "Any rate talk happens at the register, not the machine — the book is the whole truth at payout." },
    ],
  },
  heuristics: { absenceAlertPct: 20 },
};

export const calendar: CalendarConfig = {
  productName: "DateSetu", logoText: "DS", tagline: "Marriage hall bookings & renewals",
  accentHex: "#a78bfa", dark: true, searchHint: "Saturday, FSSAI, advance", advisory: "Advance received means date confirmed — a date held on a phone call is a date you can lose twice.",
  events: [
    { title: "Sharma wedding — 300 pax", weekday: "Sat", time: "18:00" },
    { title: "Reception — Patel", weekday: "Sun", time: "12:00" },
    { title: "Sangeet night", weekday: "Fri", time: "19:00" },
    { title: "Corporate party — TCS", weekday: "Wed", time: "19:30" },
    { title: "Mehendi morning", weekday: "Sat", time: "10:00" },
  ],
  renewals: [
    { item: "FSSAI license", dueInDays: 12, note: "renewal papers ready" },
    { item: "GST filing — GSTR-3B", dueInDays: 0, note: "filed papers with CA" },
    { item: "Property tax", dueInDays: -2, note: "waiting for funds" },
    { item: "Generator insurance", dueInDays: 40, note: "" },
    { item: "Sound system AMC", dueInDays: 65, note: "" },
  ],
  desk: [{ name: "Lata" }],
  voice: {
    boardTitle: "Booking Chart", searchExamples: ["Saturday", "FSSAI", "advance"],
    guidelines: [
      { title: "Advance is the yes", detail: "Confirmed means advance received — everything else is a maybe wearing a nice shirt." },
      { title: "Sunday is for next Sunday", detail: "Walk the next week's diary every Sunday evening; renewals never surprise a caller with a diary in hand." },
    ],
  },
  heuristics: { soonDays: 7 },
};
