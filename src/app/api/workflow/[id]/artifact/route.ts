// Artifact — GET /api/workflow/[id]/artifact
//
// The console's HTML, gated. GET /api/workflow/[id] serves the gate metadata
// (title, roster for the name tiles) to anonymous callers, but the artifact
// bytes only flow to a verified owner/staff session of the workflow's tenant.
// The app page fetches this AFTER the gate verifies.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAppAccess } from "@/lib/infra/app-auth";
import { resolveServeRow } from "@/lib/infra/lineage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const wf = await resolveServeRow(id);
    if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const session = await getAppAccess(wf.tenantId);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const html = (wf.config as Record<string, unknown>)?.artifactHtml;
    if (typeof html !== "string" || !html) {
      return NextResponse.json({ error: "This workflow has no app. Open it at /submit/" + wf.id }, { status: 404 });
    }
    return NextResponse.json({ success: true, html });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
