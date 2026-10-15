import {
  type Manifest,
  deriveChips,
  isCurrencyField
} from "./manifest";

function inferVisual(field: Record<string, unknown>): { variant: string; accent: string } {
  let accent = "neutral";
  if (isCurrencyField(field)) {
    accent = "emerald";
  } else if (field.primitive === "outflow" || field.primitive === "variance") {
    accent = "amber";
  } else if (field.target !== undefined || field.primitive === "percent_achieved") {
    accent = "blue";
  }

  let variant = "standard";
  if (isCurrencyField(field) && field.target) {
    variant = "quick_tap"; 
  }

  return { variant, accent };
}

export function upgradeV4toV5(schema: unknown): Manifest {
  if (!schema || typeof schema !== "object") return schema as Manifest;
  const upgraded = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;

  if (!upgraded.layout_type) return upgraded as Manifest;

  const currencyFields: Record<string, unknown>[] = [];

  const visitField = (f: unknown, index: number, array: unknown[]) => {
    if (!f) return;
    if (typeof f === "string") {
      // old schema had string columns. Convert to object so we can attach visual.
      f = { label: f };
      array[index] = f;
    }
    if (typeof f !== "object") return;
    const field = f as Record<string, unknown>;
    
    if (!field.visual) {
      field.visual = inferVisual(field);
    }
    if (!field.quickChips && field.target !== undefined) {
      const chips = deriveChips(field);
      if (chips && chips.length > 0) {
        field.quickChips = chips;
      }
    }
    if (isCurrencyField(field)) {
      currencyFields.push(field);
    }
  };

  if (upgraded.layout_type === "list") {
    if (Array.isArray(upgraded.fields)) {
      upgraded.fields.forEach(visitField);
    }
  } else if (upgraded.layout_type === "grid") {
    if (Array.isArray(upgraded.columns)) {
      upgraded.columns.forEach(visitField);
    }
    if (Array.isArray(upgraded.rows)) {
      upgraded.rows.forEach(visitField);
    }
  }

  if (currencyFields.length === 1 && currencyFields[0].visual && typeof currencyFields[0].visual === "object") {
    (currencyFields[0].visual as Record<string, string>).variant = "hero";
  } else if (currencyFields.length > 0) {
    const cashField = currencyFields.find(f => f.primitive === "cash");
    if (cashField && cashField.visual && typeof cashField.visual === "object") {
      (cashField.visual as Record<string, string>).variant = "hero";
    }
  }

  return upgraded as unknown as Manifest;
}

export function lazyUpgradeWorkflowConfig(config: unknown, currentVersion: number): unknown {
  if (!config || typeof config !== "object" || !(config as Record<string, unknown>).schema) return config;
  
  const newConfig = { ...(config as Record<string, unknown>) };
  const version = currentVersion || 1;

  if (version < 5) {
    newConfig.schema = upgradeV4toV5(newConfig.schema);
  }

  return newConfig;
}