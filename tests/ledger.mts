// Ledger tests: invariance across two money domains + structural checks.
import { assembleLedger, type LedgerConfig } from "../src/lib/consoles/ledger";

const SHOP: LedgerConfig = {
  productName: "CashBook Pro",
  logoText: "CB",
  tagline: "Daily shop cashbook",
  accentHex: "#34d399",
  dark: true,
  searchHint: "entry, type, account",
  advisory: "Record every entry the moment money moves — memory is not a ledger.",
  openingBalance: 12000,
  lowBalanceThreshold: 3000,
  accounts: [{ name: "Cash" }, { name: "Bank" }],
  entryTypes: [
    { label: "Sales", sign: "in" },
    { label: "Supplier", sign: "out" },
    { label: "Rent", sign: "out" },
  ],
  entries: [
    { label: "Morning sales", amount: 4800, type: "Sales" },
    { label: "Vegetable supplier", amount: 5200, type: "Supplier" },
    { label: "Packaging stock", amount: 1800, type: "Supplier" },
    { label: "Evening sales", amount: 3600, type: "Sales" },
  ],
};

const SCRAP: LedgerConfig = {
  productName: "ScrapKhata",
  logoText: "SK",
  tagline: "Scrap purchases & melting batches",
  accentHex: "#fbbf24",
  dark: false,
  searchHint: "batch, party",
  advisory: "Weigh before payment; settle batches weekly.",
  openingBalance: 50000,
  lowBalanceThreshold: 10000,
  accounts: [{ name: "Cash" }],
  entryTypes: [
    { label: "Scrap Purchase", sign: "out" },
    { label: "Melting Sale", sign: "in" },
  ],
  entries: [
    { label: "Copper scrap 200kg", amount: 14000, type: "Scrap Purchase" },
    { label: "Batch #12 ingot sale", amount: 32000, type: "Melting Sale" },
    { label: "Aluminium scrap 90kg", amount: 6000, type: "Scrap Purchase" },
    { label: "Batch #13 ingot sale", amount: 21000, type: "Melting Sale" },
  ],
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
    .replace(/var ACCOUNTS = [^;]+;/, "")
    .replace(/var TYPES = [^;]+;/, "")
    .replace(/var OPENING = [^;]+;/, "")
    .replace(/var THRESHOLD = [^;]+;/, "")
    .replace(/var state = \{ entries: [\s\S]*?\} ?, /, "")
    .replace(/(['"])(?:\\.|[^\\])*?\1/g, "''")
    .replace(/\b\d+(\.\d+)?\b/g, "N")
    .replace(/\s+/g, "");
}

const a = assembleLedger(SHOP);
const b = assembleLedger(SCRAP);

check("control flow identical across ledgers", surface(a) === surface(b));

check("accounts verbatim", a.includes('"Cash"') && a.includes('"Bank"') && a.includes("Cash") && a.includes("Bank"));
check("entry types with signs compiled", a.includes('\"Sales\"') && a.includes('\"s\":1') && a.includes('\"s\":-1'));
check("opening balance + threshold compiled", a.includes("var OPENING = 12000") && a.includes("var THRESHOLD = 3000"));
check("running balance chain (balAfter)", a.includes("function balAfter(idx)") && a.includes("b += signOf(state.entries[i]) * state.entries[i].a"));
check("threshold alert wired (dip + recover paths)", a.includes("dipped") && a.includes("below your") && a.includes("recovered since"));
check("account filter chips gated on multi-account", a.includes("ACCOUNTS.length > 1") && a.includes("setFilter"));
check("spotlight dim/hit on rows", a.includes(".erow.dim") && a.includes(".erow.hit"));
check("modal contract (focus, close, apply)", a.includes("editF0').focus()") && a.includes("classList.add('open')") && a.includes("classList.remove('open')"));
check("CSV + sync carry signed amounts and balance", a.includes("balance_after") && a.includes("signOf(e) > 0 ? 1 : -1"));
check("single-account ledger skips chips", b.includes("ACCOUNTS.length > 1") && b.includes("chips.innerHTML = ''"));

check("Engine 2: hydrate on boot + autosave on edit", a.includes("PERSIST.hydrate()") && a.includes("PERSIST.schedule()") && a.includes("function applyLoaded(records)"));
check("Engine 2: sync-state chip + shared buildRecords", a.includes('id="syncState"') && a.split("buildRecords()").length >= 3);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
