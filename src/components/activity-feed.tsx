"use client";

// Cross-console activity feed — "who logged what" under the morning view.
// One line per staff sync: actor (record-level when the archetype names one),
// the translator's own summary, which console, when. Data arrives in the same
// /api/overview call the rows use — zero extra requests.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type FeedItem = {
  workflowId: string;
  consoleTitle: string;
  actor: string;
  summary: string;
  recordCount: number;
  at: string;
  day: string;
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

export function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    fetch("/api/overview")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setItems(d.feed ?? []);
      })
      .catch(() => {});
  }, []);

  if (!items || items.length === 0) return null;

  // Group by IST day for "Today / Yesterday / date" headers.
  const groups = new Map<string, FeedItem[]>();
  for (const it of items) {
    const list = groups.get(it.day) ?? [];
    list.push(it);
    groups.set(it.day, list);
  }
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Activity</CardTitle>
        <CardDescription>Who logged what, across every console.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {[...groups.entries()].map(([day, list]) => (
          <div key={day}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
              {day === todayKey ? "Today" : day}
            </div>
            <div className="divide-y divide-gray-100">
              {list.map((it, i) => (
                <a key={`${it.workflowId}-${it.at}-${i}`} href={`/app/${it.workflowId}`} className="flex items-baseline gap-2 py-2 group">
                  <span className="font-medium text-gray-900">{it.actor}</span>
                  <span className="text-gray-500 truncate flex-1 min-w-0">
                    {it.summary} <span className="text-gray-400">· {it.consoleTitle}</span>
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{timeOf(it.at)}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
