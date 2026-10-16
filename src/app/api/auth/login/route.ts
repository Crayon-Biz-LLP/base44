import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createOwnerSession } from "@/lib/auth/auth";

export async function POST(req: Request) {
  try {
    const { accessCode } = await req.json();
    if (!accessCode) {
      return NextResponse.json({ error: "Access code is required" }, { status: 400 });
    }

    const matchedTenants = await db.select().from(tenants).where(eq(tenants.accessCode, accessCode)).limit(1);
    
    if (matchedTenants.length === 0) {
      return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
    }

    await createOwnerSession(matchedTenants[0].id);

    return NextResponse.json({ success: true, tenantId: matchedTenants[0].id });
  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
