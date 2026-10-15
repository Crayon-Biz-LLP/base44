// Console router — Phase 0 dispatch. Classify the prompt, then hand it to the
// matching extractor+assembler pair. As archetypes land, they register here.
// Every assembled console passes through withChassis (Section B design layer)
// before leaving the router, so chassis coverage is structural, not opt-in.
import { pickArchetype, type ArchetypeId } from "./archetypes";
import { extractConsoleConfig, assembleConsole } from "./studio-v2";
import { extractTargetBoardConfig, assembleTargetBoard } from "./target-board";
import { extractPipelineConfig, assemblePipeline } from "./pipeline";
import { extractLedgerConfig, assembleLedger } from "./ledger";
import { extractTemporalConfig, assembleTemporal } from "./temporal";
import { extractFleetConfig, assembleFleet } from "./fleet";
import { extractQueueConfig, assembleQueue } from "./queue";
import { extractChecklistConfig, assembleChecklist } from "./checklist";
import { extractRosterConfig, assembleRoster } from "./roster";
import { extractCalendarConfig, assembleCalendar } from "./calendar";
import { withChassis } from "./artifact-design";

export interface GeneratedConsole {
  html: string;
  archetype: ArchetypeId;
  productName: string;
  // The extracted archetype config (nouns the model chose). Persisted on the
  // workflow row so downstream surfaces (digest translators, setup screen,
  // accrual loop) can interpret archived records without re-prompting.
  config: unknown;
}

export async function generateConsoleForPrompt(userPrompt: string): Promise<GeneratedConsole> {
  const hint = pickArchetype(userPrompt);

  if (hint.id === "target-board") {
    const cfg = await extractTargetBoardConfig(userPrompt);
    return { html: withChassis(assembleTargetBoard(cfg), { dark: cfg.dark, accent: cfg.accentHex, archetype: "target-board" }), archetype: "target-board", productName: cfg.productName, config: cfg };
  }

  if (hint.id === "pipeline") {
    const cfg = await extractPipelineConfig(userPrompt);
    return { html: withChassis(assemblePipeline(cfg), { dark: cfg.dark, accent: cfg.accentHex, archetype: "pipeline" }), archetype: "pipeline", productName: cfg.productName, config: cfg };
  }

  if (hint.id === "ledger") {
    const cfg = await extractLedgerConfig(userPrompt);
    return { html: withChassis(assembleLedger(cfg), { dark: cfg.dark, accent: cfg.accentHex, archetype: "ledger" }), archetype: "ledger", productName: cfg.productName, config: cfg };
  }

  if (hint.id === "temporal") {
    const cfg = await extractTemporalConfig(userPrompt);
    return { html: withChassis(assembleTemporal(cfg), { dark: cfg.dark, accent: cfg.accentHex, archetype: "temporal" }), archetype: "temporal", productName: cfg.productName, config: cfg };
  }

  if (hint.id === "fleet") {
    const cfg = await extractFleetConfig(userPrompt);
    return { html: withChassis(assembleFleet(cfg), { dark: cfg.dark, accent: cfg.accentHex, archetype: "fleet" }), archetype: "fleet", productName: cfg.productName, config: cfg };
  }

  if (hint.id === "queue") {
    const cfg = await extractQueueConfig(userPrompt);
    return { html: withChassis(assembleQueue(cfg), { dark: cfg.dark, accent: cfg.accentHex, archetype: "queue" }), archetype: "queue", productName: cfg.productName, config: cfg };
  }

  if (hint.id === "checklist") {
    const cfg = await extractChecklistConfig(userPrompt);
    return { html: withChassis(assembleChecklist(cfg), { dark: cfg.dark, accent: cfg.accentHex, archetype: "checklist" }), archetype: "checklist", productName: cfg.productName, config: cfg };
  }

  if (hint.id === "roster") {
    const cfg = await extractRosterConfig(userPrompt);
    return { html: withChassis(assembleRoster(cfg), { dark: cfg.dark, accent: cfg.accentHex, archetype: "roster" }), archetype: "roster", productName: cfg.productName, config: cfg };
  }

  if (hint.id === "calendar") {
    const cfg = await extractCalendarConfig(userPrompt);
    return { html: withChassis(assembleCalendar(cfg), { dark: cfg.dark, accent: cfg.accentHex, archetype: "calendar" }), archetype: "calendar", productName: cfg.productName, config: cfg };
  }

  // spatial is the default and today's only other registered archetype
  const cfg = await extractConsoleConfig(userPrompt);
  return { html: withChassis(assembleConsole(cfg), { dark: cfg.dark, accent: cfg.accentHex, archetype: "spatial" }), archetype: "spatial", productName: cfg.productName, config: cfg };
}
