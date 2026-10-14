import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { resolveSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/env";
import { RealtimeEvent } from "@/lib/models";
import { userChannel } from "@/lib/realtime";

// Server-Sent Events stream — Vercel-compatible realtime without a persistent Socket.IO server.
// Each connection lives up to ~55s, then the browser's EventSource reconnects automatically and
// resumes from Last-Event-ID, so no events are lost between connections.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POLL_MS = 1500;
const LIFETIME_MS = 55_000;

export async function GET(req: NextRequest) {
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
      send(`event: ready\ndata: ${JSON.stringify({ channels: channels.length })}\n\n`);

      const deadline = Date.now() + LIFETIME_MS;
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
            send(`id: ${ms}-${id}\nevent: ${e.event}\ndata: ${JSON.stringify(e.payload ?? {})}\n\n`);
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
