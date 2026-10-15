import { cookies } from "next/headers";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "opsdesk_tenant_id";

// Returns tenant ID if logged in, otherwise undefined
export async function getSessionTenantId() {
  const cookieStore = await cookies();
  const tenantId = cookieStore.get(COOKIE_NAME)?.value;
  if (!tenantId) return undefined;
  
  // Verify tenant exists
  const res = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (res.length === 0) return undefined;
  return tenantId;
}

// In a real app we would sign the cookie with an HMAC, but for a simple demo 
// and internal routing this plaintext cookie is sufficient and keeps things lightweight.
export async function createOwnerSession(tenantId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 // 7 days
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
