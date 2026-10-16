// Shared console configs for V2/V3 tests: two different industries, themes,
// geometries, field types — if the template holds across both, content
// variance is decoupled from behavior. RACKS exercises the V3 intelligence
// features (tonnage/audit/balance); KITCHEN exercises the featureless path.
import type { ConsoleConfig } from "../../src/lib/consoles/studio-v2";

export const RACKS: ConsoleConfig = {
  productName: "LaserRack Pro",
  logoText: "LR",
  tagline: "Sheet metal rack inventory",
  accentHex: "#38bdf8",
  dark: true,
  countLabel: "Row",
  groupLabel: "Rack",
  unitsPerGroup: 8,
  groupCount: 30,
  field1: { key: "material", label: "Material", type: "text" },
  field2: { key: "grade", label: "Grade", type: "text" },
  field3: { key: "thickness_mm", label: "Thickness (mm)", type: "number" },
  qtyField: { key: "sheets", label: "Sheets" },
  categories: [
    { id: "ss", label: "SS304", colorHex: "#38bdf8", match: "SS" },
    { id: "ms", label: "MS IS2062", colorHex: "#f97316", match: "MS" },
    { id: "al", label: "Aluminium", colorHex: "#34d399", match: "AL" },
    { id: "other", label: "Other", colorHex: "#a78bfa", match: "X" },
  ],
  searchHint: "SS304, 3mm, Rack 12",
  advisory: "Store heavy gauge plates on the bottom rows for forklift safety.",
  features: { tonnage: true, weightAudit: true, balanceBadge: true },
  densityMap: [
    { match: "SS", d: 7.9 },
    { match: "MS", d: 7.85 },
    { match: "AL", d: 2.7 },
  ],
  sheetAreaM2: 2.973,
  audit: { heavySlotKg: 150, elevatedRow: 4, heavyRowKg: 3500 },
};

export const KITCHEN: ConsoleConfig = {
  productName: "PrepLine",
  logoText: "KP",
  tagline: "Central kitchen prep stations",
  accentHex: "#34d399",
  dark: false,
  countLabel: "Bin",
  groupLabel: "Station",
  unitsPerGroup: 4,
  groupCount: 12,
  field1: { key: "item", label: "Item", type: "text" },
  field2: { key: "supplier", label: "Supplier", type: "text" },
  field3: { key: "notes", label: "Notes", type: "text" },
  qtyField: null,
  categories: [
    { id: "produce", label: "Produce", colorHex: "#34d399", match: "PRO" },
    { id: "dairy", label: "Dairy", colorHex: "#fbbf24", match: "DAI" },
    { id: "meat", label: "Meat", colorHex: "#f87171", match: "MEA" },
  ],
  searchHint: "Item, station, supplier",
  advisory: "FIFO: label every bin with prep date and rotate oldest stock forward.",
  features: { tonnage: false, weightAudit: false, balanceBadge: false },
  densityMap: [],
  sheetAreaM2: 0.25,
  audit: { heavySlotKg: 150, elevatedRow: 4 },
};
