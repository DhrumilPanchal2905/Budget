import { NextResponse, type NextRequest } from "next/server";

// Edge middleware: lightweight gatekeeping only (no DB access here).
// Real authentication/authorization happens in every API route on the server.

const SECURE = (process.env.APP_URL || "").startsWith("https://") || process.env.VERCEL === "1";
const SESSION_COOKIE = SECURE ? "__Host-bp_session" : "bp_session";

const APP_PREFIXES = ["/dashboard", "/income", "/expenses", "/debts", "/goals", "/analytics", "/insights", "/notifications", "/settings", "/plan", "/admin"];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function allowedOrigins(req: NextRequest): Set<string> {
  const set = new Set<string>([req.nextUrl.origin]);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (appUrl) set.add(appUrl);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || (SECURE ? "https" : "http");
  if (host) set.add(`${proto}://${host}`);
  return set;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---- CSRF protection for the API: mutating requests must come from our own origin ----
  if (pathname.startsWith("/api/") && MUTATING.has(req.method) && !pathname.startsWith("/api/cron/")) {
    const origin = req.headers.get("origin");
    const site = req.headers.get("sec-fetch-site");
    if (origin) {
      if (!allowedOrigins(req).has(origin)) {
        return NextResponse.json({ success: false, message: "Cross-site request blocked." }, { status: 403 });
      }
    } else if (site && site !== "same-origin" && site !== "none") {
      return NextResponse.json({ success: false, message: "Cross-site request blocked." }, { status: 403 });
    }
    return NextResponse.next();
  }

  // ---- Private pages: redirect to login when there is no session cookie; never index ----
  if (APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!req.cookies.get(SESSION_COOKIE)?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  // Logged-in users visiting auth pages go to the dashboard.
  if ((pathname === "/login" || pathname === "/register") && req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|robots.txt|sitemap.xml|manifest.webmanifest).*)"],
};
