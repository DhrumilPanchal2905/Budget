import { route, ok } from "@/lib/api";
import { Notification, isObjectId } from "@/lib/models";
import { Errors } from "@/lib/errors";
import { publish, userChannel } from "@/lib/realtime";

export const runtime = "nodejs";

export const PATCH = route({ perms: ["notifications.manage"] }, async ({ user, params }) => {
  if (!isObjectId(params.id)) throw Errors.notFound("Notification");
  const r = await Notification.updateOne({ _id: params.id, userId: user._id }, { $set: { read: true } });
  if (!r.matchedCount) throw Errors.notFound("Notification");
  await publish([userChannel(String(user._id))], "notification:new", { id: "sync", silent: true });
  return ok({ id: params.id }, "Notification marked as read.");
});

export const DELETE = route({ perms: ["notifications.manage"] }, async ({ user, params }) => {
  if (!isObjectId(params.id)) throw Errors.notFound("Notification");
  const r = await Notification.deleteOne({ _id: params.id, userId: user._id });
  if (!r.deletedCount) throw Errors.notFound("Notification");
  await publish([userChannel(String(user._id))], "notification:new", { id: "sync", silent: true });
  return ok({ id: params.id }, "Notification deleted.");
});
