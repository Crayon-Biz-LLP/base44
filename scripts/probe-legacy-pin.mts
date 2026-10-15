// Legacy shared-PIN check: tenants without staffPin must accept the SAME pin
// for both roles (the historical one-shared-PIN behavior).
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const TENANT = process.argv[2] || "";
if (!TENANT) { console.log("usage: tsx scripts/probe-legacy-pin.mts <tenantId>"); process.exit(1); }
const { db } = await import("../src/db/index");
const { tenants } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");
const t = (await db.select().from(tenants).where(eq(tenants.id, TENANT)))[0];
if (!t) { console.log("tenant not found"); process.exit(1); }
const ownerPin = t.accessCode || t.staffPin;
const staffPin = t.staffPin || t.accessCode;
console.log("two-PIN tenant:", ownerPin !== staffPin, "| staffPin set:", !!t.staffPin);
for (const [role, pin] of [["owner", ownerPin], ["staff", staffPin]] as const) {
  const r = await fetch("http://localhost:3000/api/workflow/staff-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, staffName: "__probe__", tenantId: TENANT, role }),
  });
  console.log(`${role} with its own PIN → HTTP ${r.status}`);
}
process.exit(0);
