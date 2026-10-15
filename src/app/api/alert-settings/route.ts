// Alert settings — GET/POST /api/alert-settings (owner session required).
// Where alerts go: alertEmail (Resend) and alertPhone (WhatsApp, E.164 like
// +919812345678). Empty strings clear a channel.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionTenantId } from "@/lib/infra/auth";

export async function GET() {
  const tenantId = await getSessionTenantId();
  if (!tenantId) return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
  const rows = await db.select({ alertEmail: tenants.alertEmail, alertPhone: tenants.alertPhone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  return NextResponse.json({ success: true, ...rows[0] });
}

export async function POST(req: Request) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const email = typeof body.alertEmail === "string" ? body.alertEmail.trim() : "";
    const phone = typeof body.alertPhone === "string" ? body.alertPhone.trim() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "That email doesn't look right" }, { status: 400 });
    }
    if (phone && !/^\+\d{8,15}$/.test(phone)) {
      return NextResponse.json({ error: "Phone must be E.164, e.g. +919812345678" }, { status: 400 });
    }
    await db
      .update(tenants)
      .set({ alertEmail: email || null, alertPhone: phone || null })
      .where(eq(tenants.id, tenantId));
    return NextResponse.json({ success: true, alertEmail: email || null, alertPhone: phone || null });
  } catch (e) {
    console.error("[alert-settings]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
