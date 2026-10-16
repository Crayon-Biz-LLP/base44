// App-tier session helpers. The gate page is public (name tiles need the
// roster before anyone signs in), but the artifact BYTES and the live state
// feed are not: they require a verified session for the workflow's tenant.
//
// Two session shapes — BOTH HMAC-signed under the server secret:
// - owner: opsdesk_tenant_id holding v1.<tenantId>.<hmac> (dashboard session)
// - staff: opsdesk_staff_<tenantId> holding v1.<name>.<hmac>
//
// An unsigned scribbled value (raw tenant id, plaintext name) no longer
// authenticates.
//
// Remaining known hardening (deliberately not here): access codes are stored
// in plaintext, and there is no rate-limit on PIN attempts.
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "opsdesk-dev-secret";
export const OWNER_COOKIE_NAME = "opsdesk_tenant_id";

let warnedDevSecret = false;

function secret(): string {
  const fromEnv = process.env.APP_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET is not set — refusing to sign or verify sessions in production.");
  }
  if (!warnedDevSecret) {
    warnedDevSecret = true;
    console.warn("[app-auth] APP_SECRET not set — using the insecure dev secret (development only).");
  }
  return DEV_SECRET;
}

export function staffCookieName(tenantId: string): string {
  return `opsdesk_staff_${tenantId}`;
}

function hmac(tenantId: string, name: string): string {
  return createHmac("sha256", secret()).update(`${tenantId}.${name}`).digest("hex");
}

function verifySigned(value: string, name: string): string | null {
  const m = value.match(/^v1\.(.+)\.([0-9a-f]{64})$/);
  if (!m) return null;
  const [, tenantId, sig] = m;
  const expected = hmac(tenantId, name);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return tenantId;
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

export function signOwnerValue(tenantId: string): string {
  return `v1.${tenantId}.${hmac(tenantId, "__owner__")}`;
}

export function verifyOwnerValue(value: string): string | null {
  return verifySigned(value, "__owner__");
}

/**
 * Verified session for an app-tier workflow's tenant, or null.
 * Owner: signed tenant cookie. Staff: signed cookie whose embedded name is
 * returned (the consoles scope by it).
 */
export async function getAppAccess(tenantId: string): Promise<{ role: "owner" | "staff"; name: string } | null> {
  const jar = await cookies();
  const ownerRaw = jar.get(OWNER_COOKIE_NAME)?.value;
  if (ownerRaw && verifyOwnerValue(ownerRaw) === tenantId) {
    return { role: "owner", name: "__owner__" };
  }
  const staffRaw = jar.get(staffCookieName(tenantId))?.value;
  if (staffRaw) {
    const name = verifyStaffValue(tenantId, staffRaw);
    if (name) return { role: "staff", name };
  }
  return null;
}
