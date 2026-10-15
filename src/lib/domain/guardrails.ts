import {
  deriveChips,
  deriveKey,
  GridColumnSchema,
  IntelligenceSchema,
  InvariantSchema,
  type Manifest,
  type GridManifest,
  type ListManifest,
} from "./manifest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Manifest guardrails — deterministic referential integrity + safe
// normalization that runs AFTER the LLM extraction and BEFORE storing.
//
// Scope (what this layer may and may not do):
//   - MAY drop/remap intelligence keys that reference nonexistent fields
//     (phantom keys). A constraint on a nonexistent field is a lie: it either
//     hard-blocks every submission or silently does nothing — both to be avoided.
//   - MAY rescue a numeric target that the model misplaced into an invariant by
//     binding it onto the matching column (type: number + derived quickChips).
//   - MAY enforce entryMode: "personal" when the user's own prompt demands
//     per-person reporting (build-time only; the data sweep never flips modes).
//   - MUST NOT change target VALUES, verdict arithmetic, or presentation
//     semantics beyond the presentation-only rules above.
// ---------------------------------------------------------------------------

export const PERSONAL_TOKENS = [
  "each",
  "every",
  "their own",
  "own row",
  "own numbers",
  "per person",
  "per employee",
  "per staff",
  "my employees",
  "my staff",
  "staff report",
  "report their",
  "update their",
  "own numbers alone",
  "alone",
];

const NUMERIC_OPS = new Set(["gt", "gte", "lt", "lte", "eq"]);
const NUMERIC_TYPES = new Set(["number", "currency"]);

type Col = z.infer<typeof GridColumnSchema>;
type Invariant = z.infer<typeof InvariantSchema>;
type Intel = z.infer<typeof IntelligenceSchema>;
type CoverageItem = NonNullable<Intel["coverage"]>[number];
type ThresholdItem = NonNullable<Intel["threshold_alert"]>[number];
type StatusMatrixItem = NonNullable<Intel["status_matrix"]>[number];

export interface GuardrailReport {
  schema: Manifest;
  errors: string[];
  fixes: string[];
  ok: boolean;
}

export interface GuardrailOptions {
  /** Build-time: allow "personal"/entryMode enforcement from the prompt. Default true. */
  enforceEntryMode?: boolean;
}

/** Lowercased lookup: raw key/label -> canonical key; plus normalized tokens for fuzzy remap. */
interface Scope {
  exact: Map<string, string>;
  tokens: Array<{ key: string; token: string }>;
  columns: Map<string, Col>;
}

function buildScope(schema: Manifest): Scope {
  const exact = new Map<string, string>();
  const tokens: Array<{ key: string; token: string }> = [];
  const columns = new Map<string, Col>();

  const register = (label: string | undefined, key: string | undefined, col?: Col) => {
    const canonical = (typeof key === "string" && key.length > 0) ? key : deriveKey(label ?? "");
    const token = canonical.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (typeof label === "string" && label.length > 0) exact.set(label.toLowerCase(), canonical);
    exact.set(canonical.toLowerCase(), canonical);
    if (token.length >= 3) tokens.push({ key: canonical, token });
    if (col) columns.set(canonical, col);
  };

  if (schema.layout_type === "list") {
    for (const f of (schema as ListManifest).fields) register(f.label, f.key);
  } else {
    const grid = schema as GridManifest;
    for (const r of grid.rows ?? []) register(r.label, r.key);
    for (const c of grid.columns ?? []) register(c.label, c.key, c);
  }

  return { exact, tokens, columns };
}

/** Unique substring containment remap (len>=3). Returns null when 0 or many candidates. */
function fuzzyRemap(raw: string, scope: Scope): string | null {
  const norm = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (norm.length < 3) return null;
  const hits = new Set<string>();
  for (const t of scope.tokens) {
    if (t.token.includes(norm) || (norm.includes(t.token) && t.token.length >= 3)) hits.add(t.key);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

function resolve(raw: string, scope: Scope): string | null {
  return scope.exact.get(raw.toLowerCase()) ?? fuzzyRemap(raw, scope);
}

export interface PromptTarget {
  value: number;
  display: string;
}

/** "Label 3, 10DDay 20" -> { label-lower: PromptTarget }. Deterministic, tolerant of wording. */
export function extractPromptTargets(userPrompt: string): Map<string, PromptTarget> {
  const out = new Map<string, PromptTarget>();
  // Clauses are separated by commas/colons/semicolons/newlines. Only a short
  // label immediately followed by a number (and ending the clause) is a target
  // pair. False-positive headings never bind: the binding step re-checks
  // against real column labels.
  const re =
    /(?:^|[,:;\n])\s*([A-Za-z0-9][A-Za-z0-9 \-]{1,29}?)\s*[:=]?\s*(\d+)(?=\s*(?:[,.\n]| and |$))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(userPrompt)) !== null) {
    const lower = m[1].toLowerCase().trim().replace(/[\s-]+/g, "");
    if (lower.length >= 2 && /[a-z]/.test(lower)) {
      out.set(lower, { value: Number(m[2]), display: m[1].trim() });
    }
  }
  return out;
}

/** Compare prompt-stated targets against column targets. For the repair loop. */
export function validateAgainstPrompt(schema: Manifest, userPrompt?: string | null): string[] {
  if (schema.layout_type !== "grid" || !userPrompt) return [];
  const grid = schema as GridManifest;
  const stated = extractPromptTargets(userPrompt);
  if (stated.size === 0) return [];
  const issues: string[] = [];
  const present = new Set((grid.columns ?? []).map((c) => (c.label ?? c.key ?? "").toLowerCase()));
  for (const [lower, t] of stated) {
    const col = (grid.columns ?? []).find((c) => (c.label ?? "").trim().toLowerCase() === lower);
    if (!col) {
      // The prompt enumerates a metric the manifest has no column for — the
      // model collapsed/dropped it. Demand it back.
      issues.push(`prompt specifies metric '${t.display}' (target ${t.value}) but ui_schema has no such column (have: ${[...present].join(", ") || "none"}) — include every prompt metric as its own column`);
      continue;
    }
    const label = (col.label ?? "").trim();
    if (typeof col.target === "number" && col.target !== t.value) {
      issues.push(`column '${label}': prompt specifies target ${t.value} but you set ${col.target} — reconcile to ${t.value}`);
    } else if (typeof col.target !== "number") {
      issues.push(`column '${label}': prompt specifies target ${t.value} — set "target": ${t.value}, "type": "number", and derive quickChips`);
    }
  }
  return issues;
}

/** Deterministic fallback: bind prompt-stated targets onto matching columns. */
function bindPromptTargets(schema: Manifest, userPrompt?: string | null, fixes?: string[]): void {
  if (schema.layout_type !== "grid" || !userPrompt) return;
  const grid = schema as GridManifest;
  const stated = extractPromptTargets(userPrompt);
  if (stated.size === 0) return;
  for (const col of grid.columns ?? []) {
    const label = (col.label ?? "").trim();
    if (label.length < 2) continue;
    const want = stated.get(label.toLowerCase());
    if (want === undefined) continue; // prompt didn't mention this column
    if (typeof col.target === "number") continue; // explicit target wins; never overwrite
    col.target = want.value;
    if (!NUMERIC_TYPES.has(col.type ?? "")) col.type = "number";
    const chips = deriveChips(col);
    if (chips) col.quickChips = chips;
    fixes?.push(`column '${label}': bound prompt-stated target ${want.value}`);
  }
}

/**
 * Deterministic fallback: materialize metric columns the prompt enumerates but
 * the model collapsed or omitted. Confidence gate: grid + person-like rows, so
 * we never inject columns into date-rule rosters.
 */
function materializePromptColumns(schema: Manifest, userPrompt?: string | null, fixes?: string[]): void {
  if (schema.layout_type !== "grid" || !userPrompt) return;
  const grid = schema as GridManifest;
  if (!Array.isArray(grid.rows) || grid.rows.length === 0) return;
  if (!grid.rows.every((r) => !r.dateRule && typeof r.label === "string" && r.label.trim().length > 0)) return;
  const stated = extractPromptTargets(userPrompt);
  if (stated.size === 0) return;
  const existing = new Set((grid.columns ?? []).map((c) => (c.label ?? c.key ?? "").toLowerCase()));
  for (const [lower, t] of stated) {
    if (existing.has(lower)) continue;
    const col: Col = {
      label: t.display,
      key: deriveKey(t.display),
      target: t.value,
      type: "number",
    };
    const chips = deriveChips(col);
    if (chips) col.quickChips = chips;
    grid.columns = [...(grid.columns ?? []), col];
    existing.add(lower);
    fixes?.push(`materialized prompt-stated metric column '${t.display}' (target ${t.value})`);
  }
}

export function applyGuardrails(schema: Manifest, userPrompt?: string | null, options?: GuardrailOptions): GuardrailReport {
  if (schema.layout_type !== "list" && schema.layout_type !== "grid") {
    return { schema, errors: [], fixes: [], ok: true };
  }

  const errors: string[] = [];
  const fixes: string[] = [];
  const scope = buildScope(schema);
  const enforceEntryMode = options?.enforceEntryMode !== false;

  const intelligence = (schema.intelligence ?? {}) as z.infer<typeof IntelligenceSchema>;
  schema.intelligence = intelligence;

  // ---- 0. Deterministic fallback: prompt-stated metrics --------------------
  bindPromptTargets(schema, userPrompt, fixes);
  materializePromptColumns(schema, userPrompt, fixes);

  // ---- 1. Invariants ------------------------------------------------------
  if (Array.isArray(intelligence.invariants)) {
    const kept: Invariant[] = [];
    for (const inv of intelligence.invariants) {
      if (!inv || typeof inv.leftKey !== "string") {
        errors.push(`invariant without a valid leftKey dropped`);
        continue;
      }
      const exact = scope.exact.get(inv.leftKey.toLowerCase());
      if (exact) {
        inv.leftKey = exact;
      } else {
        const orig = inv.leftKey;
        const remap = fuzzyRemap(orig, scope);
        if (!remap) {
          errors.push(`invariant on unknown field '${orig}' (${inv.op}) dropped — no such row/column/field`);
          continue;
        }
        // Target-rescue: a numeric arith invariant on a phantom key whose name
        // uniquely matches a targetless column IS a misplaced metric target.
        const targetCol = scope.columns.get(remap);
        const rightValue = inv.rightValue;
        const numericRight = typeof rightValue === "number" && Number.isFinite(rightValue);
        if (targetCol && NUMERIC_OPS.has(inv.op) && numericRight && targetCol.target === undefined) {
          targetCol.target = rightValue;
          if (!NUMERIC_TYPES.has(targetCol.type ?? "")) targetCol.type = "number";
          const chips = deriveChips(targetCol);
          if (chips) targetCol.quickChips = chips;
          fixes.push(`rescued misplaced invariant target '${orig}' (${rightValue}) onto column '${targetCol.label ?? orig}'`);
          continue;
        }
        inv.leftKey = remap;
        fixes.push(`remapped invariant key '${orig}' -> '${remap}'`);
      }
      if (typeof inv.rightKey === "string") {
        const rk = resolve(inv.rightKey, scope);
        inv.rightKey = rk ?? undefined;
      }
      kept.push(inv);
    }
    if (kept.length > 0) intelligence.invariants = kept;
    else delete intelligence.invariants;
  }

  // ---- 2. Columns: targets must be numeric + chip suggestions ------------
  if (schema.layout_type === "grid") {
    for (const col of (schema as GridManifest).columns ?? []) {
      if (typeof col.target === "number" && !NUMERIC_TYPES.has(col.type ?? "")) {
        col.type = "number";
        fixes.push(`column '${col.label ?? col.key}': typed '${col.type}' to number for target`);
      }
      if (typeof col.target === "number" && !Array.isArray(col.quickChips)) {
        const chips = deriveChips(col);
        if (chips && chips.length > 0) {
          col.quickChips = chips;
          fixes.push(`column '${col.label ?? col.key}': derived quickChips [${chips.join(",")}]`);
        }
      }
    }
  }

  // ---- 3. Referential integrity on the rest of intelligence ---------------
  if (Array.isArray(intelligence.coverage)) {
  const kept: CoverageItem[] = [];
  for (const c of intelligence.coverage) {
      if (!c || typeof c.key !== "string") continue;
      const k = resolve(c.key, scope);
      if (!k) errors.push(`coverage on unknown field '${c.key}' dropped`);
      else { c.key = k; kept.push(c); }
    }
    if (kept.length > 0) intelligence.coverage = kept;
    else delete intelligence.coverage;
  }
  if (Array.isArray(intelligence.threshold_alert)) {
    const kept: ThresholdItem[] = [];
    for (const t of intelligence.threshold_alert) {
      if (!t || typeof t.target !== "string") continue;
      const k = resolve(t.target, scope);
      if (!k) errors.push(`threshold_alert on unknown field '${t.target}' dropped`);
      else { t.target = k; kept.push(t); }
    }
    if (kept.length > 0) intelligence.threshold_alert = kept;
    else delete intelligence.threshold_alert;
  }
  if (Array.isArray(intelligence.status_matrix)) {
    const kept: StatusMatrixItem[] = [];
    for (const s of intelligence.status_matrix) {
      if (!s || typeof s.columnKey !== "string") continue;
      const k = resolve(s.columnKey, scope);
      if (!k) errors.push(`status_matrix on unknown field '${s.columnKey}' dropped`);
      else { s.columnKey = k; kept.push(s); }
    }
    if (kept.length > 0) intelligence.status_matrix = kept;
    else delete intelligence.status_matrix;
  }
  if (Array.isArray(intelligence.analytics)) {
    intelligence.analytics = intelligence.analytics.filter((a) => {
      if (!a || typeof a.sourceKey !== "string" || a.sourceKey.length === 0) return true;
      const k = resolve(a.sourceKey, scope);
      if (!k) {
        errors.push(`analytics '${a.label ?? a.kind}' sourceKey '${a.sourceKey}' dropped`);
        return false;
      }
      a.sourceKey = k;
      return true;
    });
  }

  // ---- 4. entryMode: personal only when the prompt demands it ------------
  if (enforceEntryMode && schema.layout_type === "grid") {
    const grid = schema as GridManifest;
    if (grid.entryMode !== "personal" && Array.isArray(grid.rows) && grid.rows.length > 0) {
      const rowsArePeople = grid.rows.every((r) => !r.dateRule && typeof r.label === "string" && r.label.trim().length > 0);
      const prompt = (userPrompt ?? "").toLowerCase();
      const asksPersonal = PERSONAL_TOKENS.some((t) => prompt.includes(t));
      if (rowsArePeople && asksPersonal) {
        grid.entryMode = "personal";
        fixes.push("entryMode -> personal (prompt asks per-person reporting)");
      }
    }
  }

  return { schema, errors, fixes, ok: errors.length === 0 };
}

/** Read-only integrity pass returning ONLY the drop-level errors (for LLM repair feedback). */
export function validateIntegrity(schema: Manifest): string[] {
  const clone = structuredClone(schema);
  return applyGuardrails(clone).errors;
}