"use client";

// Owner overview — the morning view. One row per console: today's headline
// number, the week-over-week arrow, whether staff have synced today, and what
// needs attention (state, not news). Problems float to the top. Everything
// comes from the single aggregate endpoint; nothing here computes.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, MinusCircle } from "lucide-react";

type Row = {
  id: string;
  title: string;
  archetype: string;
  headline: { key: string; label: string } | null;
  today: number | null;
  thisWeek: number | null;
  lastWeek: number | null;
  deltaPct: number | null;
  direction: "up" | "down" | "flat" | null;
  lastSyncAt: string | null;
  syncedToday: boolean;
  minutesAgo: number | null;
  attention: { level: "critical" | "warn"; reasons: string[] } | null;
};

function freshness(r: Row): { dot: string; text: string } {
  if (!r.lastSyncAt) return { dot: "bg-slate-300", text: "never synced" };
  if (r.syncedToday) {
    const m = r.minutesAgo ?? 0;
    return { dot: "bg-emerald-500", text: m <= 1 ? "synced just now" : `synced ${m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`}` };
  }
  return { dot: "bg-amber-500", text: "no sync today" };
}

export function OwnerOverview() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/overview")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRows(d.rows ?? []);
        else setError(d.error || "Could not load overview");
      })
      .catch(() => setError("Could not load overview"));
  }, []);

  if (error) return null; // the dashboard must never break on overview
  if (rows && rows.length === 0) return null; // no consoles yet → stay quiet

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">This morning</CardTitle>
        <CardDescription>Every console, one honest line each. Problems first.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-gray-100 pt-0">
        {(rows ?? []).map((r) => {
          const f = freshness(r);
          const Arrow = r.direction === "up" ? ArrowUpRight : r.direction === "down" ? ArrowDownRight : MinusCircle;
          const arrowCls = r.direction === "up" ? "text-emerald-600" : r.direction === "down" ? "text-red-600" : "text-gray-400";
          const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-IN"));
          return (
            <a key={r.id} href={`/app/${r.id}`} className="flex items-start gap-3 py-3 group">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.dot}`} title={f.text} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-gray-900 truncate group-hover:underline">{r.title}</span>
                  <span className="text-[11px] uppercase tracking-wide text-gray-400">{r.archetype}</span>
                </div>
                {r.attention && (
                  <div className={`mt-0.5 text-xs ${r.attention.level === "critical" ? "text-red-600 font-medium" : "text-amber-600"}`}>
                    {r.attention.reasons.join(" · ")}
                  </div>
                )}
                <div className="mt-0.5 text-xs text-gray-400">{f.text}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold tabular-nums text-gray-900">{fmt(r.today)}</div>
                <div className={`text-xs flex items-center justify-end gap-1 ${arrowCls}`}>
                  <Arrow className="h-3.5 w-3.5" />
                  {r.deltaPct === null ? (r.thisWeek ? "new" : "") : `${Math.abs(r.deltaPct)}%`}
                  <span className="text-gray-400">wk {fmt(r.thisWeek)}</span>
                </div>
              </div>
            </a>
          );
        })}
      </CardContent>
    </Card>
  );
}
