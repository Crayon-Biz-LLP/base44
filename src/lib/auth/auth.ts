import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signOwnerValue, verifyOwnerValue, OWNER_COOKIE_NAME } from "./app-auth";

// Returns tenant ID if logged in, otherwise undefined. The cookie is an
// HMAC-signed value (v1.<tenantId>.<hmac>); a forged/unsigned cookie fails
// verification and is treated as logged out.
export async function getSessionTenantId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(OWNER_COOKIE_NAME)?.value;
  if (!raw) return undefined;

  const tenantId = verifyOwnerValue(raw);
  if (!tenantId) return undefined;

  // Verify tenant exists
  const res = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (res.length === 0) return undefined;
  return tenantId;
}

export async function createOwnerSession(tenantId: string) {
  const cookieStore = await cookies();
  cookieStore.set(OWNER_COOKIE_NAME, signOwnerValue(tenantId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 // 7 days
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(OWNER_COOKIE_NAME);
}

// Single owner guard for route handlers: either the verified tenant id, or the
// 401 response to return. Collapses the hand-rolled `getSessionTenantId() + if
// (!tenantId) return 401` block that was duplicated across every dashboard API.
export type OwnerGuard = { ok: true; tenantId: string } | { ok: false; response: NextResponse };

export async function requireOwnerTenant(): Promise<OwnerGuard> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 }) };
  }
  return { ok: true, tenantId };
}
