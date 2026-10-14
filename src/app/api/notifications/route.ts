import { route, ok } from "@/lib/api";
import { Notification } from "@/lib/models";
import { notificationListQuery } from "@/lib/validation";
import { serializeNotification } from "@/lib/notify";
import { publish, userChannel } from "@/lib/realtime";

export const runtime = "nodejs";

// Every query is scoped to the session user → users only ever see their own notifications.

export const GET = route({ perms: ["notifications.read"] }, async ({ req, user }) => {
  const q = notificationListQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
  const filter: Record<string, unknown> = { userId: user._id };
  if (q.unread === "1") filter.read = false;
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: user._id, read: false }),
  ]);
  return ok({ items: items.map(serializeNotification), total, unread, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)) });
});

/** Mark all as read. */
export const PATCH = route({ perms: ["notifications.manage"] }, async ({ user }) => {
  const r = await Notification.updateMany({ userId: user._id, read: false }, { $set: { read: true } });
  await publish([userChannel(String(user._id))], "notification:new", { id: "sync", silent: true });
  return ok({ updated: r.modifiedCount }, "All notifications marked as read.");
});

/** Delete all. */
export const DELETE = route({ perms: ["notifications.manage"] }, async ({ user }) => {
  const r = await Notification.deleteMany({ userId: user._id });
  await publish([userChannel(String(user._id))], "notification:new", { id: "sync", silent: true });
  return ok({ deleted: r.deletedCount }, "All notifications deleted.");
});
