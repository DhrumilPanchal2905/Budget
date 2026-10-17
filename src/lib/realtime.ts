import Pusher from "pusher";
import { RealtimeEvent } from "./models";

/**
 * Realtime publishing that works on Vercel (no long-lived Socket.IO server required).
 *
 * 1. Every event is written to the `realtimeevents` collection (auto-expires after 2 min).
 *    /api/realtime/stream streams these to the browser via Server-Sent Events.
 * 2. If Pusher credentials are configured, the event is ALSO pushed over Pusher WebSockets
 *    and the client switches to Pusher automatically.
 *
 * Channels:  user:<userId>  |  admin  |  all
 */
export type RealtimeEventName = "finance:changed" | "notification:new" | "admin:activity" | "session:revoked" | "profile:changed" | "visitor:new";

let pusher: Pusher | null | undefined;

export function pusherEnabled(): boolean {
  return Boolean(
    process.env.PUSHER_APP_ID && process.env.PUSHER_SECRET && process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  );
}

export function getPusher(): Pusher | null {
  if (pusher !== undefined) return pusher;
  pusher = pusherEnabled()
    ? new Pusher({
        appId: process.env.PUSHER_APP_ID!,
        key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
        secret: process.env.PUSHER_SECRET!,
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        useTLS: true,
      })
    : null;
  return pusher;
}

export const userChannel = (userId: string) => `user:${userId}`;

/** Map our logical channel to a Pusher private channel name. */
export function toPusherChannel(channel: string): string {
  return `private-${channel.replace(":", "-")}`;
}

export async function publish(channels: string[], event: RealtimeEventName, payload: Record<string, unknown> = {}) {
  if (!channels.length) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 1000);
  try {
    await RealtimeEvent.insertMany(
      channels.map((channel) => ({ channel, event, payload, createdAt: now, expiresAt })),
      { ordered: false },
    );
  } catch (err) {
    console.error("[realtime] outbox insert failed", (err as Error).message);
  }
  const p = getPusher();
  if (p) {
    try {
      const names = channels.map(toPusherChannel);
      for (let i = 0; i < names.length; i += 100) await p.trigger(names.slice(i, i + 100), event, payload);
    } catch (err) {
      console.error("[realtime] pusher trigger failed", (err as Error).message);
    }
  }
}
