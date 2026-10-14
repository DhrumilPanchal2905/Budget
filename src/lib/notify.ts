import { after } from "next/server";
import { Notification, User } from "./models";
import { publish, userChannel } from "./realtime";
import { sendPushToUsers } from "./push";

export type NotificationType = "finance" | "admin" | "goal" | "debt" | "insight" | "system";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  push?: boolean;
}

/** Run work after the response is sent (Vercel waitUntil). Falls back to fire-and-forget. */
export function runAfter(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task().catch((e) => console.error("[after] task failed", e));
  }
}

// Accepts lean results / hydrated docs from the loosely typed Model<any> (their lean type is an
// index-signature object, which is not assignable to a fixed-shape parameter).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeNotification(raw: any) {
  const n = raw as { _id: unknown; type: string; title: string; message: string; link?: string; read: boolean; createdAt: Date };
  return {
    id: String(n._id),
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link ?? null,
    read: n.read,
    createdAt: n.createdAt,
  };
}

/** Create an in-app notification, stream it in realtime, and (optionally) send a web push. */
export async function notifyUser(userId: string, input: NotifyInput) {
  const doc = await Notification.create({
    userId,
    type: input.type,
    title: input.title.slice(0, 140),
    message: input.message.slice(0, 1000),
    link: input.link,
  });
  await publish([userChannel(userId)], "notification:new", serializeNotification(doc));
  if (input.push !== false) {
    runAfter(() => sendPushToUsers([userId], { title: input.title, body: input.message, url: input.link || "/notifications" }));
  }
  return doc;
}

/** Broadcast to many users (batched inserts). */
export async function broadcast(
  filter: Record<string, unknown>,
  input: NotifyInput,
): Promise<number> {
  const users = await User.find({ status: "active", ...filter }).select("_id").lean<{ _id: unknown }[]>();
  const ids = users.map((u) => String(u._id));
  const now = new Date();
  for (let i = 0; i < ids.length; i += 1000) {
    await Notification.insertMany(
      ids.slice(i, i + 1000).map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
        createdAt: now,
      })),
      { ordered: false },
    );
  }
  // One realtime event per recipient channel (bounded batches) so only targeted users refresh.
  for (let i = 0; i < ids.length; i += 500) {
    await publish(
      ids.slice(i, i + 500).map(userChannel),
      "notification:new",
      { id: "broadcast", type: input.type, title: input.title, message: input.message, link: input.link ?? null, read: false, createdAt: now },
    );
  }
  if (input.push !== false) runAfter(() => sendPushToUsers(ids, { title: input.title, body: input.message, url: input.link || "/notifications" }));
  return ids.length;
}
