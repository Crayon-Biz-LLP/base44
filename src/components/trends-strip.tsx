"use client";

// Trends strip — the console's memory, rendered by the HOST (never inside the
// artifact, so console bytes stay byte-identical and the one-script gate
// holds). Owner-only: staff devices never see it. Collapsed by default; the
// fetch happens on first expand so console boot pays nothing.
import { useState } from "react";

type Trend = {
  success: boolean;
  hasData: boolean;
  headlines: { key: string; label: string; thisWeek: number; lastWeek: number; deltaPct: number | null; direction: string }[];
  line: string[];
  days: { day: string; alerts: string[] }[];
  totalEvents: number;
  error?: string;
};

export function TrendsStrip({ workflowId }: { workflowId: string }) {
  const [open, setOpen] = useState(false);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !trend && !error) {
      try {
        const res = await fetch(`/api/workflow/${workflowId}/trends`);
        const data = (await res.json()) as Trend;
        if (data.success) setTrend(data);
        else setError(data.error || "Could not load trends");
      } catch {
        setError("Could not load trends");
      }
    }
  }

  const h = trend?.headlines?.[0];
  const arrow = h?.direction === "up" ? "↑" : h?.direction === "down" ? "↓" : "→";
  const delta =
    h?.deltaPct === null || h?.deltaPct === undefined
      ? h && h.lastWeek === 0 && h.thisWeek > 0
        ? "new"
        : ""
      : `${Math.abs(h.deltaPct)}%`;

  return (
    <div className="shrink-0 border-b border-slate-800 bg-slate-900/60 text-xs">
      <button onClick={toggle} className="w-full flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200">
        <span>{open ? "▾" : "▸"}</span>
        <span className="font-medium">Trends</span>
        {trend?.hasData && h && (
          <span className="ml-2 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
            {h.label}: <b className="text-white">{h.thisWeek.toLocaleString("en-IN")}</b>
            <span className={h.direction === "up" ? "text-emerald-400" : h.direction === "down" ? "text-red-400" : "text-slate-400"}>
              {" "}
              {arrow} {delta}
            </span>
            <span className="text-slate-500"> vs last week {h.lastWeek.toLocaleString("en-IN")}</span>
          </span>
        )}
        {trend && !trend.hasData && <span className="ml-2 text-slate-500">no saved days yet — appears after staff sync</span>}
      </button>
      {open && trend?.hasData && (
        <div className="px-4 pb-3 space-y-1">
          {trend.line.slice(-7).reverse().map((l, i) => (
            <div key={i} className="text-slate-400">{l}</div>
          ))}
        </div>
      )}
      {open && error && <div className="px-4 pb-3 text-red-400">{error}</div>}
    </div>
  );
}
