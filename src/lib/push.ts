import webpush from "web-push";
import { PushSubscription } from "./models";

let configured: boolean | undefined;

export function pushEnabled(): boolean {
  if (configured !== undefined) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
    configured = true;
  } catch (err) {
    console.error("[push] invalid VAPID keys", (err as Error).message);
    configured = false;
  }
  return configured;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface SubDoc {
  _id: unknown;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

async function sendToSubs(subs: SubDoc[], payload: PushPayload) {
  const body = JSON.stringify(payload);
  const dead: unknown[] = [];
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 60 * 60 * 24, timeout: 8000 });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s._id);
      }
    }),
  );
  if (dead.length) await PushSubscription.deleteMany({ _id: { $in: dead } });
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!pushEnabled() || !userIds.length) return;
  const subs = await PushSubscription.find({ userId: { $in: userIds } }).select("endpoint keys").lean<SubDoc[]>();
  for (let i = 0; i < subs.length; i += 50) await sendToSubs(subs.slice(i, i + 50), payload);
}
