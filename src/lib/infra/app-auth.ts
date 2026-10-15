// App-tier session helpers. The gate page is public (name tiles need the
// roster before anyone signs in), but the artifact BYTES and the live state
// feed are not: they require a verified session for the workflow's tenant.
//
// Two session shapes:
// - owner: the existing opsdesk_tenant_id cookie (dashboard session)
// - staff: opsdesk_staff_<tenantId> holding an HMAC-signed value
//   v1.<name>.<hmac> — a scribbled plaintext name no longer authenticates.
//
// Remaining known hardening (deliberately not here): the OWNER cookie is
// still an unsigned tenant id, and access codes are stored in plaintext.
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "opsdesk-dev-secret";

function secret(): string {
  return process.env.APP_SECRET || DEV_SECRET;
}

export function staffCookieName(tenantId: string): string {
  return `opsdesk_staff_${tenantId}`;
}

function hmac(tenantId: string, name: string): string {
  return createHmac("sha256", secret()).update(`${tenantId}.${name}`).digest("hex");
}

export function signStaffValue(tenantId: string, name: string): string {
  return `v1.${name}.${hmac(tenantId, name)}`;
}

export function verifyStaffValue(tenantId: string, value: string): string | null {
  const m = value.match(/^v1\.(.+)\.([0-9a-f]{64})$/);
  if (!m) return null;
  const [, name, sig] = m;
  const expected = hmac(tenantId, name);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return name;
}

/**
 * Verified session for an app-tier workflow's tenant, or null.
 * Owner: valid tenant cookie. Staff: signed cookie whose embedded name is
 * returned (the consoles scope by it).
 */
export async function getAppAccess(tenantId: string): Promise<{ role: "owner" | "staff"; name: string } | null> {
  const jar = await cookies();
  if (jar.get("opsdesk_tenant_id")?.value === tenantId) {
    return { role: "owner", name: "__owner__" };
  }
  const staffRaw = jar.get(staffCookieName(tenantId))?.value;
  if (staffRaw) {
    const name = verifyStaffValue(tenantId, staffRaw);
    if (name) return { role: "staff", name };
  }
  return null;
}
