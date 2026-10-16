import { route, ok } from "@/lib/api";
import { AngelConversation, AngelMessage } from "@/lib/models";
import { assertAngel, conversationDTO, messageDTO, ownConversation } from "@/lib/angel/server";

export const runtime = "nodejs";

/** One chat with its messages (oldest first, last 200). */
export const GET = route({}, async ({ params, user }) => {
  assertAngel(user);
  const conv = await ownConversation(user._id, params.id);
  const rows = await AngelMessage.find({ conversationId: conv._id, userId: user._id }).sort({ createdAt: -1 }).limit(200).lean();
  return ok({ conversation: conversationDTO(conv), messages: rows.reverse().map((m: unknown) => messageDTO(m)) });
});

/** Delete one chat and all its messages. */
export const DELETE = route({}, async ({ params, user }) => {
  assertAngel(user);
  const conv = await ownConversation(user._id, params.id);
  await Promise.all([AngelMessage.deleteMany({ conversationId: conv._id, userId: user._id }), AngelConversation.deleteOne({ _id: conv._id })]);
  return ok({ id: String(conv._id) }, "Chat deleted.");
});
