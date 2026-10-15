// Domain-knowledge seed library — curated by us, never model-authored.
// This is the "brain" V3 injects: the extraction LLM may SELECT and
// PARAMETERIZE from this catalog, but every formula and constant here is
// vetted. New industries = new rows here, not new code.

/** Material densities in g/cm³ (standard values). Matched by value prefix. */
export const MATERIAL_DENSITIES: { match: string; d: number; note: string }[] = [
  { match: "SS", d: 7.9, note: "Stainless steel" },
  { match: "MS", d: 7.85, note: "Mild steel" },
  { match: "IS 2062", d: 7.85, note: "Structural steel grade" },
  { match: "AL", d: 2.7, note: "Aluminium" },
  { match: "BRASS", d: 8.5, note: "Brass" },
  { match: "COPPER", d: 8.96, note: "Copper" },
];

export const STEEL_DEFAULT_DENSITY = 7.85;

/** Standard sheet footprint: 8ft × 4ft ≈ 2.973 m². weightKg = thickness_mm × area × density. */
export const SHEET_AREA_M2 = 2.973;

/** Safe-load defaults for the weight audit (per standard 8×4 plate). 10mm steel ≈ 233kg. */
export const AUDIT_DEFAULTS = { heavySlotKg: 150, elevatedRow: 4 };

/** Intelligence feature catalog: the extraction LLM chooses from these ids. */
export const FEATURE_CATALOG = [
  {
    id: "tonnage",
    label: "Live weight/tonnage KPI",
    when: "a numeric field captures thickness/gauge and goods are dense materials",
  },
  {
    id: "weightAudit",
    label: "Elevated heavy-load audit banner",
    when: "vertical storage where heavy items on upper rows are a safety risk",
  },
  {
    id: "balanceBadge",
    label: "Per-group structural balance badge",
    when: "goods live in stacked rows/shelves and heavy-low/light-top matters",
  },
] as const;

export type FeatureId = (typeof FEATURE_CATALOG)[number]["id"];

/** Resolve density for a material value by prefix; steel default if unknown. */
export function densityFor(value: string): number {
  const v = (value || "").toUpperCase();
  for (const m of MATERIAL_DENSITIES) {
    if (v.indexOf(m.match.toUpperCase()) === 0) return m.d;
  }
  return STEEL_DEFAULT_DENSITY;
}
