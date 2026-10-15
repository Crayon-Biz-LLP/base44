// Archetype-config evolution (A5). The archetype Zod schemas tighten over
// time; without a config version, every stored row becomes simultaneously
// un-editable the moment a schema adds a constraint, and restore fails for
// all versions at once. This module is the anti-bricking layer:
//
//   CURRENT_CONFIG_VERSION — the version NEW writes are stamped with
//   STEPS[v]               — idempotent, per-archetype migrations FROM v TO v+1
//   upgradeConfig()        — walks a stored config forward to current
//
// Doctrine: upgrades are DETERMINISTIC and IDEMPOTENT (running a step on an
// already-upgraded config is a no-op), and they NEVER invent data — they
// backfill declared defaults and rename keys. A step that cannot be computed
// deterministically does not belong here.
import { z } from "zod";
import { ASSEMBLERS, parseConfig } from "../infra/assemble-registry";
import type { ArchetypeId } from "../infra/archetypes";

export const CURRENT_CONFIG_VERSION = 1;

type UpgradeStep = {
  archetypes: ArchetypeId[] | "all";
  describe: string;
  upgrade: (config: Record<string, unknown>) => Record<string, unknown>;
};

const STEPS: Record<number, UpgradeStep[]> = {
  // v1 → v2 example of the shape (kept empty today: v1 is the baseline):
  // 2: [
  //   {
  //     archetypes: "all",
  //     describe: "backfill productName from title",
  //     upgrade: (cfg) => ({ ...cfg, productName: cfg.productName ?? cfg.title ?? "Console" }),
  //   },
  // ],
};

/** The version NEW rows are stamped with. */
export function currentConfigVersion(): number {
  return CURRENT_CONFIG_VERSION;
}

/**
 * Walk a stored config forward through every step to CURRENT_CONFIG_VERSION.
 * Idempotent: a config already at (or past) a step is untouched by it.
 */
export function upgradeConfig(
  archetype: ArchetypeId,
  config: Record<string, unknown>,
  fromVersion: number,
): { config: Record<string, unknown>; version: number; applied: string[] } {
  let cfg = config;
  const applied: string[] = [];
  for (let v = Math.max(1, fromVersion); v < CURRENT_CONFIG_VERSION; v++) {
    for (const step of STEPS[v] ?? []) {
      if (step.archetypes !== "all" && !step.archetypes.includes(archetype)) continue;
      cfg = step.upgrade(cfg);
      applied.push(`v${v}→v${v + 1}: ${step.describe}`);
    }
  }
  return { config: cfg, version: CURRENT_CONFIG_VERSION, applied };
}

/**
 * Cheap structural sanity check used before persisting an upgraded config:
 * the archetype's own Zod schema must still accept it (fail closed — an
 * upgrade that breaks its own schema never reaches the database).
 */
export function upgradedConfigIsValid(archetype: ArchetypeId, config: unknown): boolean {
  const entry = (ASSEMBLERS as Record<string, { schema: z.ZodTypeAny }>)[archetype];
  if (!entry) return false;
  return entry.schema.safeParse(config).success;
}

/**
 * Pre-edit entry point: upgrade a stored config to the current shape, fail
 * closed if the upgrade cannot satisfy the archetype schema, and normalize
 * through the schema once an upgrade ran. When no steps apply, the config is
 * returned untouched (zero behavioral change for current-version rows).
 */
export function upgradeForEdit(
  archetype: ArchetypeId,
  config: Record<string, unknown>,
  fromVersion: number,
): { ok: boolean; config: Record<string, unknown>; applied: string[] } {
  const up = upgradeConfig(archetype, config, fromVersion);
  if (!up.applied.length) return { ok: true, config, applied: [] };
  if (!upgradedConfigIsValid(archetype, up.config)) return { ok: false, config: up.config, applied: up.applied };
  return { ok: true, config: parseConfig(archetype, up.config), applied: up.applied };
}
