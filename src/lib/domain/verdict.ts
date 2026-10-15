// Engine verdict computation for saved events.
// Deterministic arithmetic only — never LLM math (vision rule 3).

type AnyRecord = Record<string, unknown>;

export interface EventVerdict {
  type: string;
  lineCount: number;
  summary: string;
  money: { total: number | null; currency: string } | null;
  clients: number | null;
  coverage: { slotsTotal: number; slotsFilled: number; percent: number } | null;
  generatedAt: string;
}

const AMOUNT_RE = /amount|price|rate|revenue|total|value|paid|balance|amt|inr/i;
const QTY_RE = /quantity|qty|units?|count|nos/i;
const CLIENT_RE = /client|customer|cname/i;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s₹$£€]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function columnKey(c: AnyRecord): string {
  return (typeof c.key === "string" ? c.key : "") || (typeof c.label === "string" ? c.label : "");
}

function moneyColumnKeys(columns: unknown[]): string[] {
  if (!Array.isArray(columns)) return [];
  return columns
    .filter((c): c is AnyRecord => isRecord(c) && AMOUNT_RE.test(columnKey(c)))
    .map(columnKey)
    .filter(Boolean);
}

function qtyColumnKey(columns: unknown[]): string | null {
  if (!Array.isArray(columns)) return null;
  const hit = columns.find((c): c is AnyRecord => isRecord(c) && QTY_RE.test(columnKey(c)));
  return hit ? columnKey(hit) : null;
}

function clientColumnKey(columns: unknown[]): string | null {
  if (!Array.isArray(columns)) return null;
  const hit = columns.find((c): c is AnyRecord => isRecord(c) && CLIENT_RE.test(columnKey(c)));
  return hit ? columnKey(hit) : null;
}

function nonEmpty(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtInr(n: number): string {
  return `₹${roundMoney(n).toLocaleString("en-IN")}`;
}

function recordsVerdict(records: unknown[], columns: unknown[]): EventVerdict {
  const amountKey = moneyColumnKeys(columns)[0] ?? null;
  const qtyKey = qtyColumnKey(columns);
  const clientKey = clientColumnKey(columns);

  const clients = new Set<string>();
  let grandTotal = 0;
  let moneyLines = 0;

  for (const raw of records) {
    if (!isRecord(raw)) continue;
    if (clientKey && typeof raw[clientKey] === "string" && raw[clientKey] !== "") {
      clients.add(raw[clientKey]);
    }
    const amount = amountKey ? asNumber(raw[amountKey]) : null;
    const qty = qtyKey ? asNumber(raw[qtyKey]) : null;
    const lineTotal = qty !== null && amount !== null ? qty * amount : amount;
    if (lineTotal !== null) {
      grandTotal = roundMoney(grandTotal + lineTotal);
      moneyLines++;
    }
  }

  const parts: string[] = [];
  parts.push(`${records.length} line${records.length === 1 ? "" : "s"}`);
  if (clients.size > 0) parts.push(`${clients.size} client${clients.size === 1 ? "" : "s"}`);
  if (moneyLines > 0) parts.push(`grand total ${fmtInr(grandTotal)}`);

  return {
    type: "records",
    lineCount: records.length,
    summary: parts.join(", ") || "Capture saved.",
    money: moneyLines > 0 ? { total: grandTotal, currency: "INR" } : null,
    clients: clients.size > 0 ? clients.size : null,
    coverage: null,
    generatedAt: new Date().toISOString(),
  };
}

function gridVerdict(grid: unknown[], schema: AnyRecord): EventVerdict {
  const rowDefs = Array.isArray(schema.rows) ? schema.rows : [];
  const colDefs = Array.isArray(schema.columns) ? schema.columns : [];
  const colKeys = colDefs.map(columnKey).filter(Boolean);

  let slotsFilled = 0;
  const moneySums: Record<string, number> = {};
  const moneyKeys = moneyColumnKeys(colDefs);

  for (const raw of grid) {
    if (!isRecord(raw)) continue;
    for (const colKey of colKeys) {
      const val = raw[colKey];
      if (nonEmpty(val)) slotsFilled++;
      if (moneyKeys.includes(colKey)) {
        const n = asNumber(val);
        if (n !== null) moneySums[colKey] = (moneySums[colKey] || 0) + n;
      }
    }
  }

  const slotsTotal = rowDefs.length * colKeys.length;
  const percent = slotsTotal > 0 ? Math.round((slotsFilled / slotsTotal) * 100) : 0;
  const grandTotal = roundMoney(Object.values(moneySums).reduce((a, b) => a + b, 0));
  const moneyTotal = Object.keys(moneySums).length > 0 ? grandTotal : null;

  const parts: string[] = [];
  if (slotsTotal > 0) parts.push(`${slotsFilled}/${slotsTotal} slots filled (${percent}%)`);
  if (Object.keys(moneySums).length > 0) parts.push(`total ${fmtInr(grandTotal)}`);

  return {
    type: "grid",
    lineCount: grid.length,
    summary: parts.join(", ") || "Capture saved.",
    money: moneyTotal !== null ? { total: moneyTotal, currency: "INR" } : null,
    clients: null,
    coverage: slotsTotal > 0 ? { slotsTotal, slotsFilled, percent } : null,
    generatedAt: new Date().toISOString(),
  };
}

function listVerdict(list: unknown[]): EventVerdict {
  let filled = 0;
  let moneySum = 0;
  let hasMoney = false;
  for (const raw of list) {
    if (!isRecord(raw)) continue;
    if (nonEmpty(raw.value)) filled++;
    if (raw.key && nonEmpty(raw.value) && typeof raw.key === "string" && AMOUNT_RE.test(raw.key)) {
      const n = asNumber(raw.value);
      if (n !== null) {
        moneySum = roundMoney(moneySum + n);
        hasMoney = true;
      }
    }
  }
  const parts = [`${filled} field${filled === 1 ? "" : "s"}`];
  if (hasMoney) parts.push(`total ${fmtInr(moneySum)}`);
  return {
    type: "list",
    lineCount: list.length,
    summary: parts.join(", ") || "Capture saved.",
    money: hasMoney ? { total: moneySum, currency: "INR" } : null,
    clients: null,
    coverage: null,
    generatedAt: new Date().toISOString(),
  };
}

export function computeEventVerdict(
  workflowConfig: AnyRecord,
  payload: AnyRecord
): EventVerdict {
  const schema = isRecord(workflowConfig.schema) ? workflowConfig.schema : {};
  const columns = Array.isArray(schema.columns) ? schema.columns : [];

  if (Array.isArray(payload.records)) {
    return recordsVerdict(payload.records, columns);
  }
  if (Array.isArray(payload.grid)) {
    return gridVerdict(payload.grid, schema);
  }
  if (Array.isArray(payload.list)) {
    return listVerdict(payload.list);
  }
  return {
    type: "unknown",
    lineCount: 0,
    summary: "Capture saved.",
    money: null,
    clients: null,
    coverage: null,
    generatedAt: new Date().toISOString(),
  };
}