import { route, ok } from "@/lib/api";
import { AngelConversation, AngelMessage } from "@/lib/models";
import { assertAngel, conversationDTO } from "@/lib/angel/server";

export const runtime = "nodejs";

/** Chat history list (newest first). */
export const GET = route({}, async ({ req, user }) => {
  assertAngel(user);
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
  const rows = await AngelConversation.find({ userId: user._id }).sort({ lastMessageAt: -1 }).limit(limit).select("title lastMessageAt updatedAt messageCount preview").lean();
  return ok({ items: rows.map(conversationDTO) });
});

/** Delete ALL of the user's Angel chats. */
export const DELETE = route({}, async ({ user }) => {
  assertAngel(user);
  const [c] = await Promise.all([AngelConversation.deleteMany({ userId: user._id }), AngelMessage.deleteMany({ userId: user._id })]);
  return ok({ deleted: c.deletedCount ?? 0 }, "All Angel chats deleted.");
});
