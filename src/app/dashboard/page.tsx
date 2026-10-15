"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, TrendingUp, BarChart3, PieChart, Table as TableIcon, Send, FileCheck2, MoonStar } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertContactCard } from "@/components/alert-contact-card";
import { OwnerOverview } from "@/components/owner-overview";
import { ActivityFeed } from "@/components/activity-feed";

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

const formatEventTime = (iso: string | Date) => {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [widgets, setWidgets] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saves, setSaves] = useState<any[]>([]);
  const [savesLoading, setSavesLoading] = useState(true);

  useEffect(() => {
    generateDashboard("Show me an overview of all my apps");
    (async () => {
      try {
        const res = await fetch("/api/dashboard/saves");
        const json = await res.json();
        setSaves(json.saves || []);
      } catch {
        setSaves([]);
      } finally {
        setSavesLoading(false);
      }
    })();
  }, []);

  const generateDashboard = async (overridePrompt?: string) => {
    const text = overridePrompt || prompt;
    if (!text.trim()) return;

    setLoading(true);
    setError(null);
    setWidgets([]);

    try {
      // 1. Generate Spec
      const genRes = await fetch("/api/dashboard/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text })
      });
      
      const genData = await genRes.json();
      
      if (genData.empty) {
        setLoading(false);
        setError("No apps found. Go to the Builder to create an app first.");
        return;
      }
      if (!genData.success || !genData.spec) {
        throw new Error(genData.error || "Failed to generate dashboard");
      }

      // 2. Fetch Data
      const dataRes = await fetch("/api/dashboard/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(genData.spec)
      });
      
      const dashboardData = await dataRes.json();
      if (dashboardData.error) throw new Error(dashboardData.error);
      
      setWidgets(dashboardData.widgets || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (!overridePrompt) setPrompt("");
    }
  };

  const renderWidget = (w: any) => {
    if (w.empty) {
      return (
        <Card className="h-full flex items-center justify-center p-8 bg-gray-50/50 border-dashed shadow-none">
          <p className="text-muted-foreground text-sm">No data in this range</p>
        </Card>
      );
    }

    const data = w.data;

    switch (w.spec.type) {
      case "stat":
        return (
          <Card className="h-full shadow-sm">
            <CardContent className="p-6 flex flex-col justify-center h-full">
              <p className="text-sm font-medium text-gray-500">{w.spec.title}</p>
              <h2 className="text-4xl font-bold mt-2 text-gray-900">
                {data.value}
                {w.spec.metric.kind === 'percent_achieved' && '%'}
              </h2>
            </CardContent>
          </Card>
        );

      case "trend":
        return (
          <Card className="h-full shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{w.spec.title}</CardTitle>
            </CardHeader>
            <CardContent className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{fontSize: 12, fill: '#9ca3af'}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fontSize: 12, fill: '#9ca3af'}} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981'}} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );

      case "compare":
        return (
          <Card className="h-full shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{w.spec.title}</CardTitle>
            </CardHeader>
            <CardContent className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.entities} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{fontSize: 12, fill: '#9ca3af'}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fontSize: 12, fill: '#9ca3af'}} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );

      case "breakdown":
        return (
          <Card className="h-full shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{w.spec.title}</CardTitle>
            </CardHeader>
            <CardContent className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie data={data.slices} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {data.slices.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );

      case "table":
        return (
          <Card className="h-full shadow-sm">
            <CardHeader className="pb-2 border-b bg-gray-50/50">
              <CardTitle className="text-sm font-medium text-gray-900">{w.spec.title}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500 border-b">
                    <tr>
                      <th className="p-3 font-semibold text-xs uppercase tracking-wider">{w.spec.entity === 'staff' ? 'Staff' : 'Label'}</th>
                      <th className="p-3 font-semibold text-xs uppercase tracking-wider text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {data.rows?.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-medium text-gray-900">{row.label}</td>
                        <td className="p-3 text-right font-bold text-gray-900">
                          {row.value}{w.spec.metric.kind === 'percent_achieved' && '%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Executive Dashboard</h1>
            <p className="text-muted-foreground mt-1">Prompt-compiled intelligence.</p>
          </div>
          <Link
            href="/verdict"
            className="flex items-center gap-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors"
          >
            <MoonStar className="w-4 h-4" /> Tonight&apos;s verdict →
          </Link>
        </header>

        {/* The morning view — one honest line per console, problems first */}
        <OwnerOverview />

        {/* Who logged what, across every console */}
        <ActivityFeed />

        {/* Alert destinations — where the reflexes ring */}
        <AlertContactCard />

        {/* Recent Captures — the heartbeat: every staff tap surfaces here */}
        {saves.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                <CardTitle className="text-base">Recent captures</CardTitle>
                {savesLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
              </div>
              <CardDescription>Every staff submission this session, with the engine verdict.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-gray-100">
              {saves.map((s) => {
                const v = s.verdict || {};
                return (
                  <Link
                    key={s.eventId}
                    href={`/report/${s.workflowId}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 -mx-4 px-4 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate group-hover:text-indigo-700 transition-colors">{s.workflowTitle}</p>
                      <p className="text-sm text-gray-500 truncate">{v.summary || "Capture saved."}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {v.money?.total != null && (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          ₹{(v.money.total as number).toLocaleString("en-IN")}
                        </Badge>
                      )}
                      {v.coverage && (
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                          {v.coverage.slotsFilled}/{v.coverage.slotsTotal} slots
                        </Badge>
                      )}
                      <span className="text-xs text-gray-400">{s.filledBy} · {formatEventTime(s.createdAt)}</span>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Query Bar */}
        <div className="bg-white rounded-2xl shadow-sm border p-2">
          <div className="relative flex items-center">
            <Textarea 
              placeholder="Ask for a dashboard (e.g., 'Ramesh vs Suresh last 7 days')..."
              className="min-h-[60px] resize-none border-0 focus-visible:ring-0 text-lg py-4 pl-4 pr-16 shadow-none"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  generateDashboard();
                }
              }}
              disabled={loading}
            />
            <div className="absolute right-2 bottom-2">
              <Button 
                size="icon" 
                className="h-10 w-10 rounded-xl"
                onClick={() => generateDashboard()}
                disabled={!prompt.trim() || loading}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {["Ramesh vs Suresh achievement", "Today's summary", "This week's trend", "Show me an overview"].map(chip => (
            <button
              key={chip}
              onClick={() => generateDashboard(chip)}
              disabled={loading}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full transition-colors border shadow-sm cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm border border-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-gray-500 font-medium animate-pulse">Compiling dashboard & aggregating data...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-500">
            {widgets.map(w => (
              <div 
                key={w.id} 
                className={`
                  ${w.spec.type === 'table' || w.spec.type === 'trend' ? 'md:col-span-2 lg:col-span-2' : 'col-span-1'}
                `}
              >
                {renderWidget(w)}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
