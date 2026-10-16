import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionTenantId } from "@/lib/auth/auth";
import { computeTenantDigest, istDayWindow } from "@/lib/domain/digest";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoonStar, TrendingUp, AlertTriangle, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function VerdictPage() {
  const tenantId = await getSessionTenantId();
  if (!tenantId) redirect("/login?next=/verdict");

  const window = istDayWindow();
  const digest = await computeTenantDigest(tenantId, window);

  // Wall-clock in IST via an explicit timezone formatter — never by offset-math on Date.
  const timeLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-6 md:p-10">
      <header className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center gap-3 mb-2">
          <MoonStar className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">Tonight&apos;s Verdict</h1>
        </div>
        <p className="text-sm text-slate-500">
          {digest.istDay} • as of {timeLabel} IST
        </p>
      </header>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Total value */}
        <Card className="border-indigo-100">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Estimated Total Value Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-indigo-700">
              ₹{digest.salesTotal.toLocaleString("en-IN")}
            </span>
          </CardContent>
        </Card>

        {/* Per-app summaries */}
        {digest.appSummaries.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Captures by App</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {digest.appSummaries.map((app) => (
                <Link key={app.workflowId} href={`/report/${app.workflowId}`} className="group">
                  <Card className="hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">
                          {app.title}
                        </CardTitle>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors mt-1" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                        <span>{app.captureCount} capture{app.captureCount !== 1 && "s"}</span>
                        {app.moneyTotal !== null && (
                          <span className="font-semibold text-emerald-700">₹{app.moneyTotal.toLocaleString("en-IN")}</span>
                        )}
                      </div>
                      {app.coveragePercent !== null && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${app.coveragePercent >= 95 ? "bg-emerald-500" : "bg-amber-500"}`}
                              style={{ width: `${Math.min(app.coveragePercent, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-500 tabular-nums">{app.coveragePercent}%</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Leaderboard */}
        {digest.leaderboard.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Capture Coverage Leaderboard
            </h2>
            <Card>
              <CardContent className="divide-y divide-slate-100">
                {digest.leaderboard.map((staff, i) => (
                  <div key={staff.name} className="flex items-center gap-4 py-3">
                    <span className="text-sm font-bold text-slate-400 w-6 text-center">{i + 1}</span>
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-slate-800">{staff.name}</span>
                      {staff.prevPct !== null && (
                        <span className="text-xs text-slate-400 ml-2">
                          {staff.todayPct >= staff.prevPct ? "▲" : "▼"} {Math.abs(staff.todayPct - staff.prevPct).toFixed(1)}% vs yesterday
                        </span>
                      )}
                    </div>
                    <Badge variant={staff.todayPct >= 95 ? "default" : "destructive"} className="tabular-nums font-bold">
                      {staff.todayPct.toFixed(1)}%
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Missed targets */}
        {digest.missedTargets.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Missed Targets
            </h2>
            <Card className="border-amber-100 bg-amber-50/50">
              <CardContent className="divide-y divide-amber-100">
                {digest.missedTargets.map((t, i) => (
                  <p key={i} className="text-sm text-amber-800 py-2">{t}</p>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Empty state */}
        {digest.appSummaries.length === 0 && (
          <Card className="text-center py-12">
            <CardContent className="text-slate-400 space-y-2">
              <MoonStar className="w-10 h-10 mx-auto opacity-30" />
              <p className="font-medium">No captures recorded today yet.</p>
              <p className="text-xs">The verdict will populate as staff submit their forms.</p>
            </CardContent>
          </Card>
        )}

        <div className="pt-4 text-center">
          <Link href="/" className="text-sm text-indigo-600 hover:underline">← Back to home</Link>
        </div>
      </div>
    </div>
  );
}