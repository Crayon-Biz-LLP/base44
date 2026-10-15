// Archetype registry + deterministic classifier — Phase 0 foundation.
// The registry is CONTENT (keywords per archetype); the classifier is CODE
// (scoring). Client prompts evolve the registry, not the architecture.
export const ARCHETYPES = [
  {
    id: "spatial",
    label: "Spatial / Storage Grid",
    question: "Where is everything?",
    keywords: ["rack", "racks", "shelf", "shelves", "bin", "bins", "warehouse", "storage", "slot", "slots", "bay", "bays", "cold storage", "freezer", "container", "yard", "godown"],
    strongKeywords: ["racks", "shelves", "warehouse", "godown"],
  },
  {
    id: "target-board",
    label: "Target / Performance Board",
    question: "Who hit their numbers today?",
    keywords: ["employee", "employees", "staff", "team", "target", "targets", "report their", "actual numbers", "sales", "quota", "performance", "daily report", "monthly target"],
    strongKeywords: ["daily targets", "sales staff", "targets per", "staff with daily", "each person reports"],
  },
  {
    id: "pipeline",
    label: "Pipeline / State Machine",
    question: "What's stuck, and where?",
    keywords: ["pipeline", "stage", "stages", "kanban", "approval", "approvals", "lead", "leads", "job card", "repair", "queue", "status of", "follow up", "complaint", "move through", "goes through", "in progress", "orders"],
  },
  {
    id: "ledger",
    label: "Ledger / Reconciler",
    question: "What do we have after all movements?",
    keywords: ["ledger", "balance", "receipts", "payments", "expenses", "income", "transaction", "transactions", "khata", "cashbook", "udhaar", "outstanding", "scrap"],
  },
  {
    id: "temporal",
    label: "Temporal Booking",
    question: "Who or what is free, when?",
    keywords: ["appointment", "appointments", "booking", "bookings", "slot booking", "schedule", "roster", "shifts", "room", "chairs", "dock", "reservation",
      "tuition", "tutor", "tutors", "teacher", "teachers", "coaching", "class", "classes", "session", "sessions", "timetable", "consultation", "consultations", "patients per day"],
    strongKeywords: ["appointment", "appointments", "booking", "bookings", "booked", "reservation", "roster",
      "tuition", "teacher", "teachers", "coaching", "session", "sessions", "timetable", "consultation", "consultations"],
  },
  {
    id: "fleet",
    label: "Asset / Fleet Tracker",
    question: "What's running and what needs service?",
    keywords: ["vehicle", "vehicles", "truck", "trucks", "van", "vans", "delivery van", "delivery vans", "lorry", "lorries", "tempo", "fleet", "machine", "machines", "cnc", "equipment", "maintenance", "service due", "meter", "odometer", "diesel", "tractor", "tractors", "generator", "generators", "excavator", "excavators", "bulldozer", "jcb"],
    strongKeywords: ["tractors", "tractor", "running hours", "engine hours", "service is due", "service interval", "odometer reading", "service every"],
  },
  {
    id: "queue",
    label: "Token Queue",
    question: "Who's next, and how long is the wait?",
    keywords: ["token", "tokens", "token system", "now serving", "queue number", "queue token", "walk in", "walk-in", "walkins", "opd", "serp queue", "ration shop", "billing counter", "serving", "first come", "wait time", "waiting time", "waiting hall", "crowd", "rush"],
    strongKeywords: ["token system", "token number", "now serving", "token counter", "tokens per day", "walk-in clinic", "dispensary counter"],
  },
  {
    id: "checklist",
    label: "Checklist / Compliance Rounds",
    question: "Did today's rounds pass?",
    keywords: ["checklist", "checklists", "hygiene audit", "hygiene round", "audit round", "safety audit", "inspection", "inspections", "opening checklist", "closing checklist", "sop", "quality round", "rounds", "fire safety", "cleanliness"],
    strongKeywords: ["checklist", "checklists", "hygiene audit", "safety audit", "opening and closing", "audit round"],
  },
  {
    id: "roster",
    label: "Attendance & Payroll",
    question: "Who worked, and what do they take home?",
    keywords: ["attendance", "attendance register", "payroll", "piece rate", "piece-rate", "wages", "daily wages", "per piece", "tailors salary", "monthly payout", "salary calculation", "workers attendance", "half day", "overtime", "advance salary", "shift attendance"],
    strongKeywords: ["attendance register", "piece rate", "piece-rate", "daily wages", "per piece", "attendance and payroll", "salary per"],
  },
  {
    id: "calendar",
    label: "Date Calendar / Renewals",
    question: "What's coming up on which date?",
    keywords: ["calendar", "date wise", "date-wise", "renewal", "renewals", "expiry", "expiry date", "license", "licence", "gst filing", "compliance due", "hall booking", "event booking", "advance booking", "wedding season", "weekly timetable", "due dates", "insurance due"],
    strongKeywords: ["expiry date", "renewal due", "hall booking", "event booking", "advance booking", "date wise", "gst filing"],
  },
] as const;

export type ArchetypeId = (typeof ARCHETYPES)[number]["id"];

/** Deterministic keyword scoring: normalized prompt → ranked archetype ids.
 *  strongKeywords are discriminative domain words — they score 4× so a prompt
 *  like "dental clinic, 30-minute slots, who is booked" routes to temporal,
 *  not spatial, even though "slots" is literally a spatial keyword. */
export function pickArchetype(prompt: string): { id: ArchetypeId; score: number; runnerUp?: ArchetypeId; confidence: "high" | "low" } {
  const text = " " + prompt.toLowerCase().replace(/[^a-z0-9\s]/g, " ") + " ";
  const scored = ARCHETYPES.map(a => {
    let score = 0;
    const hits = (kws: readonly string[], weight: number) => {
      for (const kw of kws) {
        // count occurrences; multi-word keywords score double
        const re = new RegExp("\\s" + kw.replace(/\s/g, "\\s+") + "\\s", "g");
        score += (text.match(re) || []).length * weight * (kw.includes(" ") ? 2 : 1);
      }
    };
    hits(a.keywords, 1);
    hits("strongKeywords" in a ? a.strongKeywords : [], 4);
    return { id: a.id, score };
  }).sort((x, y) => y.score - x.score);
  // Confidence floor: below 3 points of evidence the prompt carries almost no
  // archetype signal (e.g. a single generic "slots"). Routing is still returned
  // (extraction usually disambiguates from the nouns), but callers can surface
  // a clarify step instead of silently committing to a wrong shape.
  const confidence = scored[0].score >= 3 ? "high" : "low";
  return { id: scored[0].id, score: scored[0].score, runnerUp: scored[1].score > 0 ? scored[1].id : undefined, confidence };
}

/** Canonical trigger prompts — the classifier accuracy gate. */
export const CLASSIFIER_CASES: { prompt: string; expected: ArchetypeId }[] = [
  { prompt: "I run a sheet laser cutting factory with 30 racks, 8 rows per rack, tracking material and thickness", expected: "spatial" },
  { prompt: "cold storage facility with 12 freezer racks, 6 shelves each, crates and temperature zones", expected: "spatial" },
  { prompt: "4 employees must report their actual numbers daily against targets for New, 10DDay, 20Days", expected: "target-board" },
  { prompt: "my sales team of 6 has monthly targets and reports daily performance numbers", expected: "target-board" },
  { prompt: "repair shop job cards move through stages: received, diagnosis, repair, quality check, delivered", expected: "pipeline" },
  { prompt: "track customer complaints with follow-ups and approval status", expected: "pipeline" },
  { prompt: "daily cashbook for my shop: receipts, payments and running balance with outstanding udhaar", expected: "ledger" },
  { prompt: "scrap material purchases and melting batch expenses with balances", expected: "ledger" },
  { prompt: "dental clinic with 3 chairs, appointments every 30 minutes from 9am to 8pm", expected: "temporal" },
  { prompt: "truck dock booking schedule for loading and unloading shifts", expected: "temporal" },
  { prompt: "fleet of 15 trucks with diesel logs, odometer readings and service due dates", expected: "fleet" },
  { prompt: "CNC machines on the floor need maintenance tracking by runtime hours", expected: "fleet" },
  // Routing traps learned from the 10-tenant India E2E run:
  { prompt: "I run a tuition centre with 4 teachers. Each teacher takes 6 half-hour slots daily from 4pm to 8pm", expected: "temporal" },
  { prompt: "coaching classes with 5 batches, each batch has an evening session on the shared court", expected: "temporal" },
  { prompt: "my two-wheeler showroom floor has 5 sales staff with daily targets: bookings target 6, insurance 8", expected: "target-board" },
  { prompt: " Kirana store shelves with bins for packets and expiry dates", expected: "spatial" },
  // The four new archetypes (queue / checklist / roster / calendar):
  { prompt: "my clinic OPD needs a token system, patients just walk in and are served in order", expected: "queue" },
  { prompt: "now serving token counter for the ration shop, 80 walk-ins a day", expected: "queue" },
  { prompt: "kitchen must run a hygiene audit checklist every evening with inspection items", expected: "checklist" },
  { prompt: "opening and closing checklists with safety audit items for my factory floor", expected: "checklist" },
  { prompt: "5 tailors with piece-rate wages, mark attendance daily and calculate payout", expected: "roster" },
  { prompt: "workers attendance register with daily wages and half-day marking for payroll", expected: "roster" },
  { prompt: "medicine batches with expiry dates and GST filing due dates, renewal reminders", expected: "calendar" },
  { prompt: "marriage hall booking calendar with advance payments and date-wise events", expected: "calendar" },
  // Traps: shapes the new archetypes must NOT steal from older ones.
  { prompt: "dental clinic appointment book with 3 chairs and evening slots for root canal patients", expected: "temporal" },
  { prompt: "water can delivery — track how many cans each house took and their udhaar balance", expected: "ledger" },
];
