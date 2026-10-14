import { route, ok, parseBody } from "@/lib/api";
import { broadcastSchema } from "@/lib/validation";
import { broadcast, notifyUser } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { User, isObjectId } from "@/lib/models";
import { Errors } from "@/lib/errors";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = broadcastSchema.extend({ userId: z.string().optional() });

/** Broadcast to an audience, or send to one user (userId). */
export const POST = route({ admin: true, perms: ["admin.notifications.send"] }, async ({ req, user, ip }) => {
  await rateLimit(`broadcast:user:${user._id}`, 20, 60 * 60);
  const data = await parseBody(req, schema);

  if (data.userId) {
    if (!isObjectId(data.userId) || !(await User.exists({ _id: data.userId }))) throw Errors.notFound("User");
    await notifyUser(data.userId, { type: "admin", title: data.title, message: data.message, push: data.push });
    await audit({ actor: user, action: "admin.notification.send", resource: "notification", targetUserId: data.userId, metadata: { title: data.title }, ip });
    return ok({ recipients: 1 }, "Notification sent.");
  }

  const filter: Record<string, unknown> =
    data.audience === "all" ? {} : data.audience === "admins" ? { role: "admin" } : { plan: data.audience };
  const recipients = await broadcast(filter, { type: "system", title: data.title, message: data.message, push: data.push });
  await audit({ actor: user, action: "admin.notification.broadcast", resource: "notification", metadata: { title: data.title, audience: data.audience, recipients }, ip });
  return ok({ recipients }, `Broadcast sent to ${recipients} user${recipients === 1 ? "" : "s"}.`);
});
