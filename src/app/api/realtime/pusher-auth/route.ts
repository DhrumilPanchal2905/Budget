import { route, fail } from "@/lib/api";
import { NextResponse } from "next/server";
import { getPusher, toPusherChannel, userChannel } from "@/lib/realtime";

export const runtime = "nodejs";

/** Authorises Pusher private channels: a user may only join their OWN channel (admins also "admin"). */
export const POST = route({}, async ({ req, user, perms }) => {
  const pusher = getPusher();
  if (!pusher) return fail(404, "Realtime provider not configured.");
  const form = new URLSearchParams(await req.text());
  const socketId = form.get("socket_id") || "";
  const channel = form.get("channel_name") || "";
  if (!/^\d+\.\d+$/.test(socketId)) return fail(400, "Invalid socket.");

  const allowed = new Set([toPusherChannel(userChannel(String(user._id)))]);
  if (user.role === "admin" && (perms.includes("audit.view") || perms.includes("users.view"))) allowed.add(toPusherChannel("admin"));
  if (!allowed.has(channel)) return fail(403, "You do not have permission to perform this action.");

  return NextResponse.json(pusher.authorizeChannel(socketId, channel));
});
