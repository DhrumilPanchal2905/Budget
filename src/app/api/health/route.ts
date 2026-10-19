import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health + speed check. Also used by the public pages to warm up the server and database in the background.
 * `dbMs` is one database round trip from this server — if it is above ~20 ms, the database is in a different
 * region than the server (move the Atlas cluster to Mumbai / ap-south-1, or change "regions" in vercel.json).
 */
export async function GET() {
  const t0 = performance.now();
  try {
    const m = await connectDB();
    const t1 = performance.now();
    await m.connection.db?.admin().ping();
    const t2 = performance.now();
    await m.connection.db?.admin().ping();
    const dbMs = Math.round(performance.now() - t2);
    return NextResponse.json(
      { success: true, status: "ok", db: "up", region: process.env.VERCEL_REGION || "local", connectMs: Math.round(t1 - t0), firstPingMs: Math.round(t2 - t1), dbMs },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ success: false, status: "degraded", db: "down" }, { status: 503 });
  }
}
