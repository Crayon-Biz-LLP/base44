"use client";

// Owner editor — /app/[id]/edit. A structured form over the console's own
// nouns (identity, theme, people/items/stages lists, extension collections),
// plus a chat box that lands on the same deterministic pipeline.
//
// LIFECYCLE: saving never touches the live console. POST creates a DRAFT
// version and the editor redirects to the draft (preview banner + "Make
// live"). "Make live" calls the atomic activate endpoint; the old link keeps
// serving the live head until then. The version strip can restore any old
// version as a new draft — zero LLM anywhere in this page's path.
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { safeJson } from "@/lib/infra/fetch";

type Row = Record<string, unknown>;
type ListSpec = { key: string; label: string; primary: string; secondary?: string[]; numeric?: string[]; noun: string };

// Which config arrays are editable per archetype: core collections plus the
// optional extensions (stock / priceList / parts / repairs / ownerStages).
// `numeric` fields render as number inputs.
const EDIT_LISTS: Record<string, ListSpec[]> = {
  spatial: [
    { key: "categories", label: "Categories", primary: "label", secondary: ["match", "colorHex"], noun: "category" },
    { key: "stock", label: "Stock watchlist", primary: "name", secondary: ["unit", "qty", "minQty"], numeric: ["qty", "minQty"], noun: "stock item" },
  ],
  "target-board": [
    { key: "people", label: "People", primary: "name", noun: "person" },
    { key: "metrics", label: "Metrics & targets", primary: "label", secondary: ["target", "key"], numeric: ["target"], noun: "metric" },
    { key: "stock", label: "Stock & expiry watchlist", primary: "name", secondary: ["unit", "qty", "minQty"], numeric: ["qty", "minQty"], noun: "stock item" },
    { key: "priceList", label: "Rate card", primary: "item", secondary: ["price"], numeric: ["price"], noun: "rate" },
  ],
  pipeline: [
    { key: "stages", label: "Stages", primary: "label", noun: "stage" },
    { key: "parts", label: "Parts catalog", primary: "name", secondary: ["rate"], numeric: ["rate"], noun: "part" },
    { key: "repairs", label: "Parts used per job", primary: "card", secondary: ["part", "qty"], numeric: ["qty"], noun: "parts line" },
    { key: "ownerStages", label: "Owner-gated stages", primary: "label", noun: "gated stage" },
  ],
  ledger: [{ key: "entryTypes", label: "Entry types", primary: "label", noun: "entry type" }],
  temporal: [{ key: "resources", label: "Resources", primary: "name", noun: "resource" }],
  fleet: [{ key: "statuses", label: "Statuses", primary: "label", noun: "status" }],
  queue: [{ key: "counters", label: "Counters", primary: "name", noun: "counter" }],
  checklist: [
    { key: "rounds", label: "Rounds", primary: "name", noun: "round" },
    { key: "staff", label: "Round runners", primary: "name", noun: "person" },
  ],
  roster: [{ key: "workers", label: "Workers & rates", primary: "name", secondary: ["rate"], numeric: ["rate"], noun: "worker" }],
  calendar: [{ key: "desk", label: "Front desk", primary: "name", noun: "person" }],
};

const SCALARS: {
  common: { key: string; label: string; type: "text" | "number" | "color" | "bool" }[];
  perArchetype: Record<string, { key: string; label: string; type: "text" | "number" | "color" | "bool" }[]>;
} = {
  common: [
    { key: "productName", label: "Product name", type: "text" },
    { key: "tagline", label: "Tagline", type: "text" },
    { key: "accentHex", label: "Accent color", type: "color" },
  ],
  perArchetype: {
    roster: [{ key: "unitLabel", label: "Unit label (day/piece)", type: "text" }],
    fleet: [{ key: "serviceEvery", label: "Service interval", type: "number" }],
    queue: [{ key: "avgMinutes", label: "Avg minutes per person", type: "number" }],
    checklist: [{ key: "passTargetPct", label: "Pass target %", type: "number" }],
    calendar: [{ key: "soonDays", label: "Due-soon window (days)", type: "number" }],
  },
};

type VersionRow = { id: string; version: number; status: string; createdAt: string | null; title: string | null; summary: string | null; isHead: boolean; isServed: boolean };

type WorkflowHeader = {
  status?: string;
  isActive?: boolean;
  schemaVersion?: number;
  config?: { archetype?: string; title?: string; archetypeConfig?: Row };
};

// Seed keys for new list rows only need per-session uniqueness; keeping the
// clock read in a module-scope helper keeps it out of the render-purity pass.
const timeId36 = () => Date.now().toString(36);

export default function OwnerEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [wf, setWf] = useState<WorkflowHeader | null>(null);
  const [cfg, setCfg] = useState<Row>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState("");
  const [chatResult, setChatResult] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [isDraft, setIsDraft] = useState(false);
  const [justCreated, setJustCreated] = useState(false);

  function loadVersions() {
    fetch(`/api/workflow/${id}/versions`)
      .then(r => safeJson(r))
      .then(d => { if (d.success) setVersions(d.versions ?? []); })
      .catch(() => {});
  }

  useEffect(() => {
    fetch(`/api/workflow/${id}`)
      .then(r => safeJson(r))
      .then(data => {
        if (data.error) { setError(data.error); return; }
        const w = data.workflow;
        setWf(w);
        setIsDraft(w?.status === "draft" && !w?.isActive);
        setJustCreated(new URLSearchParams(window.location.search).get("created") === "1");
        const ac = w?.config?.archetypeConfig ?? {};
        setCfg(typeof structuredClone === "function" ? structuredClone(ac) : JSON.parse(JSON.stringify(ac)));
      })
      .catch(e => setError(String(e?.message || e)));
    loadVersions();
  }, [id]);

  const archetype: string = wf?.config?.archetype ?? "";
  const lists = EDIT_LISTS[archetype] ?? [];
  const scalars = useMemo(() => [...(SCALARS.common ?? []), ...(SCALARS.perArchetype[archetype] ?? [])], [archetype]);

  const setScalar = (key: string, v: unknown) => setCfg((c) => ({ ...c, [key]: v }));

  const setListRow = (listKey: string, i: number, field: string, v: unknown) =>
    setCfg((c) => {
      const list = [...((c[listKey] as Row[]) || [])];
      list[i] = { ...list[i], [field]: v };
      return { ...c, [listKey]: list };
    });

  const addListRow = (listKey: string, proto: Row) =>
    setCfg((c) => ({ ...c, [listKey]: [...((c[listKey] as Row[]) || []), { ...proto }] }));

  const rmListRow = (listKey: string, i: number) =>
    setCfg((c) => ({ ...c, [listKey]: ((c[listKey] as Row[]) || []).filter((_: Row, j: number) => j !== i) }));

  // Save → NEW DRAFT on the lineage; the live console is untouched.
  async function save(): Promise<string | null> {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/workflow/${id}/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: cfg }),
      });
      const data = await safeJson(res);
      if (!data.success) throw new Error(data.error || "Save failed");
      if (data.changed === false) return data.workflowId;
      return data.workflowId as string;
    } catch (e) {
      setError((e as { message?: string }).message ?? "Request failed");
      return null;
    } finally { setBusy(false); }
  }

  async function activate(workflowId: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/workflow/${workflowId}/activate`, { method: "POST" });
      const data = await safeJson(res);
      if (!data.success) throw new Error(data.error || "Activation failed");
      router.push(`/app/${workflowId}`);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Request failed");
      setBusy(false);
    }
  }

  async function saveAndPreview() {
    const newId = await save();
    if (newId) router.push(`/app/${newId}/edit?created=1`);
  }

  async function saveAndMakeLive() {
    const newId = await save();
    if (newId) await activate(newId);
  }

  async function sendChat() {
    if (!chat.trim()) return;
    setBusy(true); setError(null); setChatResult(null);
    try {
      const res = await fetch(`/api/workflow/${id}/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatEdit: chat }),
      });
      const data = await safeJson(res);
      if (!data.success) throw new Error(data.error || "Edit failed");
      if (data.changed === false) setChatResult(data.summary || "No changes needed.");
      else router.push(`/app/${data.workflowId}/edit?created=1`);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Request failed");
    } finally { setBusy(false); }
  }

  async function restore(version: number) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/workflow/${id}/restore`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const data = await safeJson(res);
      if (!data.success) throw new Error(data.error || "Restore failed");
      router.push(`/app/${data.workflowId}/edit?created=1`);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Request failed");
      setBusy(false);
    }
  }

  if (error && !wf) {
    return <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-6"><div className="text-center"><p className="text-red-400">{error}</p><a href={`/app/${id}`} className="text-sky-400 underline text-sm mt-4 inline-block">Back to console →</a></div></div>;
  }
  if (!wf) {
    return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">Loading editor…</div>;
  }

  const protoFor = (spec: ListSpec): Row => {
    const row: Row = { [spec.primary]: "" };
    for (const s of spec.secondary ?? []) {
      if (s === "key" && spec.key === "metrics") row.key = "field" + timeId36();
      else if (spec.numeric?.includes(s)) row[s] = 0;
      else if (s === "colorHex") row[s] = "#38bdf8";
      else if (s === "unit") row[s] = "pcs";
      else row[s] = "";
    }
    return row;
  };

  const statusChip = (s: string) =>
    s === "live" ? "bg-emerald-500/15 text-emerald-400 border-emerald-700"
    : s === "draft" ? "bg-amber-500/15 text-amber-400 border-amber-700"
    : "bg-slate-800 text-slate-400 border-slate-700";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-3xl mx-auto p-6 pb-32">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-white">Edit console</h1>
            <p className="text-sm text-slate-400">
              {String(cfg.productName ?? wf.config?.title ?? "")} · {archetype} · v{wf.schemaVersion}
              {isDraft ? " · draft preview" : " · live"}
            </p>
          </div>
          <a href={`/app/${id}`} className="text-sky-400 underline text-sm">Back to console →</a>
        </div>

        {isDraft && (
          <div className="mt-4 mb-6 p-4 rounded-xl border-2 border-dashed border-amber-600 bg-amber-950/30 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-amber-300">{justCreated ? "Draft created — the live console is untouched." : "You're viewing a draft version."}</div>
              <div className="text-xs text-slate-400 mt-0.5">Staff still see the live version until you make this one live.</div>
            </div>
            <button onClick={() => activate(id)} disabled={busy} className="shrink-0 px-5 py-2.5 rounded-xl bg-emerald-500 text-black font-bold text-sm disabled:opacity-50">Make live</button>
          </div>
        )}

        {error && <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-sm">{error}</div>}

        {/* Version strip */}
        {versions.length > 1 && (
          <div className="mb-8 p-4 rounded-xl border border-slate-800 bg-slate-900">
            <div className="text-sm font-semibold text-white mb-3">Version history</div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {versions.map(v => (
                <div key={v.id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-slate-400 w-10">v{v.version}</span>
                  <span className={`px-2 py-0.5 rounded border ${statusChip(v.status)}`}>{v.isHead ? "live" : v.status}</span>
                  <span className="flex-1 truncate text-slate-300">{v.summary ?? v.title ?? ""}</span>
                  {v.createdAt && <span className="text-slate-500">{new Date(v.createdAt).toLocaleDateString()}</span>}
                  {!v.isHead && (
                    <button onClick={() => restore(v.version)} disabled={busy} className="px-2 py-1 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-sky-500 disabled:opacity-40">Restore</button>
                  )}
                  {v.isHead && <span className="text-emerald-400">●</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat edit */}
        <div className="mb-8 p-4 rounded-xl border border-slate-800 bg-slate-900">
          <div className="text-sm font-semibold text-white mb-2">Just tell me what to change</div>
          <div className="flex gap-2">
            <input
              value={chat}
              onChange={e => setChat(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") sendChat(); }}
              placeholder="e.g. rename Divya to Divya Patel, add worker Ganesh at 50, make the accent green"
              className="flex-1 p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm"
            />
            <button onClick={sendChat} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold text-sm disabled:opacity-50">Apply</button>
          </div>
          {chatResult && <div className="mt-2 text-xs text-slate-400">{chatResult}</div>}
        </div>

        {/* Identity scalars */}
        <div className="mb-8">
          <div className="text-sm font-semibold text-white mb-3">Basics</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {scalars.map(s => (
              <label key={s.key} className="block">
                <span className="block text-xs text-slate-400 mb-1">{s.label}</span>
                {s.type === "color" ? (
                  <span className="flex items-center gap-2">
                    <input type="color" value={String(cfg[s.key] ?? "#38bdf8")} onChange={e => setScalar(s.key, e.target.value)} className="w-10 h-9 rounded border border-slate-700 bg-slate-900" />
                    <input value={String(cfg[s.key] ?? "")} onChange={e => setScalar(s.key, e.target.value)} className="flex-1 p-2 rounded-lg bg-slate-900 border border-slate-700 text-sm" />
                  </span>
                ) : (
                  <input
                    type={s.type === "number" ? "number" : "text"}
                    value={String(cfg[s.key] ?? "")}
                    onChange={e => setScalar(s.key, s.type === "number" ? Number(e.target.value) : e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
                  />
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Collections */}
        {lists.map(list => {
          const rows = (cfg[list.key] as Row[]) || [];
          return (
            <div key={list.key} className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-white">{list.label}</div>
                <button onClick={() => addListRow(list.key, protoFor(list))} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-emerald-500">+ Add {list.noun}</button>
              </div>
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={String(row[list.primary] ?? "")}
                      onChange={e => setListRow(list.key, i, list.primary, e.target.value)}
                      className="flex-1 p-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
                      aria-label={`${list.noun} ${i + 1}`}
                    />
                    {(list.secondary ?? []).map(s => (
                      <input
                        key={s}
                        type={list.numeric?.includes(s) ? "number" : "text"}
                        value={String(row[s] ?? "")}
                        onChange={e => setListRow(list.key, i, s, list.numeric?.includes(s) ? Number(e.target.value) : e.target.value)}
                        className={`${list.numeric?.includes(s) ? "w-20" : "w-24"} p-2 rounded-lg bg-slate-900 border border-slate-700 text-sm`}
                        aria-label={`${list.noun} ${i + 1} ${s}`}
                      />
                    ))}
                    <button onClick={() => rmListRow(list.key, i)} className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-red-400 text-sm" aria-label={`Remove ${list.noun} ${i + 1}`}>✕</button>
                  </div>
                ))}
                {!rows.length && <div className="text-xs text-slate-500">None configured — add one and save.</div>}
              </div>
            </div>
          );
        })}

        <div className="text-xs text-slate-500 mt-10 leading-relaxed">
          Saving revalidates every change against the console&apos;s schema, reassembles the app deterministically (no AI in this path), runs the artifact gates, and saves it as a <span className="text-slate-300">draft</span> — the live console keeps serving until you tap Make live. The old link always works.
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <span className="text-xs text-slate-500">Changes stay local until you save.</span>
          <div className="flex items-center gap-2">
            <button onClick={saveAndPreview} disabled={busy} className="px-4 py-2.5 rounded-xl border border-emerald-600 text-emerald-400 font-semibold text-sm disabled:opacity-50 hover:bg-emerald-950/40">Save & preview</button>
            <button onClick={saveAndMakeLive} disabled={busy} className="px-6 py-2.5 rounded-xl bg-emerald-500 text-black font-bold text-sm disabled:opacity-50">{busy ? "Saving…" : "Save & make live"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
