"use client";

import React, { useState, useEffect, use } from "react";
import { safeJson } from "@/lib/infra/fetch";
import { ArtifactSandbox } from "@/components/forms/ArtifactSandbox";
import { TrendsStrip } from "@/components/trends-strip";

// Full-bleed standalone app: the console IS the page. Same workflow record as
// /submit/[id] — this route is chosen purely by presentation when an artifact
// exists.
//
// GATE DOCTRINE (for the segment that treats tech as "not for them"):
// - A worker's link (?as=staff) NEVER shows role vocabulary or a keyboard-name
//   field. Step 1: tap your name from the console's own roster (big tiles).
//   Step 2: tap the shop PIN on a numeric pad. Zero typing, zero wrong moves.
// - An owner's link (base URL) shows the owner card only.
// - Names come from archetypeConfig (people / asset owners / resources), so a
//   name that can be tapped is always a name the console can scope to.
// - Sessions keep the { name, role } shape the consoles already consume.

export default function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;
  const [workflow, setWorkflow] = useState<any>(null);
  const [artifactHtml, setArtifactHtml] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string>("");
  const [role, setRole] = useState<"owner" | "staff">("owner");
  const [pin, setPin] = useState<string>("");
  const [gate, setGate] = useState(false);
  const [gateStep, setGateStep] = useState<"name" | "pin">("name");
  const [verified, setVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noApp, setNoApp] = useState(false);

  // The console's bytes live on a GATED endpoint — fetched only after the
  // session verifies. A 401 here (expired/legacy cookie) drops the device
  // back to the gate to sign in again.
  async function loadArtifact() {
    try {
      const res = await fetch(`/api/workflow/${id}/artifact`);
      if (res.status === 401) {
        setVerified(false);
        setGate(true);
        setError("Sign in again to open the console.");
        return;
      }
      const data = await safeJson(res);
      if (data.success && typeof data.html === "string" && data.html.length > 0) {
        setArtifactHtml(data.html);
        setNoApp(false);
      } else if (typeof data.error === "string" && data.error.includes("no app")) {
        setNoApp(true);
        setError(data.error);
      } else {
        throw new Error(data.error || "Could not load the console");
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    fetch(`/api/workflow/${id}`)
      .then(res => safeJson(res))
      .then(data => {
        if (data.error || !data.workflow) {
          setError(data.error || "Workflow not found");
        } else {
          const wf = data.workflow;
          setWorkflow(wf);
          // Artifact bytes are NOT in this response for anonymous callers —
          // they load from the gated endpoint once the session verifies.
          void id;
          // Session shape: { name, role }. Legacy plain-string values are
          // treated as staff names (owner role always re-PINs — the safe default).
          const raw = localStorage.getItem(`staff_${wf.tenantId}`);
          const asParam = new URLSearchParams(window.location.search).get("as");
          let savedName = "";
          let savedRole: "owner" | "staff" = "staff";
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === "object") { savedName = parsed.name ?? ""; savedRole = parsed.role === "owner" ? "owner" : "staff"; }
              else { savedName = String(parsed); savedRole = "staff"; }
            } catch { savedName = raw; savedRole = "staff"; }
          }
          const wantRole: "owner" | "staff" = asParam === "staff" ? "staff" : "owner";
          if (savedName && savedRole === wantRole) {
            setStaffName(savedName);
            setRole(savedRole);
            setVerified(true);
            loadArtifact();
          } else {
            setRole(wantRole);
            setGate(true);
          }
        }
        setIsLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [id]);

  // The roster of tap-able worker names, derived from the console's own nouns.
  const roster: string[] = React.useMemo(() => {
    const ac = workflow?.config?.archetypeConfig ?? {};
    const out: string[] = [];
    if (Array.isArray(ac.people)) for (const p of ac.people) if (p?.name) out.push(String(p.name));
    if (Array.isArray(ac.assets)) for (const a of ac.assets) if (a?.owner && !out.includes(String(a.owner))) out.push(String(a.owner));
    if (Array.isArray(ac.items)) for (const i of ac.items) if (i?.owner && !out.includes(String(i.owner))) out.push(String(i.owner));
    if (Array.isArray(ac.resources)) for (const r of ac.resources) if (r?.name) out.push(String(r.name));
    if (Array.isArray(ac.counters)) for (const c of ac.counters) if (c?.name && !out.includes(String(c.name))) out.push(String(c.name));
    if (Array.isArray(ac.staff)) for (const s of ac.staff) if (s?.name && !out.includes(String(s.name))) out.push(String(s.name));
    if (Array.isArray(ac.workers)) for (const w of ac.workers) if (w?.name && !out.includes(String(w.name))) out.push(String(w.name));
    if (Array.isArray(ac.desk)) for (const d of ac.desk) if (d?.name && !out.includes(String(d.name))) out.push(String(d.name));
    return [...new Set(out)].filter(Boolean);
  }, [workflow]);

  const handleLogin = async (loginRole: "owner" | "staff", loginName: string, loginPin: string) => {
    setIsLoading(true);
    // Owner logs in with a sentinel name — the endpoint requires one, but owner
    // identity is irrelevant to scoping (owner always sees the full console).
    const name = loginRole === "owner" ? "__owner__" : loginName.trim();
    try {
      const res = await fetch("/api/workflow/staff-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: loginPin, staffName: name, tenantId: workflow.tenantId, role: loginRole })
      });
      const data = await safeJson(res);
      if (!data.success) throw new Error(data.error || "Invalid PIN");
      localStorage.setItem(`staff_${workflow.tenantId}`, JSON.stringify({ name, role: loginRole }));
      setStaffName(name);
      setRole(loginRole);
      setVerified(true);
      setGate(false);
      setError(null);
      loadArtifact();
    } catch (err: any) {
      setError(err.message);
      setPin("");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !workflow) return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">Loading app…</div>;

  if ((error && !artifactHtml) || noApp) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center text-slate-300">
          <p className="text-red-400">{error}</p>
          <a href={`/submit/${id}`} className="text-sky-400 underline text-sm mt-4 inline-block">Open the form instead →</a>
        </div>
      </div>
    );
  }

  if (gate && !verified) {
    const isStaff = role === "staff";
    const padKey = (d: string) => {
      setError(null);
      const next = (pin + d).slice(0, 8);
      setPin(next);
    };
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8">
          {isStaff && gateStep === "name" && (
            <>
              <h1 className="text-2xl font-bold text-white mb-1">Welcome! 👋</h1>
              <p className="text-sm text-slate-400 mb-6">Tap your name to start.</p>
              {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
              {roster.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {roster.map(n => (
                    <button
                      key={n}
                      onClick={() => { setStaffName(n); setGateStep("pin"); setError(null); }}
                      className="p-5 rounded-2xl border-2 border-slate-700 bg-slate-800 text-white text-lg font-bold hover:border-emerald-400 hover:bg-slate-700 active:scale-95 transition"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                // No roster in this console's config → warm typed fallback.
                // (Chrome-scoped archetypes accept any signed-in name by design.)
                <form onSubmit={(e) => { e.preventDefault(); if (staffName.trim()) setGateStep("pin"); }} className="space-y-4">
                  <input
                    value={staffName}
                    onChange={e => setStaffName(e.target.value)}
                    required
                    placeholder="Your name"
                    className="w-full p-4 rounded-xl bg-slate-800 border-2 border-slate-700 text-white text-lg"
                  />
                  <button type="submit" className="w-full p-4 rounded-xl bg-emerald-600 text-white text-lg font-bold">Next →</button>
                </form>
              )}
            </>
          )}

          {(gateStep === "pin" || !isStaff) && (
            <>
              <h1 className="text-2xl font-bold text-white mb-1">
                {isStaff ? `Hi ${staffName} 👋` : "Owner sign-in"}
              </h1>
              <p className="text-sm text-slate-400 mb-6">{isStaff ? "Tap the shop PIN." : "Enter the store PIN."}</p>
              {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
              <div className="text-center mb-6">
                <div className="text-4xl font-bold tracking-[0.4em] text-white min-h-[3rem]">
                  {pin ? "•".repeat(pin.length) : <span className="text-slate-600">····</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
                  <button key={d} onClick={() => padKey(d)} className="p-5 rounded-2xl bg-slate-800 border-2 border-slate-700 text-white text-2xl font-bold active:scale-95 hover:border-sky-400 transition">{d}</button>
                ))}
                <button onClick={() => { setPin(""); setError(null); }} className="p-5 rounded-2xl bg-slate-800 border-2 border-slate-700 text-slate-300 text-lg font-bold active:scale-95 transition">Clear</button>
                <button onClick={() => padKey("0")} className="p-5 rounded-2xl bg-slate-800 border-2 border-slate-700 text-white text-2xl font-bold active:scale-95 hover:border-sky-400 transition">0</button>
                <button
                  onClick={() => handleLogin(isStaff ? "staff" : "owner", staffName, pin)}
                  disabled={isLoading || pin.length < 3}
                  className="p-5 rounded-2xl bg-emerald-600 border-2 border-emerald-500 text-white text-lg font-bold active:scale-95 disabled:opacity-40 transition"
                >
                  {isLoading ? "…" : "Go ✓"}
                </button>
              </div>
              {isStaff && (
                <button onClick={() => { setGateStep("name"); setPin(""); setError(null); }} className="mt-5 text-slate-400 text-sm underline">
                  ← Not you? Pick your name again
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (!artifactHtml) {
    return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">Loading console…</div>;
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-950 overflow-hidden">
      <header className="h-14 shrink-0 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/80">
        <a href="/dashboard" className="text-slate-400 hover:text-white text-sm">← OpsDesk</a>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{role === "owner" ? "🔑 Owner" : `✍️ ${staffName}`}</span>
          {role === "owner" && (
            <a href={`/app/${id}/edit`} className="text-xs text-emerald-400 hover:text-emerald-300 underline">edit console</a>
          )}
        </div>
        <a href={`/submit/${id}`} className="text-xs text-slate-500 hover:text-slate-300 underline">form view</a>
      </header>
      {role === "owner" && <TrendsStrip workflowId={id} />}
      <ArtifactSandbox
        html={artifactHtml!}
        workflowId={id}
        layoutType={workflow?.config?.schema?.layout_type}
        staffName={staffName}
        role={role}
        fullBleed
        onError={(msg) => setError(msg)}
      />
    </div>
  );
}
