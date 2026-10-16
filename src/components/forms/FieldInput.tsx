import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HeroStatInput } from "@/components/ds/HeroStatInput";
import { resolveIcon } from "@/components/ds/icons";

// Shared form-layer types. `FormState` is deliberately loose: the same state
// backs list forms (flat {fieldKey: value}) and grid forms ({rowKey: {colKey}}).
export type EntityOption = { key?: string; label?: string };
export type FieldDef = {
  key?: string;
  id?: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  target?: number;
  options?: string[];
  visual?: { variant?: string; accent?: string; icon?: string };
  quickChips?: number[];
};
export type FormState = Record<string, unknown>;
export type SetFormState = React.Dispatch<React.SetStateAction<FormState>>;

// Icons resolve from ICON_SET at render time; createElement keeps the resolved
// component out of a render-local capitalized binding (static-components rule).
function FieldIcon({ name, className }: { name: string; className?: string }) {
  return React.createElement(resolveIcon(name), { className });
}

function entityKey(e: EntityOption): string {
  const raw = String(e?.key || e?.label || "");
  return raw.trim().toLowerCase();
}

// A field is an entity-select only when it is explicitly an entity/name field,
// or when its key/label actually matches one of the workflow's entities.
// Plain text/number columns must NEVER be turned into entity dropdowns just
// because the workflow happens to have an entity list.
function isEntityColumn(field: FieldDef, entities?: EntityOption[]): boolean {
  if (!entities?.length) return false;
  if (field.type === "entity" || field.type === "name") return true;
  if (field.type && field.type !== "text") return false;
  const fk = entityKey(field);
  if (!fk) return false;
  return entities.some((e) => entityKey(e) === fk);
}

export function FieldInput({ field, value, onChange, entities }: { field: FieldDef, value: string, onChange: (val: string) => void, entities?: EntityOption[] }) {
  const variant = field.visual?.variant || "standard";
  const accent = field.visual?.accent || "neutral";
  const quickChips = field.quickChips;

  if (variant === "hero" || variant === "quick_tap") {
    return (
      <HeroStatInput
        label={field.label ?? ""}
        value={value}
        onChange={e => onChange(e.target.value)}
        chips={quickChips}
        onChipTap={(v) => {
          // It's a suggestion only; math doesn't automatically trigger anything.
          onChange(String(v));
        }}
        accent={accent}
        required={field.required}
        icon={field.visual?.icon ? <FieldIcon name={field.visual.icon} className="w-5 h-5" /> : undefined}
      />
    );
  }

  if (field.type === "textarea") {
    return <Textarea 
      value={value} 
      onChange={e => onChange(e.target.value)} 
      placeholder={field.placeholder || "Enter details..."} 
      required={field.required}
      className="bg-slate-50 border-slate-300 min-h-[48px]"
    />;
  }
  
  if (isEntityColumn(field, entities)) {
    return (
      <div className="flex gap-2">
        <select 
          value={value} 
          onChange={e => {
            if (e.target.value === "__add_new__") {
              const name = window.prompt("Enter new name:");
              if (name) {
                // Call fast-add endpoint in background
                fetch('/api/workflow/fast-add', { method: 'POST', body: JSON.stringify({ name }) }).catch(() => {});
                onChange(name);
              }
            } else {
              onChange(e.target.value);
            }
          }}
          required={field.required}
          className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3.5 py-2.5 font-medium min-h-[48px] shadow-sm focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-900/5 transition-colors"
        >
          <option value="" disabled>Select {field.label}...</option>
          {entities?.map((e: EntityOption, i: number) => <option key={i} value={e.label}>{e.label}</option>)}
          {value && !entities?.some((e: EntityOption) => e.label === value) && <option value={value}>{value}</option>}
          <option value="__add_new__">+ Add New...</option>
        </select>
      </div>
    );
  }

  if (field.type === "select" || field.type === "status") {
    const opts = field.options || (field.type === "status" ? ["Done", "Partial", "Pending"] : []);
    return (
      <select 
        value={value} 
        onChange={e => onChange(e.target.value)}
        required={field.required}
        className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3.5 py-2.5 font-medium min-h-[48px] shadow-sm focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-900/5 transition-colors"
      >
        <option value="" disabled>Select...</option>
        {opts.map((o: string, i: number) => <option key={i} value={o}>{o}</option>)}
      </select>
    );
  }

  if (field.type === "boolean") {
    return (
      <label className="inline-flex items-center gap-3 min-h-[48px] cursor-pointer select-none">
        <input 
          type="checkbox" 
          checked={value === "true"} 
          onChange={e => onChange(e.target.checked ? "true" : "false")}
          className="w-6 h-6 rounded-md border-slate-300 accent-indigo-600"
        />
        <span className="text-sm font-semibold text-slate-700">{value === "true" ? "Yes" : "No"}</span>
      </label>
    );
  }

  const isNumeric = field.type === "number" || field.type === "currency";
  return (
    <Input
      type={isNumeric ? "number" : field.type === "date" ? "date" : field.type === "time" ? "time" : "text"}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder || (field.target ? `Target: ${field.target}` : "")}
      required={field.required}
      min={field.min}
      max={field.max}
      step={isNumeric ? "any" : undefined}
      inputMode={isNumeric ? "decimal" : undefined}
      className="w-full bg-slate-50 border-slate-300 font-medium min-h-[48px]"
    />
  );
}
