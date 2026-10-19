import { randomBytes } from "crypto";
import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { ApiError } from "@/lib/errors";
import { guestRespond } from "@/lib/angel/guest";
import { baseCost, chargeGuest, consumeGuest, guestDeviceKey, readQuota, refund } from "@/lib/angel/quota";
import { quotaDTO } from "@/lib/angel/server";
import { ANGEL_COST, GUEST_ANGEL } from "@/lib/plans";
import { SECURE_COOKIES } from "@/lib/env";

export const runtime = "nodejs";

const COOKIE = "bp_gid";
const bodySchema = z.object({
  message: z.string().trim().min(1, "Say or type something.").max(600, "Message is too long."),
  source: z.enum(["voice", "text"]).default("text"),
  lang: z.enum(["auto", "en", "hi", "gu", "hn"]).default("auto"),
  alts: z.array(z.string().trim().max(600)).max(4).optional(),
});

function deviceId(req: { cookies: { get: (n: string) => { value: string } | undefined } }): string | null {
  const v = req.cookies.get(COOKIE)?.value;
  return v && /^[A-Za-z0-9_-]{16,64}$/.test(v) ? v : null;
}

/**
 * Angel for visitors who are not signed in. No database data is ever read here — only Angel's own knowledge,
 * calculators and web look-ups. Limited per device + per IP (credits refill after the window).
 */
export const POST = route({ auth: false }, async ({ req, ip }) => {
  if (process.env.ANGEL_ENABLED === "false") throw new ApiError(503, "Angel AI is turned off right now.");
  await rateLimit(`angel-guest:${ip}`, 20, 60);
  const body = await parseBody(req, bodySchema);
  let dev = deviceId(req);
  const isNew = !dev;
  if (!dev) dev = randomBytes(18).toString("base64url");
  const { state, keys } = await consumeGuest(dev, ip, baseCost(body.message));
  let r;
  try {
    r = await guestRespond({ text: body.message, langPref: body.lang, alts: body.alts });
  } catch (e) {
    await Promise.all(keys.map((k) => refund(k, baseCost(body.message)))).catch(() => null);
    throw e;
  }
  const finalState = r.web ? await chargeGuest(keys, ANGEL_COST.web) : state;
  const res = ok({ text: r.reply.text, speak: r.reply.speak, lang: r.reply.lang, cards: r.reply.cards ?? [], suggestions: r.reply.suggestions ?? [], quota: quotaDTO(finalState, null) });
  if (isNew) res.cookies.set({ name: COOKIE, value: dev, httpOnly: true, sameSite: "lax", secure: SECURE_COOKIES, path: "/api/angel", maxAge: 60 * 60 * 24 * 365 });
  return res;
});

/** Credits left for this visitor (shown in the guest chat). */
export const GET = route({ auth: false }, async ({ req }) => {
  const dev = deviceId(req);
  const state = dev ? await readQuota(guestDeviceKey(dev), GUEST_ANGEL) : { limit: GUEST_ANGEL.credits, used: 0, remaining: GUEST_ANGEL.credits, resetAt: null, windowHours: GUEST_ANGEL.windowHours };
  return ok({ quota: quotaDTO(state, null) });
});
