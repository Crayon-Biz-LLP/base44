import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionTenantId } from "@/lib/infra/auth";
import { computeTenantDigest, istDayWindow } from "@/lib/domain/digest";
import { db } from "@/db";
import { events, workflows } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { EventActions } from "@/components/event-actions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const formatTime = (d: Date) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function verdictSummary(v: unknown): string {
  if (!v || typeof v !== "object") return "—";
  const obj = v as Record<string, unknown>;
  const parts: string[] = [];
  const money = obj.money as { total?: number } | undefined;
  if (money?.total != null) parts.push(`₹${Number(money.total).toLocaleString("en-IN")}`);
  const cov = obj.coverage as { percent?: number; slotsFilled?: number; slotsTotal?: number } | undefined;
  if (cov) {
    if (cov.slotsFilled != null && cov.slotsTotal != null) parts.push(`${cov.slotsFilled}/${cov.slotsTotal} slots`);
    if (cov.percent != null) parts.push(`${cov.percent}%`);
  }
  if (typeof obj.lineCount === "number") parts.push(`${obj.lineCount} lines`);
  if (typeof obj.summary === "string") parts.push(obj.summary);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getSessionTenantId();
  if (!tenantId) redirect("/login?next=/report/" + id);

  const [wfRow, todayWindow] = await Promise.all([
    db.select({ id: workflows.id, config: workflows.config }).from(workflows).where(and(eq(workflows.id, id), eq(workflows.tenantId, tenantId))).limit(1),
    (async () => {
      const w = istDayWindow();
      const digest = await computeTenantDigest(tenantId, w);
      return { window: w, digest };
    })(),
  ]);

  if (wfRow.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        App not found.
      </div>
    );
  }

  const title = (wfRow[0].config as { title?: string } | undefined)?.title || "Untitled app";
  const appSummary = todayWindow.digest.appSummaries.find((a) => a.workflowId === id);

  const rowEvents = (await db
    .select({
      id: events.id,
      filledBy: events.filledBy,
      verdict: events.verdict,
      status: events.status,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(and(eq(events.workflowId, id), eq(events.tenantId, tenantId)))
    .orderBy(desc(events.createdAt))
    .limit(50)) as unknown as { id: string; filledBy: string | null; verdict: unknown; status: string; createdAt: Date }[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-700 mb-4">
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">App report • today&apos;s captures highlighted</p>
        </header>

        {appSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-slate-100">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{appSummary.captureCount}</p>
                <p className="text-xs text-slate-500 mt-1">Captures today</p>
              </CardContent>
            </Card>
            {appSummary.moneyTotal !== null && (
              <Card className="border-emerald-100 bg-emerald-50/50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">₹{appSummary.moneyTotal.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-emerald-600 mt-1">Total value</p>
                </CardContent>
              </Card>
            )}
            {appSummary.coveragePercent !== null && (
              <Card className="border-blue-100 bg-blue-50/50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{appSummary.coveragePercent}%</p>
                  <p className="text-xs text-blue-600 mt-1">Coverage</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Card className="shadow-sm">
          <CardHeader className="pb-2 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Recent Captures</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 border-b text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-3">When</th>
                    <th className="p-3">Who</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rowEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 text-slate-600 whitespace-nowrap">{formatTime(ev.createdAt)}</td>
                      <td className="p-3 font-medium text-slate-800">{ev.filledBy || "—"}</td>
                      <td className="p-3">
                        <EventActions eventId={ev.id} initialStatus={ev.status} />
                      </td>
                      <td className="p-3 text-slate-600 max-w-[280px] truncate">{verdictSummary(ev.verdict)}</td>
                    </tr>
                  ))}
                  {rowEvents.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400">No captures recorded for this app yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="pt-2 text-center">
          <Link href="/verdict" className="text-sm text-indigo-600 hover:underline">← Back to Tonight&apos;s Verdict</Link>
        </div>
      </div>
    </div>
  );
}