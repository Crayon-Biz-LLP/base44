import { NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOwnerTenant } from "@/lib/infra/auth";

export async function GET() {
  try {
    const guard = await requireOwnerTenant();
    if (!guard.ok) return guard.response;
    const tenantId = guard.tenantId;

    const tenantWorkflows = await db.select().from(workflows)
      .where(and(eq(workflows.tenantId, tenantId), eq(workflows.isActive, true)))
      .orderBy(desc(workflows.createdAt));

    const result = tenantWorkflows.map(w => ({
      id: w.id,
      title: (w.config as Record<string, unknown> | null)?.title || "Untitled",
      version: w.schemaVersion,
      isActive: w.isActive,
      primitiveType: w.primitiveType
    }));

    return NextResponse.json({ workflows: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
