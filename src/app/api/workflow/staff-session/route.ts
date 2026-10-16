import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { signStaffValue, staffCookieName } from "@/lib/auth/app-auth";

export async function POST(req: Request) {
  try {
    const { pin, staffName, tenantId, role } = await req.json();
    if (!pin || !staffName || !tenantId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const matchedTenants = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    
    if (matchedTenants.length === 0) {
      return NextResponse.json({ error: "Invalid store" }, { status: 404 });
    }

    const t = matchedTenants[0];
    // Two-PIN design: the OWNER validates against the store's accessCode,
    // STAFF against staffPin (falling back to accessCode when unset — the
    // common one-shared-PIN case). Without the role branch, an owner PIN can
    // never pass on tenants where staffPin is set.
    const expectedPin = role === "owner"
      ? (t.accessCode || t.staffPin)
      : (t.staffPin || t.accessCode);

    if (pin !== expectedPin) {
      return NextResponse.json({ error: "Invalid store PIN" }, { status: 401 });
    }

    // Signed value: a scribbled plaintext name no longer authenticates; the
    // HMAC binds the name to this tenant under the server secret.
    const cookieStore = await cookies();
    cookieStore.set(staffCookieName(tenantId), signStaffValue(tenantId, staffName), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Staff session Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
