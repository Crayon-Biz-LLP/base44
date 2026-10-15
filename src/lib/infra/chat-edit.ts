// Chat edits — the owner types changes in plain language; ONE structured call
// merges them into the existing archetypeConfig. The model never writes code
// and never sees HTML: it emits a bounded noun-patch (same doctrine as
// extraction — nouns only, platform reassembles). Merge output is re-validated
// by the archetype's Zod schema BEFORE anything is saved, and a malformed
// merge fails closed (no silent partial saves).
import { generateWithRepair } from "./repair";
import { z } from "zod";
import { ASSEMBLERS } from "./assemble-registry";
import type { ArchetypeId } from "./archetypes";

// Bounded patch vocabulary — every op the owner can ask in words maps to one
// of these. Scalars maxed so a runaway merge can't flood a config.
const MergeSchema = z.object({
  op: z.enum(["set", "add", "remove"]),
  path: z.string().describe("Dot path into the config, e.g. 'productName', 'accentHex', 'staff', 'people', 'counters', 'items.2.owner'"),
  value: z.unknown().nullable().optional(), // primitives, row objects, or full replacement lists — final config schema catches garbage
}).superRefine((v, ctx) => {
  if (v.op === "set" && v.value === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "set requires value" });
  if (v.op === "add" && v.value === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "add requires value" });
  if (v.op === "remove" && v.value !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "remove takes no value" });
});

export const ChatEditSchema = z.object({
  summary: z.string().describe("One short sentence confirming what was changed"),
  patches: z.array(MergeSchema).max(20),
});

export type ChatEdit = z.infer<typeof ChatEditSchema>;

/** Resolve a dot path against an object; returns null when it doesn't exist. */
function resolvePath(obj: unknown, path: string): { parent: Record<string, unknown> | null; key: string; isIndex: boolean } {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return { parent: null, key: "", isIndex: false };
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur === null || typeof cur !== "object") return { parent: null, key: "", isIndex: false };
    const k = parts[i];
    cur = (cur as Record<string, unknown>)[k] ?? (Array.isArray(cur) ? (cur as unknown[])[parseInt(k, 10)] : undefined);
    if (cur === undefined) return { parent: null, key: "", isIndex: false };
  }
  if (cur === null || typeof cur !== "object") return { parent: null, key: "", isIndex: false };
  const last = parts[parts.length - 1];
  const isIndex = /^\d+$/.test(last);
  return { parent: cur as Record<string, unknown>, key: last, isIndex };
}

/** Apply patches with strict path checks; unknown paths fail the merge. */
export function applyChatEdit(base: Record<string, unknown>, edit: ChatEdit): Record<string, unknown> {
  const next = structuredClone(base);
  for (const p of edit.patches) {
    const { parent, key, isIndex } = resolvePath(next, p.path);
    if (!parent) throw new Error(`Merge rejected: unknown path "${p.path}"`);
    if (p.op === "set") {
      if (isIndex && Array.isArray(parent)) parent[parseInt(key, 10)] = p.value;
      else if (!isIndex && !Array.isArray(parent)) {
        if (!(key in parent)) throw new Error(`Merge rejected: unknown path "${p.path}"`); // never invent keys
        parent[key] = p.value;
      } else throw new Error(`Merge rejected: bad target "${p.path}"`);
    } else if (p.op === "add") {
      if (isIndex) throw new Error(`Merge rejected: "add" needs a list path, got index "${p.path}"`);
      const list = parent[key];
      if (!Array.isArray(list)) throw new Error(`Merge rejected: "${p.path}" is not a list`);
      list.push(p.value);
    } else if (p.op === "remove") {
      if (Array.isArray(parent) && isIndex) {
        const i = parseInt(key, 10);
        if (i >= parent.length) throw new Error(`Merge rejected: index out of range "${p.path}"`);
        parent.splice(i, 1);
      } else if (!Array.isArray(parent)) {
        if (!(key in parent)) throw new Error(`Merge rejected: no key "${key}"`);
        delete parent[key];
      } else throw new Error(`Merge rejected: bad remove target "${p.path}"`);
    }
  }
  return next;
}

/** One structured merge call: owner's words → bounded patches. */
export async function mergeChatEdit(opts: { archetype: ArchetypeId; userPrompt: string; config: Record<string, unknown> }): Promise<ChatEdit> {
  const shape = ASSEMBLERS[opts.archetype].schema;
  const keys = Object.keys((shape as unknown as { shape: Record<string, unknown> }).shape);
  return generateWithRepair<ChatEdit>({
    prompt: `The owner of a running "${opts.archetype}" operations console asked for changes in plain language.

OWNER: "${opts.userPrompt}"

CURRENT CONFIG KEYS: ${keys.join(", ")}
REPRESENTATIVE VALUES: ${JSON.stringify(
      Object.fromEntries(keys.slice(0, 12).map(k => [k, Array.isArray(opts.config[k]) ? `[${(opts.config[k] as unknown[]).length} items]` : typeof opts.config[k] === "object" && opts.config[k] ? "[object]" : String(opts.config[k]).slice(0, 60)])),
    )}

Turn the request into a minimal patch list. Rules:
- set: change an existing scalar OR replace a whole list value (value = the new full list when path is a list name like 'people').
- add: append to an existing list (value = the new element, shaped like the others — look at REPRESENTATIVE VALUES).
- remove: delete a list element by index path ('staff.2') or a key.
- NEVER invent new top-level keys. NEVER touch artifactHtml, title, or schema. NEVER emit code, HTML, or scripts.
- Renames of people/stages/counters: use set with the full replacement list.
- If the request is not a config change (e.g. a question), return patches: [] and say so in summary.`,
  }, ChatEditSchema, 5);
}
