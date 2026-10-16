"use client";

import React, { useState, useEffect, use } from "react";
import { migrateCubeToNative, type Manifest } from "@/lib/domain/manifest";
import { safeJson } from "@/lib/infra/fetch";
import { ListForm } from "@/components/forms/ListForm";
import { GridForm } from "@/components/forms/GridForm";
import { ArtifactSandbox } from "@/components/forms/ArtifactSandbox";
import { SubmitReview } from "@/components/forms/SubmitReview";
import { ScanCapture } from "@/components/forms/ScanCapture";
import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/components/forms/FieldInput";

type SubmitWorkflow = {
  tenantId?: string;
  config?: { title?: string; layout_type?: string; artifactHtml?: string; schema?: Manifest };
};

export default function SubmitPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;
  const [workflow, setWorkflow] = useState<SubmitWorkflow | null>(null);
  const [schema, setSchema] = useState<Manifest | null>(null);
  const [formState, setFormState] = useState<FormState>({});
  
  // Staff Gate State
  const [staffName, setStaffName] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [isStaffVerified, setIsStaffVerified] = useState(false);
  const [showGate, setShowGate] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<"fill" | "review">("fill");
  const [scanMode, setScanMode] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ count: number; confidence: number; mathVerified: boolean; flags: string[] } | null>(null);

  useEffect(() => {
    fetch(`/api/workflow/${id}`)
      .then(res => safeJson(res))
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else if (data.workflow) {
          setWorkflow(data.workflow);
          const s = migrateCubeToNative(data.workflow.config.schema);
          setSchema(s);
          
          const saved = localStorage.getItem(`draft_${id}`);
          if (saved) setFormState(JSON.parse(saved));

          const savedStaff = localStorage.getItem(`staff_${data.workflow.tenantId}`);
          if (savedStaff) {
             setStaffName(savedStaff);
             // We still require server session validation on submit, but we can bypass the PIN screen visually
             setIsStaffVerified(true);
          } else {
             setShowGate(true);
          }
        } else {
          setError("Workflow not found");
        }
        setIsLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (Object.keys(formState).length > 0) {
       localStorage.setItem(`draft_${id}`, JSON.stringify(formState));
    }
  }, [formState, id]);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/workflow/staff-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, staffName, tenantId: workflow?.tenantId })
      });
      const data = await safeJson(res);
      if (!data.success) throw new Error(data.error || "Invalid PIN");
      
      localStorage.setItem(`staff_${workflow?.tenantId}`, staffName);
      setIsStaffVerified(true);
      setShowGate(false);
      setError(null);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/submit-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: id,
          layout_type: schema?.layout_type,
          actuals: formState,
          filledBy: staffName
        })
      });
      const data = await safeJson(res);
      if (!data.success) throw new Error(data.error || "Failed to submit");
      
      localStorage.removeItem(`draft_${id}`);
      setSuccess(true);
      setError(null);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Failed to submit");
      setIsSubmitting(false);
    }
  };

  // Merge a photo-scan extraction into the native form state (honest prefill —
  // the staff confirms on the real form and the real /api/submit-form saves it).
  const applyScanPayload = (payload: Record<string, unknown>, meta: { count: number; confidence: number; mathVerified: boolean; flags: string[] }) => {
    const isGrid = schema?.layout_type === "grid";
    const entryMode = schema && "entryMode" in schema ? schema.entryMode : undefined;
    const personaRowKey = entryMode === "personal" ? staffName : undefined;
    setFormState((prev) => {
      const next = { ...prev };
      if (!isGrid) {
        // list → flat { fieldKey: value }
        for (const [k, v] of Object.entries(payload)) {
          if (v !== null && v !== undefined) next[k] = String(v);
        }
        return next;
      }
      // grid → { colKey: { rowKey: value } } (transpose into { rowKey: { colKey } }).
      let usedRow: string | undefined = personaRowKey;
      for (const [colKey, rowVal] of Object.entries(payload)) {
        if (rowVal && typeof rowVal === "object") {
          for (const [rowKey, val] of Object.entries(rowVal as Record<string, unknown>)) {
            if (val === null || val === undefined) continue;
            const row = (next[rowKey] as Record<string, string> | undefined) ?? {};
            row[colKey] = String(val);
            next[rowKey] = row;
            usedRow = usedRow || rowKey;
          }
        } else if (rowVal !== null && rowVal !== undefined) {
          const rowKey = personaRowKey || usedRow || "line_0";
          const row = (next[rowKey] as Record<string, string> | undefined) ?? {};
          row[colKey] = String(rowVal);
          next[rowKey] = row;
        }
      }
      return next;
    });
    setScanFeedback(meta);
    setError(null);
  };

  const openNativeForm = () => setScanMode(true);

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading form...</div>;

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8 border-emerald-100 shadow-xl shadow-emerald-900/5">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">✓</div>
          <CardTitle className="text-2xl font-bold text-slate-800 mb-2">Submitted</CardTitle>
          <p className="text-slate-600 mb-8">Your data has been securely logged to the ledger.</p>
          <Button onClick={() => window.location.reload()} className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-6 font-semibold">
            Submit Another
          </Button>
        </Card>
      </div>
    );
  }

  if (showGate && !isStaffVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 border-slate-200 shadow-xl">
          <CardTitle className="text-xl font-bold text-slate-800 mb-4">Staff Check-in</CardTitle>
          {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
          <form onSubmit={handleStaffLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Your Name</label>
              {schema?.layout_type === "grid" && schema?.entryMode === "personal" ? (
                 <select value={staffName} onChange={e => setStaffName(e.target.value)} required className="w-full p-2 border rounded-lg bg-white">
                    <option value="" disabled>Select your name...</option>
                    {schema.rows?.map((r, i:number) => <option key={i} value={r.key || r.label}>{r.label}</option>)}
                 </select>
              ) : (
                 <Input value={staffName} onChange={e => setStaffName(e.target.value)} required placeholder="Enter your full name" />
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Store PIN</label>
              <Input type="password" value={pin} onChange={e => setPin(e.target.value)} required placeholder="****" />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>Enter Store Ops</Button>
          </form>
        </Card>
      </div>
    );
  }

  if (error && !showGate) return <div className="p-8 text-center text-red-500">{error || "Failed to load"}</div>;
  if (!schema) return <div className="p-8 text-center text-red-500">Failed to load schema</div>;

  const artifactHtml = workflow?.config?.artifactHtml as string | undefined;

  // Check CloseBy
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' });
  const closeBy = schema.schedule?.closeBy;
  const isClosed = !!closeBy && timeStr > closeBy;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <header className="bg-gradient-to-r from-violet-700 to-indigo-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
             <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                {workflow?.config?.title || "Data Entry Form"}
             </h1>
             {schema.subtitle && (
                <p className="text-violet-200 text-sm mt-1">{schema.subtitle}</p>
             )}
          </div>
          <div className="flex items-center gap-3">
             <span className="text-sm bg-violet-900/50 px-3 py-1.5 rounded-lg border border-violet-700/50">👤 {staffName}</span>
          </div>
        </div>
      </header>
      
      {closeBy && (
         <div className={`text-center py-2 text-sm font-bold ${isClosed ? 'bg-red-500 text-white' : 'bg-yellow-100 text-yellow-800'}`}>
            {isClosed ? `Form closed at ${closeBy} IST` : `Closes at ${closeBy} IST`}
         </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {error && <div className="text-red-500 text-center">{error}</div>}
        {step === "fill" ? (
          <div className="space-y-8">
            {(schema.layout_type === "list" || schema.layout_type === "grid") && (
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <ScanCapture schema={schema} config={workflow?.config ?? {}} onExtracted={applyScanPayload} />
                {artifactHtml && scanMode && (
                  <button
                    type="button"
                    onClick={() => setScanMode(false)}
                    className="text-xs font-semibold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-3 py-2 rounded-lg transition-colors"
                  >
                    ⚡ Use the quick form
                  </button>
                )}
              </div>
            )}

            {scanFeedback && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-4 space-y-1">
                <p className="font-semibold">
                  📄 {String(scanFeedback.count)} fields captured from the photo
                  <span className="font-normal text-emerald-700"> · confidence {(scanFeedback.confidence * 100).toFixed(0)}%</span>
                  <span className="font-normal"> · math {scanFeedback.mathVerified ? "✓ verified" : "✗ not verified"}</span>
                </p>
                {scanFeedback.flags.length > 0 && (
                  <p className="text-amber-700 text-xs">
                    ⚠️ {scanFeedback.flags.join(" · ")}
                  </p>
                )}
                <p className="text-xs text-emerald-700/80">Review the values below, fix anything wrong, then continue.</p>
              </div>
            )}
            {artifactHtml && !scanMode ? (
              <div className="space-y-6">
                <ArtifactSandbox
                  html={artifactHtml}
                  workflowId={id}
                  layoutType={schema.layout_type}
                  staffName={staffName}
                  onSubmitted={() => {
                    localStorage.removeItem(`draft_${id}`);
                    setSuccess(true);
                    setError(null);
                  }}
                  onError={(msg) => setError(msg)}
                />
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={openNativeForm}
                    className="text-sm font-semibold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-4 py-3 rounded-xl transition-colors"
                  >
                    ✍️ Use the typed form instead
                  </button>
                </div>
              </div>
            ) : (
              <>
                {schema.layout_type === "list" && <ListForm schema={schema} formState={formState} setFormState={setFormState} />}
                {schema.layout_type === "grid" && <GridForm schema={schema} formState={formState} setFormState={setFormState} selectedPersona={schema.entryMode === "personal" ? staffName : undefined} />}
                
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex justify-between items-center shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] z-50">
                  <div className="max-w-3xl mx-auto w-full flex justify-between items-center px-4 lg:px-8">
                    <span />
                    <Button onClick={() => { setError(null); setStep("review"); }} disabled={isClosed} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-8 py-6 font-bold text-lg shadow-lg shadow-indigo-200 transition-all">
                      Review & Continue
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <SubmitReview schema={schema} formState={formState} onSubmit={handleSubmit} isSubmitting={isSubmitting} onEdit={() => setStep("fill")} />
        )}
      </main>
    </div>
  );
}
