// Edit pipeline — the deterministic brain-to-bytes path shared by the owner
// editor, chat revisions, and restore. Nouns go in (a structured patch, or an
// LLM-merged noun edit), gate-passing HTML comes out. The model never touches
// code anywhere in here: patch/chat → rename cascades → Zod schema (fail
// closed) → deterministic reassemble → artifact gate → syntax gate.
//
// Pure module (no DB): the routes own loading/saving rows; this owns the
// rules. Both the editor route and the chat route MUST go through here so
// there is one merge behavior and one set of gates.
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import type { ArchetypeId } from "./archetypes";
import { applyCascades, buildConsole } from "./assemble-registry";
import { applyChatEdit, mergeChatEdit } from "./chat-edit";
import { validateArtifact } from "./validate-artifact";

/** Deterministic zero-LLM gates every console change must pass. */
export function gateConsole(html: string): { ok: boolean; error?: string } {
  const v = validateArtifact(html);
  if (!v.ok) {
    return {
      ok: false,
      error: `artifact gate: ${v.errors.map((e) => `[${e.rule}] ${e.detail}`).join("; ").slice(0, 400)}`,
    };
  }
  if (!syntaxGate(html)) return { ok: false, error: "script syntax gate" };
  return { ok: true };
}

/** Extract the console's inline script and let node prove it parses. */
export function syntaxGate(html: string): boolean {
  try {
    const start = html.indexOf("<script>");
    const end = html.lastIndexOf("</script>");
    if (start < 0 || end <= start) return false;
    writeFileSync("/tmp/edit-syntax-check.js", html.slice(start + 8, end));
    execSync("node --check /tmp/edit-syntax-check.js", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export type EditOutcome =
  | { ok: true; changed: true; html: string; config: Record<string, unknown>; summary: string; cascaded: string[] }
  | { ok: true; changed: false; summary: string }
  | { ok: false; status: 400 | 422; error: string };

export async function runConsoleEdit(opts: {
  archetype: ArchetypeId;
  base: Record<string, unknown>;
  patch?: Record<string, unknown> | null;
  chatEdit?: string | null;
}): Promise<EditOutcome> {
  const { archetype, base } = opts;
  let edited: Record<string, unknown>;
  let summary = "Manual edit";

  if (opts.chatEdit && opts.chatEdit.trim()) {
    // One structured merge call: the model proposes nouns, never code.
    const merge = await mergeChatEdit({ archetype, userPrompt: opts.chatEdit.trim(), config: base });
    summary = merge.summary;
    if (!merge.patches.length) return { ok: true, changed: false, summary };
    edited = applyChatEdit(base, merge);
  } else if (opts.patch && typeof opts.patch === "object") {
    edited = structuredClone(base);
    for (const [k, v] of Object.entries(opts.patch)) edited[k] = v;
  } else {
    return { ok: false, status: 400, error: "Nothing to change: send patch or chatEdit" };
  }

  // Rename cascades (server-declared; index-paired old→new).
  const { config: cascaded, cascaded: cascadeLog } = applyCascades(archetype, base, edited);

  // Revalidate + rebuild through the archetype's own Zod schema — fail closed.
  let built: { html: string; parsed: Record<string, unknown> };
  try {
    built = buildConsole(archetype, cascaded);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 400, error: `Edit rejected by schema: ${msg.slice(0, 400)}` };
  }

  // Gates: artifact validator + script syntax (zero LLM).
  const g = gateConsole(built.html);
  if (!g.ok) return { ok: false, status: 422, error: `Edit failed the ${g.error}` };

  // Persist the PARSED config: what is stored is what was gated (defaults
  // included), so future schema tightening can't silently diverge stored
  // rows from their own artifacts.
  return { ok: true, changed: true, html: built.html, config: built.parsed, summary, cascaded: cascadeLog };
}
