import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    // Training signal logging
    console.log(`[Training Signal] Fast-added roster entity: ${name}`);

    // In a full implementation, persist this to a tenant_staff table
    return NextResponse.json({ success: true, name });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
