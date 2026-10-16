import { z } from "zod";
import { DateRuleSchema } from "./cube/dates";

export const PrimitiveEnum = z.enum([
  "gross_sales",
  "cash",
  "digital",
  "outflow",
  "qty",
  "count",
  "percent_achieved",
  "custom_metric"
]);

export const FieldTypeEnum = z.enum([
  "text",
  "textarea",
  "number",
  "currency",
  "boolean",
  "select",
  "date",
  "time",
  "photo",
  "status"
]);

export const KeySchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "Key must be camelCase alphanumeric starting with lowercase");

export const CommonSchema = z.object({
  key: KeySchema.optional().describe("CamelCase identifier"),
  id: z.string().optional(),
  label: z.string().describe("Human readable label"),
  primitive: PrimitiveEnum.optional(),
  required: z.boolean().default(true),
});

// ---------------------------------------------------------------
// V5 Visual Vocabulary — presentation intent, orthogonal to compute.
// KEY CONTRACT: visual/quickChips NEVER alter field keys, targets, or
// verdict arithmetic. events.verdict paths are untouched; asserted by test.
// ---------------------------------------------------------------

export const ICON_SET = [
  "wallet",
  "banknote",
  "receipt",
  "users",
  "clock",
  "alertTriangle",
  "check",
  "shoppingBag",
  "cupSoda",
  "dumbbell",
  "calendar",
] as const;

export const AccentEnum = z.enum(["emerald", "amber", "blue", "violet", "neutral"]);
export const VariantEnum = z.enum(["hero", "quick_tap", "standard", "compact"]);

export const VisualSchema = z.object({
  variant: VariantEnum.default("standard").describe("hero = primary metric display; quick_tap = fast chip entry; compact = dense cell"),
  accent: AccentEnum.default("neutral").describe("emerald = cash/revenue, amber = variance/returns, blue = targets"),
  icon: z.enum(ICON_SET).optional().describe("Must be one of the bundled icons; unknown icons degrade to neutral"),
});

export type VisualOptions = z.infer<typeof VisualSchema>;
export type Accent = z.infer<typeof AccentEnum>;
export type Variant = z.infer<typeof VariantEnum>;

export const MANIFEST_SCHEMA_VERSION = 5;

const CURRENCY_PRIMITIVES = new Set(["cash", "digital", "gross_sales", "outflow"]);

export interface ChipField {
  type?: string | null;
  primitive?: string | null;
  target?: number | null;
  min?: number | null;
  max?: number | null;
}

export function isCurrencyField(field: ChipField): boolean {
  return field.type === "currency" || (typeof field.primitive === "string" && CURRENCY_PRIMITIVES.has(field.primitive));
}

export function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || step <= 0) return Math.round(value || 0);
  return Math.round(value / step) * step;
}

// Largest clean {1,2,5}·10^k unit ≤ magnitude (min 1). E.g. 500 → 500, 2000 → 2000, 25000 → 20000.
function largestNiceUnit(magnitude: number): number {
  if (!Number.isFinite(magnitude) || magnitude <= 0) return 1;
  const k = Math.floor(Math.log10(magnitude));
  const base = Math.pow(10, k);
  for (const m of [5, 2, 1]) {
    if (m * base <= magnitude) return m * base;
  }
  return base;
}

// Deterministic quick-tap suggestions from a numeric target (migration + render path).
// Guards: zero / negative / fractional / non-finite targets yield NO chips.
export function deriveChips(field: ChipField): number[] | undefined {
  const target = field.target;
  if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) return undefined;

  let chips: number[];
  if (isCurrencyField(field)) {
    // Currency: 10%/20%/40%/100% snapped to the largest clean 1-2-5 unit ≤ target/10.
    // e.g. ₹5,000 → [500, 1000, 2000, 5000]; ₹20,000 → [2000, 4000, 8000, 20000].
    // Sub-₹1 targets have no meaningful denominations — no chips.
    if (target < 1) return undefined;
    const scale = Math.max(1, largestNiceUnit(target / 10));
    chips = [scale, scale * 2, scale * 4, target];
  } else {
    // Integer counts (qty/count/units): 25/50/100%, integer-bounded.
    if (target <= 1) return undefined;
    chips = [Math.ceil(target * 0.25), Math.ceil(target * 0.5), target];
  }

  return sanitizeChips(chips, field);
}

// Runtime sanitizer for ANY chips source (LLM-provided included).
// Dedupe → integer-bound (count regimes) → clamp to [min,max] → sort ascending.
export function sanitizeChips(candidate: unknown, field: ChipField): number[] | undefined {
  if (!Array.isArray(candidate)) return undefined;
  const bounded = typeof field.min === "number" && typeof field.max === "number" && field.min > field.max;
  const min = bounded ? -Infinity : (typeof field.min === "number" ? field.min : -Infinity);
  const max = bounded ? Infinity : (typeof field.max === "number" ? field.max : Infinity);
  const integerMode = !isCurrencyField(field);

  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of candidate) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    let n = integerMode ? Math.round(v) : roundToStep(v, 1);
    if (n <= 0) continue;
    if (n < min) n = min;
    if (n > max) n = max;
    if (n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  out.sort((a, b) => a - b);
  if (out.length === 0) return undefined;
  return out.slice(0, 8);
}

export const ListFieldSchema = z.object({
  key: KeySchema.optional().describe("CamelCase identifier"),
  id: z.string().optional(),
  label: z.string().describe("Human readable label"),
  primitive: PrimitiveEnum.optional(),
  required: z.boolean().default(true),
  type: FieldTypeEnum,
  placeholder: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.string()).optional(),
  capture: z.object({ mode: z.enum(["camera", "gallery"]).default("camera") }).optional(),
  visual: VisualSchema.optional(),
  quickChips: z.array(z.number()).optional().describe("Quick-tap value suggestions (rounded, clamped; presentation only)"),
});

export const GridRowSchema = z.object({
  key: KeySchema.optional().describe("CamelCase identifier"),
  id: z.string().optional(),
  label: z.string().optional().describe("Human readable label"),
  primitive: PrimitiveEnum.optional(),
  required: z.boolean().default(true),
  type: z.enum(["number", "currency", "status", "text", "boolean", "date"]).default("number"),
  target: z.number().optional().describe("If a numeric target exists for this metric"),
  dateRule: DateRuleSchema.optional().describe("If this row represents a sequence of dates, provide the rule to generate them (e.g. Sundays in October 2026)"),
  visual: VisualSchema.optional(),
  quickChips: z.array(z.number()).optional(),
});

export const GridColumnSchema = z.object({
  key: KeySchema.optional(),
  label: z.string().optional().describe("Human readable label"),
  type: z.enum(["number", "currency", "status", "text", "boolean", "date"]).optional().describe("Override type for cells in this column"),
  target: z.number().optional().describe("Numeric target for this specific column/metric"),
  targets: z.record(z.string(), z.number()).optional().describe("Per-cell targets keyed by row label or row key"),
  visual: VisualSchema.optional(),
  quickChips: z.array(z.number()).optional(),
});

// -- REMOVED CUBE SCHEMA --

export const FormulaSchema = z.object({
  targetKey: KeySchema,
  expression: z.string(), // e.g., "sales - expenses"
});

export const InvariantSchema = z.object({
  leftKey: KeySchema,
  op: z.enum(["gt", "gte", "lt", "lte", "eq", "neq", "not_null", "not_empty", "value_eq"]),
  rightKey: KeySchema.optional(),
  rightValue: z.union([z.number(), z.string()]).optional(),
  errorMessage: z.string(),
  severity: z.enum(["warning", "block"]).default("block")
});

export const LogicSchema = z.object({
  formulas: z.array(FormulaSchema).optional(),
  invariants: z.array(InvariantSchema).optional(),
});

export const EntitySchema = z.object({
  key: KeySchema,
  label: z.string()
});

export const IntelligenceSchema = z.object({
  entities: z.array(EntitySchema).optional().describe("Roster of people or products"),
  repeatable: z.object({ enabled: z.boolean(), min: z.number().optional(), max: z.number().optional() }).optional(),
  coverage: z.array(z.object({ scope: z.enum(["column", "row", "list"]), key: z.string(), count: z.number(), label: z.string(), severity: z.enum(["warning", "block"]).default("warning") })).optional(),
  uniqueness: z.object({ scope: z.enum(["row", "grid"]), label: z.string(), severity: z.enum(["warning", "block"]).default("warning") }).optional(),
  invariants: z.array(InvariantSchema).optional(),
  formulas: z.array(z.object({ targetKey: KeySchema, expression: z.string(), scope: z.enum(["column", "row"]).default("column") })).optional(),
  status_matrix: z.array(z.object({ columnKey: z.string(), barring: z.array(z.string()), escalateAt: z.number(), label: z.string() })).optional(),
  threshold_alert: z.array(z.object({ target: z.string(), op: z.enum(["gt", "gte", "lt", "lte", "eq"]), value: z.number(), label: z.string() })).optional(),
  sequence: z.array(z.object({ key: z.string(), prefix: z.string().optional(), start: z.number().default(1) })).optional(),
  deadline: z.object({ closeBy: z.string(), warnBeforeMinutes: z.number().optional() }).optional(),
  analytics: z.array(z.object({ kind: z.enum(["est_value", "coverage_rate", "completion_rate", "top_scorer", "trend"]), sourceKey: z.string().optional(), label: z.string() })).optional()
});

export const ScheduleSchema = z.object({
  frequency: z.enum(["daily", "weekday", "weekly", "custom"]).default("daily"),
  closeBy: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "HH:MM").default("21:30")
});

export const ThemeSchema = z.object({
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).default("#0f172a"),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).default("#3b82f6"),
  fontFamily: z.enum(["sans", "serif", "mono"]).default("sans"),
  radius: z.enum(["none", "sm", "md", "lg", "full"]).default("md"),
}).optional();

export const AutomationTriggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("on_submit"),
    condition: z.object({
      field: z.string(), // key from fields[]
      op: z.enum(["eq", "neq", "gt", "lt", "contains", "invariants_failed"]),
      value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    }).optional(),
  }),
  z.object({
    type: z.literal("schedule"),
    cron: z.string(), // e.g., "30 21 * * *" (9:30 PM)
    timezone: z.string().default("Asia/Kolkata"),
  }),
]);

export const AutomationActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("notify_whatsapp"),
    target: z.enum(["owner", "branch_manager", "custom_phone"]),
    template: z.enum(["scorecard_daily", "invariant_alert", "submission_ack"]),
  }),
  z.object({
    type: z.literal("notify_email"),
    target: z.string().email().optional(),
    template: z.literal("scorecard_html"),
  }),
  z.object({
    type: z.literal("webhook"),
    url: z.string().url(),
    secret: z.string().optional(),
  }),
]);

export const AutomationRuleSchema = z.object({
  id: z.string().optional(), // optional so we can generate it if missing
  trigger: AutomationTriggerSchema,
  actions: z.array(AutomationActionSchema),
});

export const ListManifestSchema = z.object({
  layout_type: z.literal("list").describe("MUST be exactly the string 'list'"),
  description: z.string().optional().describe("Short instruction for the user"),
  subtitle: z.string().optional().describe("A tagline or subtitle for the app"),
  fields: z.array(ListFieldSchema).describe("The fields in the list"),
  logic: LogicSchema.optional(),
  intelligence: IntelligenceSchema.optional(),
  schedule: ScheduleSchema.optional(),
  theme: ThemeSchema.optional(),
  automation: z.array(AutomationRuleSchema).optional()
});

export const GridManifestSchema = z.object({
  layout_type: z.literal("grid").describe("MUST be exactly the string 'grid'"),
  description: z.string().optional().describe("Short instruction for the user"),
  subtitle: z.string().optional().describe("A tagline or subtitle for the app"),
  columns: z.array(GridColumnSchema).optional().describe("The columns for the grid (e.g. shifts or metrics)"),
  rows: z.array(GridRowSchema).describe("The rows for the grid (e.g. staff names or products)"),
  logic: LogicSchema.optional(),
  intelligence: IntelligenceSchema.optional(),
  schedule: ScheduleSchema.optional(),
  theme: ThemeSchema.optional(),
  automation: z.array(AutomationRuleSchema).optional(),
  entryMode: z.enum(["shared", "personal"]).default("shared").describe("'personal' when each named row is a person who submits their own data (form shows a name dropdown); 'shared' when one submitter fills every row")
});

export const ManifestSchema = z.discriminatedUnion("layout_type", [
  ListManifestSchema,
  GridManifestSchema
]);

export const UnifiedWorkflowConfigSchema = z.object({
  layout_type: z.enum(["list", "grid"]),
  description: z.string().optional(),
  subtitle: z.string().optional(),
  fields: z.array(ListFieldSchema).describe("Required if layout_type is 'list'").optional(),
  columns: z.array(GridColumnSchema).describe("Required if layout_type is 'grid'. The columns for the grid (e.g. shifts or metrics)").optional(),
  rows: z.array(GridRowSchema).describe("Required if layout_type is 'grid'. The rows for the grid (e.g. staff names or products). You MUST populate the 'target' field if a numeric target is requested.").optional(),
  
  entryMode: z.enum(["shared", "personal"]).optional(),
  
  logic: LogicSchema.optional(),
  intelligence: IntelligenceSchema.optional(),
  schedule: ScheduleSchema.optional(),
});

export const WorkflowConfigSchema = ManifestSchema;

export type Manifest = z.infer<typeof ManifestSchema>;
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
export type ListManifest = z.infer<typeof ListManifestSchema>;
export type GridManifest = z.infer<typeof GridManifestSchema>;

export function deriveKey(label: string): string {
  if (typeof label !== 'string') return 'unknownKey';
  const normalized = label.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+(.)/g, (_, c) => c.toUpperCase());
  let key = normalized.charAt(0).toLowerCase() + normalized.slice(1);
  if (/^[0-9]/.test(key)) {
    key = "k" + key;
  }
  return key;
}

const KEY_RE = /^[a-z][a-zA-Z0-9]*$/;

export function canonicalKey(node: { key?: string; id?: string; label?: string }): string {
  for (const cand of [node?.key, node?.id]) {
    if (typeof cand === "string" && KEY_RE.test(cand)) return cand;
  }
  return deriveKey(node?.label ?? "");
}

type KeyedNode = { key?: string; id?: string; label?: string } & Record<string, unknown>;

export function ensureCanonicalKeys(manifest: WorkflowConfig | Manifest): Manifest {
  const result = { ...manifest } as Record<string, unknown>;
  const keyMap: Record<string, string> = {};

  if (result.layout_type === "list") {
    const fields = result.fields as KeyedNode[] | undefined;
    if (fields) {
      result.fields = fields.map((f) => {
        const k = canonicalKey(f);
        if (f.label) keyMap[f.label.toLowerCase()] = k;
        if (f.key) keyMap[f.key.toLowerCase()] = k;
        return { ...f, key: k };
      });
    }
  } else if (result.layout_type === "grid") {
    const rows = result.rows as KeyedNode[] | undefined;
    if (rows) {
      result.rows = rows.map((r) => {
        const k = canonicalKey(r);
        if (r.label) keyMap[r.label.toLowerCase()] = k;
        if (r.key) keyMap[r.key.toLowerCase()] = k;
        return { ...r, key: k };
      });
    }
    const columns = result.columns as (KeyedNode | string)[] | undefined;
    if (columns) {
      result.columns = columns.map((c) => {
        if (typeof c === "string") {
          const k = deriveKey(c);
          keyMap[c.toLowerCase()] = k;
          return { key: k, label: c };
        }
        const k = (typeof c.key === "string" && KEY_RE.test(c.key)) ? c.key : deriveKey(c.label ?? "");
        if (c.label) keyMap[c.label.toLowerCase()] = k;
        if (c.key) keyMap[c.key.toLowerCase()] = k;
        const mappedCol: KeyedNode = { ...c, key: k };
        if (mappedCol.targets && typeof mappedCol.targets === "object") {
          const newTargets: Record<string, number> = {};
          for (const [tKey, tVal] of Object.entries(mappedCol.targets as Record<string, number>)) {
             const resolvedKey = keyMap[tKey.toLowerCase()] || deriveKey(tKey);
             newTargets[resolvedKey] = tVal;
          }
          mappedCol.targets = newTargets;
        }
        return mappedCol;
      });
    }
  }

  // Remap intelligence keys
  if (result.intelligence) {
    const int = result.intelligence as Record<string, unknown>;
    const resolveKey = (k: string) => keyMap[k.toLowerCase()] || deriveKey(k);

    if (int.coverage) {
      int.coverage = (int.coverage as Record<string, unknown>[]).map((c) => ({ ...c, key: resolveKey(c.key as string) }));
    }
    if (int.invariants) {
      int.invariants = (int.invariants as Record<string, unknown>[]).map((i) => ({
        ...i,
        leftKey: resolveKey(i.leftKey as string),
        rightKey: i.rightKey ? resolveKey(i.rightKey as string) : undefined
      }));
    }
    if (int.formulas) {
      int.formulas = (int.formulas as Record<string, unknown>[]).map((f) => ({
        ...f,
        targetKey: resolveKey(f.targetKey as string)
        // expression rewriting is harder, assume LLM got it or user used keys
      }));
    }
    if (int.status_matrix) {
      int.status_matrix = (int.status_matrix as Record<string, unknown>[]).map((s) => ({ ...s, columnKey: resolveKey(s.columnKey as string) }));
    }
    if (int.threshold_alert) {
      int.threshold_alert = (int.threshold_alert as Record<string, unknown>[]).map((t) => ({ ...t, target: resolveKey(t.target as string) }));
    }
    if (int.sequence) {
      int.sequence = (int.sequence as Record<string, unknown>[]).map((s) => ({ ...s, key: resolveKey(s.key as string) }));
    }
    if (int.analytics) {
      int.analytics = (int.analytics as Record<string, unknown>[]).map((a) => ({ ...a, sourceKey: a.sourceKey ? resolveKey(a.sourceKey as string) : undefined }));
    }
  }

  return result as unknown as Manifest;
}

interface LegacyCubeValue { key?: string; label?: string }
interface LegacyCubeDim { key?: string; values?: LegacyCubeValue[] }
interface LegacyCubeRecord {
  cell: Record<string, unknown>;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  target?: number;
}
interface LegacyCubeConfig {
  layout_type?: string;
  view?: string;
  description?: string;
  subtitle?: string;
  entryMode?: string;
  dimensions?: LegacyCubeDim[];
  records?: LegacyCubeRecord[];
}

export function migrateCubeToNative(config: LegacyCubeConfig): Manifest {
  if (config.layout_type === "list" || config.layout_type === "grid") {
    return ensureCanonicalKeys(config as unknown as Manifest);
  }
  
  if (config.layout_type === "cube") {
    if (config.view === "list") {
      // Cube view:list -> ListManifest
      const list: { layout_type: "list"; description?: string; subtitle?: string; fields: Record<string, unknown>[] } = {
        layout_type: "list",
        description: config.description,
        subtitle: config.subtitle,
        fields: []
      };
      
      const records = config.records || [];
      for (const r of records) {
        // Find label by matching cell dimension values
        const cellVals = Object.values(r.cell);
        const label = cellVals.join(" - ") || "Field";
        list.fields.push({
          key: deriveKey(label),
          label: label,
          type: r.type || "text",
          required: r.required !== false,
          placeholder: r.placeholder,
          options: r.options,
          target: r.target
        });
      }
      return list as unknown as ListManifest;
    } else {
      // Cube view:table/cards/calendar -> GridManifest
      const grid: { layout_type: "grid"; description?: string; subtitle?: string; entryMode: "shared" | "personal"; rows: Record<string, unknown>[]; columns: { key: string; label: string; targets: Record<string, number> }[] } = {
        layout_type: "grid",
        description: config.description,
        subtitle: config.subtitle,
        entryMode: config.entryMode === "personal" ? "personal" : "shared",
        rows: [],
        columns: []
      };
      
      const dims = config.dimensions || [];
      const records = config.records || [];
      
      if (dims.length > 0) {
        const rowDim = dims[0];
        const rowVals = rowDim.values || [];
        grid.rows = rowVals.map((v) => ({
          key: deriveKey(v.label as string),
          label: v.label,
          type: "number"
        }));
        
        // Find all unique remaining dimension combinations
        const remainingDims = dims.slice(1);
        if (remainingDims.length > 0) {
          const colSet = new Set<string>();
          for (const r of records) {
            const colLabelParts = remainingDims.map((d) => {
              const valKey = r.cell[d.key as string];
              const valLabel = d.values?.find((v) => v.key === valKey)?.label || (valKey as string);
              return valLabel;
            });
            const colLabel = colLabelParts.join(" ");
            if (colLabel && !colSet.has(colLabel)) {
              colSet.add(colLabel);
              grid.columns.push({
                key: deriveKey(colLabel),
                label: colLabel,
                targets: {}
              });
            }
            
            // Apply targets if any
            if (r.target !== undefined) {
              const rowKey = deriveKey(rowDim.values?.find((v) => v.key === r.cell[rowDim.key as string])?.label || "");
              const colKey = deriveKey(colLabel);
              const col = grid.columns.find((c) => c.key === colKey);
              if (col && rowKey) {
                col.targets[rowKey] = r.target;
              }
            }
          }
        }
      }
      return grid as unknown as GridManifest;
    }
  }
  
  // Fallback
  return {
    layout_type: "list",
    fields: []
  } as unknown as ListManifest;
}

