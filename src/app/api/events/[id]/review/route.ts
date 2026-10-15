import { NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionTenantId } from "@/lib/infra/auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tenantId = await getSessionTenantId();
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = body?.action;

  if (action !== "approve" && action !== "flag") {
    return NextResponse.json({ error: "action must be 'approve' or 'flag'" }, { status: 400 });
  }

  const newStatus = action === "approve" ? "confirmed" : "flagged";

  // Tenant-scope the update: only touch events that belong to this owner.
  const updated = await db
    .update(events)
    .set({ status: newStatus })
    .where(and(eq(events.id, id), eq(events.tenantId, tenantId)))
    .returning({ id: events.id, status: events.status, workflowId: events.workflowId });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Fire training signal (fire-and-forget, do not block the response).
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    void fetch(`${origin}/api/process-ledger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        training_signal: true,
        workflowId: updated[0].workflowId,
        eventId: id,
        action,
        corrections: [],
      }),
    }).catch(() => {});
  } catch {
    // best-effort only
  }

  return NextResponse.json({ success: true, event: updated[0] });
}