import { route, ok } from "@/lib/api";
import { pushEnabled, sendPushToUsers } from "@/lib/push";
import { Errors } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export const POST = route({ perms: ["notifications.read"] }, async ({ user }) => {
  if (!pushEnabled()) throw Errors.badRequest("Push notifications are not configured on this server.");
  await rateLimit(`push-test:user:${user._id}`, 5, 60 * 10);
  await sendPushToUsers([String(user._id)], { title: "Budget Pro", body: "Push notifications are working on this device ✅", url: "/settings" });
  return ok({}, "Test notification sent.");
});
