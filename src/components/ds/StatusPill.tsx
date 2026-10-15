import React from "react";
import { cn } from "cn";

interface StatusPillProps {
  label: string;
  status?: "pending" | "success" | "warning" | "error" | "neutral";
  className?: string;
}

const statusColors = {
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  success: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  error: "bg-red-100 text-red-800 border-red-200",
  neutral: "bg-gray-100 text-gray-800 border-gray-200",
};

export function StatusPill({ label, status = "neutral", className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-3 min-h-[32px] rounded-full text-sm font-medium border",
        statusColors[status],
        className
      )}
    >
      {label}
    </span>
  );
}