import { route, ok, parseBody } from "@/lib/api";
import { PushSubscription } from "@/lib/models";
import { pushSubscribeSchema } from "@/lib/validation";
import { pushEnabled } from "@/lib/push";
import { Errors } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";

export const runtime = "nodejs";

/** Register this browser's push subscription for the SIGNED-IN user (userId never comes from the client). */
export const POST = route({ perms: ["notifications.read"] }, async ({ req, user }) => {
  if (!pushEnabled()) throw Errors.badRequest("Push notifications are not configured on this server.");
  await rateLimit(`push-sub:user:${user._id}`, 20, 60 * 60);
  const sub = await parseBody(req, pushSubscribeSchema);
  // An endpoint belongs to one browser; re-binding it to the current user is correct when accounts switch.
  await PushSubscription.findOneAndUpdate(
    { endpoint: sub.endpoint },
    { $set: { userId: user._id, keys: sub.keys, userAgent: (req.headers.get("user-agent") || "").slice(0, 300) }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  const count = await PushSubscription.countDocuments({ userId: user._id });
  if (count > 10) {
    const old = await PushSubscription.find({ userId: user._id }).sort({ createdAt: 1 }).limit(count - 10).select("_id").lean();
    await PushSubscription.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  }
  return ok({}, "Push notifications enabled on this device.");
});

/** Remove a subscription — only if it belongs to the signed-in user. */
export const DELETE = route({}, async ({ req, user }) => {
  const { endpoint } = await parseBody(req, z.object({ endpoint: z.string().url().max(1000) }));
  await PushSubscription.deleteOne({ endpoint, userId: user._id });
  return ok({}, "Push notifications disabled on this device.");
});
