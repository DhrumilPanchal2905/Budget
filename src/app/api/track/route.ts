import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { route, parseBody, ok } from "@/lib/api";
import { User, Visit } from "@/lib/models";
import { resolveSession } from "@/lib/auth";
import { SECURE_COOKIES, SESSION_COOKIE } from "@/lib/env";
import { geoFromHeaders, parseUA } from "@/lib/geo";
import { publish } from "@/lib/realtime";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const schema = z.object({
  path: z.string().trim().max(300).regex(/^\//, "Invalid path."),
  referrer: z.string().trim().max(300).optional().default(""),
});

const VID = "bp_vid";
let lastPublish = 0;

/**
 * Page-view beacon → admin "Visitors". Location is approximate and comes from the hosting edge's IP lookup
 * (no third-party tracker, no browser permission). Repeated views of the same page within 10 minutes count once.
 */
export const POST = route({ auth: false }, async ({ req, ip }) => {
  await rateLimit(`track:${ip}`, 240, 60 * 60);
  const { path, referrer } = await parseBody(req, schema);
  const ua = req.headers.get("user-agent") || "";
  const dev = parseUA(ua);
  if (dev.device === "bot") return ok({ tracked: false });

  let vid = req.cookies.get(VID)?.value;
  const isNew = !vid || !/^[A-Za-z0-9_-]{16,40}$/.test(vid);
  if (isNew) vid = randomBytes(12).toString("base64url");

  const state = await resolveSession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  const geo = geoFromHeaders(req.headers);
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const dup = !isNew && (await Visit.exists({ visitorId: vid, path, createdAt: { $gte: since } }));
  if (!dup) {
    let ref = "";
    try {
      const u = referrer ? new URL(referrer) : null;
      ref = u && u.host !== req.nextUrl.host ? `${u.host}${u.pathname}`.slice(0, 300) : "";
    } catch {
      /* invalid referrer */
    }
    await Visit.create({ visitorId: vid, userId: state?.user._id, path, referrer: ref, ip, ...geo, ...dev });
    if (Date.now() - lastPublish > 4000) {
      lastPublish = Date.now();
      await publish(["admin"], "visitor:new", { path, city: geo.city ?? null, country: geo.country ?? null });
    }
  }
  if (state && (!state.user.lastSeenAt || Date.now() - new Date(state.user.lastSeenAt).getTime() > 10 * 60 * 1000)) {
    await User.updateOne({ _id: state.user._id }, { $set: { lastSeenAt: new Date(), ...(geo.country ? { lastLocation: { country: geo.country, region: geo.region, city: geo.city } } : {}) } });
  }

  const res = NextResponse.json({ success: true, data: { tracked: !dup } }, { headers: { "Cache-Control": "no-store" } });
  if (isNew) res.cookies.set({ name: VID, value: vid!, httpOnly: true, secure: SECURE_COOKIES, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
});
