import React from "react";
import { cn } from "cn";

// Single source of truth for quick-tap chip styling (previously duplicated in
// HeroStatInput and GridForm with slightly different looks).
const chipPill =
  "min-h-[48px] px-4 rounded-full border border-slate-200 bg-white text-slate-700 font-semibold text-base active:bg-slate-100 shadow-sm transition-colors";

export function QuickChipGroup({
  chips,
  onTap,
  prefix = "+",
  className,
  ariaLabel,
}: {
  chips: number[];
  onTap: (val: number) => void;
  /** Text before each chip value, e.g. "+" or "₹" */
  prefix?: string;
  className?: string;
  ariaLabel?: string;
}) {
  if (!chips?.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label={ariaLabel}>
      {chips.map((chip, idx) => (
        <button
          key={idx}
          type="button"
          className={chipPill}
          onClick={() => onTap(chip)}
        >
          {prefix}
          {chip}
        </button>
      ))}
    </div>
  );
}
