import React from "react";
import { cn } from "cn";
import { CheckCircle2, AlertTriangle } from "lucide-react";

type BannerStatus = "success" | "warning" | "pending";

const styles: Record<BannerStatus, string> = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  warning: "bg-amber-50 border-amber-200 text-amber-900",
  pending: "bg-slate-50 border-slate-200 text-slate-600",
};

export function InvariantBanner({
  status,
  label,
  detail,
  className,
}: {
  status: BannerStatus;
  label: string;
  detail?: string;
  className?: string;
}) {
  const Icon = status === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-4 py-2.5 rounded-full border shadow-sm",
        styles[status],
        className
      )}
    >
      <Icon className={cn("w-5 h-5 shrink-0", status === "warning" && "animate-pulse")} />
      <span className="text-sm font-semibold">{label}</span>
      {detail && <span className="text-xs opacity-80">{detail}</span>}
    </div>
  );
}
