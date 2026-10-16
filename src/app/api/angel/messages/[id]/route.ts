import { route, ok } from "@/lib/api";
import { AngelConversation, AngelMessage, isObjectId, oid } from "@/lib/models";
import { Errors } from "@/lib/errors";
import { assertAngel } from "@/lib/angel/server";

export const runtime = "nodejs";

/** Delete a single message from a chat (only the text history — finance records are not touched). */
export const DELETE = route({}, async ({ params, user }) => {
  assertAngel(user);
  if (!isObjectId(params.id)) throw Errors.notFound("Message");
  const msg = await AngelMessage.findOneAndDelete({ _id: oid(params.id), userId: user._id }).lean<{ conversationId: unknown } | null>();
  if (!msg) throw Errors.notFound("Message");
  const left = await AngelMessage.countDocuments({ conversationId: msg.conversationId, userId: user._id });
  if (left === 0) await AngelConversation.deleteOne({ _id: msg.conversationId, userId: user._id });
  else {
    await AngelConversation.updateOne({ _id: msg.conversationId, userId: user._id }, { $set: { messageCount: left } });
    // a deleted question can no longer be answered with "haan"
    await AngelConversation.updateOne({ _id: msg.conversationId, userId: user._id, "context.pending.messageId": params.id }, { $set: { "context.pending": null } });
  }
  return ok({ id: params.id, conversationDeleted: left === 0 }, "Message deleted.");
});
