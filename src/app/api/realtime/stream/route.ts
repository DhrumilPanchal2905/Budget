import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { resolveSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/env";
import { RealtimeEvent } from "@/lib/models";
import { userChannel } from "@/lib/realtime";
import { keyFor, seal } from "@/lib/secure-channel";

// Server-Sent Events stream — Vercel-compatible realtime without a persistent Socket.IO server.
// Each connection lives up to ~55s, then the browser's EventSource reconnects automatically and
// resumes from Last-Event-ID, so no events are lost between connections.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POLL_MS = 1500;
// Must end well before maxDuration (60 s) — counted from the START of the request (cold start + DB connect
// included), otherwise Vercel kills it with "Task timed out after 60 seconds".
const LIFETIME_MS = 45_000;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  await connectDB();
  const state = await resolveSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!state) return new Response("Unauthorized", { status: 401 });

  const userId = String(state.user._id);
  const channels = [userChannel(userId)];
  if (state.user.role === "admin" && (state.perms.includes("audit.view") || state.perms.includes("users.view"))) channels.push("admin");

  // Resume point: "<epochMs>-<eventId>" from Last-Event-ID, else "now".
  const last = req.headers.get("last-event-id") || req.nextUrl.searchParams.get("lastEventId");
  const lastMs = last ? Number(last.split("-")[0]) : NaN;
  let since = Number.isFinite(lastMs) && Date.now() - lastMs < 120_000 ? lastMs : Date.now();

  // Encrypted channel: EventSource cannot send headers, so the tab's PUBLIC key comes in the URL (?k=).
  const key = keyFor(req.nextUrl.searchParams.get("k"));
  const data = (v: unknown) => (key ? seal(key, JSON.stringify(v ?? {})) : JSON.stringify(v ?? {}));
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  let closed = false;
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      send(`retry: 1500\n\n`);
      send(`event: ready\ndata: ${data({ channels: channels.length })}\n\n`);

      const deadline = startedAt + LIFETIME_MS;
      let lastPing = Date.now();
      while (!closed && Date.now() < deadline) {
        try {
          const events = await RealtimeEvent.find({ channel: { $in: channels }, createdAt: { $gt: new Date(since - 3000) } })
            .sort({ createdAt: 1 })
            .limit(200)
            .lean<{ _id: unknown; event: string; payload: unknown; createdAt: Date }[]>();
          for (const e of events) {
            const id = String(e._id);
            if (seen.has(id)) continue;
            seen.add(id);
            const ms = new Date(e.createdAt).getTime();
            if (ms > since) since = ms;
            send(`id: ${ms}-${id}\nevent: ${e.event}\ndata: ${data(e.payload)}\n\n`);
          }
        } catch (err) {
          console.error("[sse] poll failed", (err as Error).message);
        }
        if (Date.now() - lastPing > 15_000) {
          send(`: ping\n\n`);
          lastPing = Date.now();
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}