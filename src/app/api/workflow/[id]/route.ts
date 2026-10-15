import { NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { lazyUpgradeWorkflowConfig } from "@/lib/domain/upgrader";
import { resolveServeRow } from "@/lib/infra/lineage";
import { getAppAccess } from "@/lib/infra/app-auth";
import { upgradeConfig, upgradedConfigIsValid, CURRENT_CONFIG_VERSION } from "@/lib/domain/config-versions";
import { parseConfig } from "@/lib/infra/assemble-registry";
import type { ArchetypeId } from "@/lib/infra/archetypes";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Serve rules: active rows serve themselves; an inactive row that is the
    // newest of its lineage is a draft preview link; older inactive rows
    // forward to the live head (or the newest row if the lineage is headless).
    const targetWorkflow = await resolveServeRow(id);
    if (!targetWorkflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Lazy-upgrade config
    const version = (targetWorkflow.schemaVersion as number) || 1;
    targetWorkflow.config = lazyUpgradeWorkflowConfig(targetWorkflow.config, version);

    // A5: lazy archetype-config upgrade — serve AND persist (fire-and-forget)
    // so stored rows catch up the first time they are read after a step lands.
    // Fail-open on read: if an upgrade can't satisfy the schema we serve the
    // stored bytes rather than 500ing a console that works today.
    const cfg0 = targetWorkflow.config as Record<string, unknown>;
    const arch0 = cfg0?.archetype as ArchetypeId | undefined;
    const cfgVersion0 = (targetWorkflow.configVersion as number) || 1;
    if (arch0 && cfg0?.archetypeConfig && cfgVersion0 < CURRENT_CONFIG_VERSION) {
      const up = upgradeConfig(arch0, cfg0.archetypeConfig as Record<string, unknown>, cfgVersion0);
      if (up.applied.length && upgradedConfigIsValid(arch0, up.config)) {
        const parsed = parseConfig(arch0, up.config);
        targetWorkflow.config = { ...cfg0, archetypeConfig: parsed };
        targetWorkflow.configVersion = CURRENT_CONFIG_VERSION;
        void db
          .update(workflows)
          .set({ config: targetWorkflow.config as typeof workflows.$inferInsert.config, configVersion: CURRENT_CONFIG_VERSION })
          .where(eq(workflows.id, targetWorkflow.id));
      }
    }

    // Gate metadata (title, roster for the name tiles) is public so the
    // sign-in tiles can render; the artifact BYTES are not — the page fetches
    // /api/workflow/[id]/artifact after the gate verifies.
    const session = await getAppAccess(targetWorkflow.tenantId);
    if (!session) {
      const { artifactHtml: _stripped, ...rest } = targetWorkflow.config as Record<string, unknown>;
      targetWorkflow.config = rest as typeof targetWorkflow.config;
    }

    return NextResponse.json({ workflow: targetWorkflow });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
