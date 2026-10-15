// Audit trail (A7). Every lifecycle mutation on a console lineage — edit,
// chat revision, restore, activate — writes one workflow_changes row. The
// helper NEVER throws into the calling write path: an audit failure is logged
// and swallowed, because losing an audit line must not lose an owner's edit.
// Doubles as the future learning signal (patch + configHash per change).
import { createHash } from "node:crypto";
import { db } from "@/db";
import { workflowChanges } from "@/db/schema";

export type ChangeKind = "edit" | "chat" | "restore" | "activate" | "rebuild";

/** Stable hash of a config payload (sorted keys) for no-op/lineage tracking. */
export function configHashOf(config: unknown): string {
  return createHash("sha256").update(stableStringify(config)).digest("hex").slice(0, 24);
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export async function recordWorkflowChange(opts: {
  tenantId: string;
  lineageId: string;
  fromVersion?: number | null;
  toVersion?: number | null;
  fromWorkflowId?: string | null;
  toWorkflowId?: string | null;
  kind: ChangeKind;
  actor?: string;
  summary?: string | null;
  patch?: unknown;
  configHash?: string | null;
  requestId?: string | null;
}): Promise<void> {
  try {
    await db.insert(workflowChanges).values({
      tenantId: opts.tenantId,
      lineageId: opts.lineageId,
      fromVersion: opts.fromVersion ?? null,
      toVersion: opts.toVersion ?? null,
      fromWorkflowId: opts.fromWorkflowId ?? null,
      toWorkflowId: opts.toWorkflowId ?? null,
      kind: opts.kind,
      actor: opts.actor ?? "owner",
      summary: opts.summary ?? null,
      patch: (opts.patch ?? null) as typeof workflowChanges.$inferInsert.patch,
      configHash: opts.configHash ?? null,
      requestId: opts.requestId ?? null,
    });
  } catch (e) {
    console.error("[audit] failed to record workflow change (non-fatal):", e instanceof Error ? e.message : e);
  }
}
