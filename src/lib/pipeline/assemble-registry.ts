// Assemble registry — the bridge that makes owner editing deterministic.
// The router dispatches prompt → extractor+assembler; this registry maps
// archetype id → { schema, assembler } so a SAVED config can be reassembled
// without the model. Owner edits mutate the config through the schema (types
// enforced), rename-cascade fixes referential strings, then the assembler
// rebuilds byte-clean HTML. Zero LLM in the edit path.
import type { ArchetypeId } from "./archetypes";
import type { z } from "zod";
import { ConsoleConfigSchema, assembleConsole } from "../consoles/studio-v2";
import { TargetBoardSchema, assembleTargetBoard } from "../consoles/target-board";
import { PipelineSchema, assemblePipeline } from "../consoles/pipeline";
import { LedgerSchema, assembleLedger } from "../consoles/ledger";
import { TemporalSchema, assembleTemporal } from "../consoles/temporal";
import { FleetSchema, assembleFleet } from "../consoles/fleet";
import { QueueSchema, assembleQueue } from "../consoles/queue";
import { ChecklistSchema, assembleChecklist } from "../consoles/checklist";
import { RosterSchema, assembleRoster } from "../consoles/roster";
import { CalendarSchema, assembleCalendar } from "../consoles/calendar";
import { withChassis } from "./artifact-design";
import type { ChassisArchetype } from "./artifact-design";

export const ASSEMBLERS = {
  spatial: { schema: ConsoleConfigSchema, assemble: assembleConsole },
  "target-board": { schema: TargetBoardSchema, assemble: assembleTargetBoard },
  pipeline: { schema: PipelineSchema, assemble: assemblePipeline },
  ledger: { schema: LedgerSchema, assemble: assembleLedger },
  temporal: { schema: TemporalSchema, assemble: assembleTemporal },
  fleet: { schema: FleetSchema, assemble: assembleFleet },
  queue: { schema: QueueSchema, assemble: assembleQueue },
  checklist: { schema: ChecklistSchema, assemble: assembleChecklist },
  roster: { schema: RosterSchema, assemble: assembleRoster },
  calendar: { schema: CalendarSchema, assemble: assembleCalendar },
} as const;

type Registry = typeof ASSEMBLERS;
export type ArchetypeOf<A extends keyof Registry> = z.infer<Registry[A]["schema"]>;

const registryEntry = (archetype: ArchetypeId) => {
  const entry = (ASSEMBLERS as Record<string, { schema: z.ZodTypeAny; assemble: (c: never) => string }>)[archetype];
  if (!entry) throw new Error(`No assembler for archetype "${archetype}"`);
  return entry;
};

/** Validate + normalize a config through the archetype's own schema (throws with a readable Zod report). */
export function parseConfig(archetype: ArchetypeId, config: unknown): Record<string, unknown> {
  return registryEntry(archetype).schema.parse(config) as Record<string, unknown>;
}

/**
 * Validate AND build in one pass, returning both: the html (through
 * withChassis) and the PARSED config — routes persist the parsed config so
 * what is stored is byte-equivalent to what was gated (defaults included).
 */
export function buildConsole(archetype: ArchetypeId, config: unknown): { html: string; parsed: Record<string, unknown> } {
  const entry = registryEntry(archetype);
  const parsed = entry.schema.parse(config) as Record<string, unknown>; // throws with a readable Zod report
  const html = withChassis(entry.assemble(parsed as never), {
    dark: parsed.dark as boolean,
    accent: parsed.accentHex as string,
    archetype: archetype as ChassisArchetype,
  });
  return { html, parsed };
}

/** Reassemble a stored config for one archetype through withChassis. */
export function reassemble(archetype: ArchetypeId, config: unknown): string {
  return buildConsole(archetype, config).html;
}

// ---- Rename cascade ---------------------------------------------------------
// Renaming a noun (person/stage/counter/entry-type) must fix EVERY reference,
// or the console renders orphans. Two mechanisms, both driven SERVER-SIDE so
// the client can never rename without the cascade:
//
// 1. LIST_CASCADES — noun lives in its own array (resources[].name); renaming
//    an element cascades into referencing arrays (slots[].resource).
// 2. PAIR_CASCADES — noun is a field on rows (assets[].owner, items[].owner);
//    the editor diffs old vs new by index and every changed value cascades
//    across the same referential field set.
// Matching: exact, then trimmed. Embedded references (card titles) are NOT
// rewritten.
export const LIST_CASCADES: Partial<Record<ArchetypeId, { srcList: string; srcKey: string; refs: { list: string; key: string }[] }[]>> = {
  temporal: [
    { srcList: "resources", srcKey: "name", refs: [{ list: "slots", key: "resource" }] },
  ],
  ledger: [
    { srcList: "entryTypes", srcKey: "label", refs: [{ list: "entries", key: "type" }] },
  ],
  fleet: [
    { srcList: "statuses", srcKey: "label", refs: [{ list: "assets", key: "status" }] },
  ],
  checklist: [
    { srcList: "rounds", srcKey: "name", refs: [{ list: "items", key: "round" }] },
  ],
  pipeline: [
    // ownerStages hold stage labels verbatim; a stage rename must follow.
    // (items.stageIdx is positional, so it is rename-immune by construction.)
    { srcList: "stages", srcKey: "label", refs: [{ list: "ownerStages", key: "label" }] },
  ],
  // queue: no stored references — counters are assigned to tokens by index at
  // assemble time, so a rename propagates on the next reassembly.
};

export const PAIR_CASCADES: Partial<Record<ArchetypeId, { srcList: string; srcKey: string; refs: { list: string; key: string }[] }[]>> = {
  fleet: [
    { srcList: "assets", srcKey: "owner", refs: [{ list: "assets", key: "owner" }] },
  ],
  pipeline: [
    { srcList: "items", srcKey: "owner", refs: [{ list: "items", key: "owner" }] },
  ],
};

function cascadeList(list: unknown, key: string, from: string, to: string): boolean {
  if (!Array.isArray(list)) return false;
  let changed = false;
  for (const row of list) {
    if (row && typeof row === "object") {
      const rec = row as Record<string, unknown>;
      if (typeof rec[key] === "string") {
        const v = rec[key] as string;
        const nv = v === from ? to : v.trim() === from.trim() ? to : v;
        if (nv !== v) { rec[key] = nv; changed = true; }
      }
    }
  }
  return changed;
}

/**
 * Apply rename cascades between the ORIGINAL and EDITED config: for every
 * declared noun source, index-paired changes are cascaded across the edited
 * config's referential fields. Mutates nothing; returns { config, cascaded }.
 */
export function applyCascades(
  archetype: ArchetypeId,
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
): { config: Record<string, unknown>; cascaded: string[] } {
  const next = structuredClone(edited);
  const cascaded: string[] = [];
  const rules = [...(LIST_CASCADES[archetype] ?? []), ...(PAIR_CASCADES[archetype] ?? [])];
  for (const rule of rules) {
    const oldRows = original[rule.srcList];
    const newRows = next[rule.srcList];
    if (!Array.isArray(oldRows) || !Array.isArray(newRows)) continue;
    const n = Math.min(oldRows.length, newRows.length);
    for (let i = 0; i < n; i++) {
      const o = oldRows[i]?.[rule.srcKey];
      const v = newRows[i]?.[rule.srcKey];
      if (typeof o === "string" && typeof v === "string" && o !== v && o.trim() && v.trim()) {
        for (const ref of rule.refs) {
          if (cascadeList(next[ref.list], ref.key, o, v)) cascaded.push(`${ref.list}.${ref.key}: "${o}" → "${v}"`);
        }
      }
    }
  }
  return { config: next, cascaded };
}
