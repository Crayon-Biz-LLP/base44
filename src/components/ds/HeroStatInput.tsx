import React from "react";
import { cn } from "cn";
import { QuickChipGroup } from "./QuickChipGroup";

interface HeroStatInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  chips?: number[];
  onChipTap?: (val: number) => void;
  accent?: string;
  icon?: React.ReactNode;
}

const accentColors: Record<string, string> = {
  emerald: "text-emerald-600 bg-emerald-50 border-emerald-200 focus-within:border-emerald-400",
  amber: "text-amber-600 bg-amber-50 border-amber-200 focus-within:border-amber-400",
  blue: "text-blue-600 bg-blue-50 border-blue-200 focus-within:border-blue-400",
  violet: "text-violet-600 bg-violet-50 border-violet-200 focus-within:border-violet-400",
  neutral: "text-slate-800 bg-slate-50 border-slate-200 focus-within:border-slate-400",
};

export function HeroStatInput({ label, chips, onChipTap, accent = "neutral", icon, className, ...props }: HeroStatInputProps) {
  const colorClasses = accentColors[accent] || accentColors.neutral;

  return (
    <div className={cn("flex flex-col gap-4 p-6 rounded-2xl border bg-white shadow-sm", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>

      {chips && chips.length > 0 && (
        <QuickChipGroup chips={chips} onTap={onChipTap ?? (() => {})} ariaLabel={`Quick add for ${label}`} />
      )}

      <div className={cn("flex items-center rounded-xl px-4 py-3 border-2 transition-colors", colorClasses)}>
        <input
          {...props}
          inputMode="decimal"
          enterKeyHint="done"
          className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-slate-300"
        />
      </div>
    </div>
  );
}
