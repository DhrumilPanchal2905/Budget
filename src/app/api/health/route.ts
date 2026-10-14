import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const m = await connectDB();
    await m.connection.db?.admin().ping();
    return NextResponse.json({ success: true, status: "ok", db: "up" });
  } catch {
    return NextResponse.json({ success: false, status: "degraded", db: "down" }, { status: 503 });
  }
}
