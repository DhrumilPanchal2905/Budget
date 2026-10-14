import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { clearSessionCookie, destroySession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/env";

export const runtime = "nodejs";

async function logout(req: NextRequest) {
  try {
    await connectDB();
    await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  } catch (err) {
    console.error("[logout]", (err as Error).message);
  }
}

/** POST — normal sign-out from the app. Invalidates the server-side session. */
export async function POST(req: NextRequest) {
  await logout(req);
  const res = NextResponse.json({ success: true, message: "Signed out successfully." });
  clearSessionCookie(res);
  return res;
}

/** GET — used when a stale/expired cookie is detected: clear it and go to /login. */
export async function GET(req: NextRequest) {
  await logout(req);
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = req.nextUrl.searchParams.get("reason") === "expired" ? "?expired=1" : "";
  const res = NextResponse.redirect(url);
  clearSessionCookie(res);
  return res;
}
