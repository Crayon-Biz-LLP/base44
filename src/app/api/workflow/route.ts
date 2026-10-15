import { NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSessionTenantId } from "@/lib/infra/auth";

export async function GET() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantWorkflows = await db.select().from(workflows)
      .where(and(eq(workflows.tenantId, tenantId), eq(workflows.isActive, true)))
      .orderBy(desc(workflows.createdAt));

    const result = tenantWorkflows.map(w => ({
      id: w.id,
      title: (w.config as any)?.title || "Untitled",
      version: w.schemaVersion,
      isActive: w.isActive,
      primitiveType: w.primitiveType
    }));

    return NextResponse.json({ workflows: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
