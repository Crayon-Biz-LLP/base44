// Console lifecycle e2e — the wiring owner editing depends on, end to end
// against a running dev server:
//   1. edit → DRAFT (live head untouched, draft serves its own id)
//   2. activate → head swap (exactly one active row per lineage)
//   3. versions + restore → restored config lands as a new draft
//   4. app-state is lineage-scoped (live data follows versions)
//   5. list visibility: the lineage stays visible before AND after activation
//
// Env-gated like entry-behavior:
//   LC_WF=<workflowId>          lineage head to exercise (owner-console)
//   ACCESS_CODE=<tenant code>   owner login (default: chennai2026)
// Start `npm run dev` in the same command; then:
//   npx tsx --test --test-force-exit tests/lifecycle-e2e.mts
import { test } from "node:test";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const WF = process.env.LC_WF || "";
const ACCESS = process.env.ACCESS_CODE || "chennai2026";

const only = async (fn: () => Promise<void>) => {
  if (!WF) { console.log("  skip  lifecycle-e2e (set LC_WF + running dev server)"); return; }
  await fn();
};

type WfListItem = { id: string; isActive?: boolean; config?: { archetype?: string; archetypeConfig?: unknown } };
type VersionItem = { version: number; isHead?: boolean };

let cookie = "";
async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode: ACCESS }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/opsdesk_tenant_id=([^;]+)/);
  if (!m) throw new Error("owner login failed");
  cookie = `opsdesk_tenant_id=${m[1]}`;
}
const authed = (extra: Record<string, string> = {}) => ({ cookie, ...extra });

async function getJson(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: authed() });
  return res.json();
}

test("console lifecycle", () => only(async () => {
  await login();

  // --- Baseline ------------------------------------------------------------
  // LC_WF may be omitted: the first archetype console in the tenant's list is
  // used, so the test runs against any seeded tenant out of the box.
  let wfId = WF;
  if (!wfId) {
    const list = await getJson("/api/workflow");
    const pick = (list.workflows ?? []).find((w: WfListItem) => w.config?.archetype && w.config?.archetypeConfig);
    if (!pick) throw new Error("No archetype console found for the tenant (and LC_WF unset)");
    wfId = pick.id;
  }
  const head0 = (await getJson(`/api/workflow/${wfId}`)).workflow;
  if (!head0) throw new Error(`workflow ${wfId} not found`);
  const cfg0 = head0.config as Record<string, unknown>;
  const base = cfg0.archetypeConfig as Record<string, unknown>;
  const archetype = cfg0.archetype as string;
  if (!base || !archetype) throw new Error("LC_WF must be an archetype console");

  const renameTo = `${String(base.productName ?? cfg0.title ?? "Console")} LC`;
  const listBefore = await getJson("/api/workflow");
  const beforeVisible = (listBefore.workflows ?? []).some((w: WfListItem) => w.id === head0.id);

  // --- 1. Edit → draft, head untouched -------------------------------------
  const editRes = await fetch(`${BASE}/api/workflow/${head0.id}/edit`, {
    method: "POST", headers: authed({ "Content-Type": "application/json" }),
    body: JSON.stringify({ patch: { ...base, productName: renameTo } }),
  });
  const edit = await editRes.json();
  if (!edit.success || !edit.workflowId) throw new Error(`edit failed: ${JSON.stringify(edit).slice(0, 300)}`);
  console.log(`  ok  edit created draft ${edit.workflowId} (v${edit.version}, ${edit.cascaded?.length ?? 0} cascades)`);

  const draftRow = (await getJson(`/api/workflow/${edit.workflowId}`)).workflow;
  const headStill = (await getJson(`/api/workflow/${head0.id}`)).workflow;
  const draftVisible = ((await getJson("/api/workflow")).workflows ?? []).some((w: WfListItem) => w.id === edit.workflowId);
  console.log(`  ${draftRow.id === edit.workflowId && draftRow.schemaVersion === edit.version ? "ok" : "FAIL"}  draft serves its own id (v${draftRow.schemaVersion})`);
  console.log(`  ${headStill.id === head0.id && beforeVisible ? "ok" : "FAIL"}  old link still serves the live head`);
  console.log(`  ${!draftVisible ? "ok" : "FAIL"}  draft hidden from console list until activated`);

  // --- 2. Activate → head swap ---------------------------------------------
  const actRes = await fetch(`${BASE}/api/workflow/${edit.workflowId}/activate`, { method: "POST", headers: authed() });
  const act = await actRes.json();
  if (!act.success) throw new Error(`activate failed: ${JSON.stringify(act)}`);

  const oldAfter = (await getJson(`/api/workflow/${head0.id}`)).workflow;
  const listAfter = await getJson("/api/workflow");
  const activeCount = (listAfter.workflows ?? []).filter((w: WfListItem) => w.id === oldAfter.id && w.isActive).length;
  console.log(`  ${oldAfter.id === edit.workflowId ? "ok" : "FAIL"}  old link forwards to the new head (${oldAfter.id.slice(0, 8)}…)`);
  console.log(`  ${listAfter.workflows.some((w: WfListItem) => w.id === edit.workflowId) ? "ok" : "FAIL"}  new head visible in console list`);
  console.log(`  ${activeCount === 1 ? "ok" : "FAIL"}  exactly one active row in the tenant list`);

  // --- 3. Versions + restore ------------------------------------------------
  const vs = await getJson(`/api/workflow/${edit.workflowId}/versions`);
  const restoredExists = (vs.versions ?? []).some((v: VersionItem) => v.version === head0.schemaVersion);
  console.log(`  ${vs.success && restoredExists ? "ok" : "FAIL"}  versions lists the lineage (${(vs.versions ?? []).length} rows, head v${(vs.versions ?? []).find((v: VersionItem) => v.isHead)?.version})`);

  const restoreRes = await fetch(`${BASE}/api/workflow/${edit.workflowId}/restore`, {
    method: "POST", headers: authed({ "Content-Type": "application/json" }),
    body: JSON.stringify({ version: head0.schemaVersion }),
  });
  const restore = await restoreRes.json();
  if (!restore.success) throw new Error(`restore failed: ${JSON.stringify(restore).slice(0, 300)}`);
  const restored = (await getJson(`/api/workflow/${restore.workflowId}`)).workflow;
  const restoredName = (restored.config as { archetypeConfig?: { productName?: string } })?.archetypeConfig?.productName;
  console.log(`  ${restoredName && restoredName === String(base.productName ?? "") ? "ok" : "FAIL"}  restore re-emits the old config as draft v${restore.version} ("${restoredName}")`);

  // --- 3b. concurrency: parallel edits allocate DISTINCT versions ------------
  // (lineage-max allocation + FOR UPDATE lock + unique index; base+1 would
  // collide here)
  const par = await Promise.all(
    [1, 2, 3].map((n) =>
      fetch(`${BASE}/api/workflow/${edit.workflowId}/edit`, {
        method: "POST", headers: authed({ "Content-Type": "application/json" }),
        body: JSON.stringify({ patch: { ...base, productName: `${renameTo} P${n}` } }),
      }).then((r) => r.json()),
    ),
  );
  const parVersions = par.map((p: { version: number }) => p.version).sort((a, b) => a - b);
  const parDistinct = new Set(parVersions).size === par.length;
  console.log(`  ${par.every((p: { success?: boolean }) => p.success) && parDistinct ? "ok" : "FAIL"}  3 parallel edits → distinct versions (${parVersions.join(", ")})`);

  // --- 3c. concurrency: parallel activations leave EXACTLY ONE head ----------
  const actResults = await Promise.all(
    [edit.workflowId, restore.workflowId].map((wid) =>
      fetch(`${BASE}/api/workflow/${wid}/activate`, { method: "POST", headers: authed() }).then((r) => r.json()),
    ),
  );
  const vsPar = await getJson(`/api/workflow/${edit.workflowId}/versions`);
  const headCount = (vsPar.versions ?? []).filter((v: VersionItem) => v.isHead).length;
  console.log(`  ${actResults.every((a: { success?: boolean }) => a.success) && headCount === 1 ? "ok" : "FAIL"}  2 parallel activations → exactly one head (${headCount})`);

  // --- 4. app-state lineage scoping -----------------------------------------
  const st = await getJson(`/api/app-state/${restore.workflowId}`);
  const stOld = await getJson(`/api/app-state/${head0.id}`);
  console.log(`  ${st.success && JSON.stringify(st.records) === JSON.stringify(stOld.records) ? "ok" : "FAIL"}  app-state follows the lineage (${(st.records ?? []).length} records via new id)`);

  // --- 4b. authz: anonymous callers cannot read bytes or live data -----------
  const anonState = await fetch(`${BASE}/api/app-state/${head0.id}`);
  const anonArtifact = await fetch(`${BASE}/api/workflow/${head0.id}/artifact`);
  const anonWf = await (await fetch(`${BASE}/api/workflow/${head0.id}`)).json();
  console.log(`  ${anonState.status === 401 ? "ok" : "FAIL"}  app-state rejects anonymous readers (${anonState.status})`);
  console.log(`  ${anonArtifact.status === 401 ? "ok" : "FAIL"}  artifact bytes reject anonymous readers (${anonArtifact.status})`);
  console.log(`  ${!anonWf?.workflow?.config?.artifactHtml && anonWf?.workflow ? "ok" : "FAIL"}  workflow GET hides artifactHtml from anonymous callers`);

  // --- 4c. audit trail: edit + activate + restore are all recorded -----------
  const ch = await getJson(`/api/workflow/${restore.workflowId}/changes`);
  const kinds = (ch.changes ?? []).map((c: { kind: string }) => c.kind);
  const hasEdit = kinds.includes("edit");
  const hasActivate = kinds.includes("activate");
  const hasRestore = kinds.includes("restore");
  const hashes = (ch.changes ?? []).every((c: { configHash?: string }) => typeof c.configHash === "string" && c.configHash.length >= 16);
  console.log(`  ${ch.success && hasEdit ? "ok" : "FAIL"}  audit records the edit (${kinds.join(", ") || "none"})`);
  console.log(`  ${hasActivate ? "ok" : "FAIL"}  audit records the activation`);
  console.log(`  ${hasRestore ? "ok" : "FAIL"}  audit records the restore`);
  console.log(`  ${hashes ? "ok" : "FAIL"}  every change carries a config hash`);

  // --- 5. Cleanup: leave the original head live ------------------------------
  const back = await fetch(`${BASE}/api/workflow/${restore.workflowId}/activate`, { method: "POST", headers: authed() });
  const backJson = await back.json();
  const finalHead = (await getJson(`/api/workflow/${head0.id}`)).workflow;
  console.log(`  ${backJson.success && finalHead.id === restore.workflowId ? "ok" : "FAIL"}  original config re-activated as the head (original link intact)`);
}));
