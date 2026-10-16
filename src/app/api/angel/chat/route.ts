import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { AngelConversation, AngelMessage, isObjectId, oid } from "@/lib/models";
import { rateLimit } from "@/lib/ratelimit";
import { Errors } from "@/lib/errors";
import { respond, actionView, type AngelContext } from "@/lib/angel/engine";
import { assertAngel, messageDTO, undoLatest } from "@/lib/angel/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().trim().min(1, "Say or type something.").max(1000, "Message is too long."),
  conversationId: z.string().max(40).nullable().optional(),
  source: z.enum(["voice", "text"]).default("text"),
  lang: z.enum(["auto", "en", "hi", "gu", "hn"]).default("auto"),
});

/** Send a message to Angel → Angel's answer (and any action it took). Both are saved in the chat history. */
export const POST = route({}, async ({ req, user, perms, ip }) => {
  assertAngel(user);
  await rateLimit(`angel:${String(user._id)}`, 40, 60);
  const body = await parseBody(req, bodySchema);

  let conv = null;
  if (body.conversationId) {
    if (!isObjectId(body.conversationId)) throw Errors.notFound("Chat");
    conv = await AngelConversation.findOne({ _id: oid(body.conversationId), userId: user._id });
    if (!conv) throw Errors.notFound("Chat");
  }
  if (!conv) {
    conv = await AngelConversation.create({ userId: user._id, title: body.message.slice(0, 60), context: {}, lastMessageAt: new Date() });
  }

  const userMsg = await AngelMessage.create({ conversationId: conv._id, userId: user._id, role: "user", text: body.message, source: body.source, lang: "en" });

  const result = await respond({ actor: user, perms, ip, text: body.message, ctx: (conv.context ?? {}) as AngelContext, langPref: body.lang, source: body.source });
  const r = result.reply;
  userMsg.lang = r.lang;
  await userMsg.save();

  let updated: { id: string; action: ReturnType<typeof actionView> } | null = null;
  if (result.undo) {
    const u = await undoLatest(user, ip, perms, conv._id, r.lang);
    r.text = u.text;
    r.speak = u.text.replace(/[↩︎✓]/g, "");
    if (u.messageId) updated = { id: u.messageId, action: actionView(u.action) };
  }

  const angelMsg = await AngelMessage.create({
    conversationId: conv._id,
    userId: user._id,
    role: "angel",
    text: r.text || "…",
    lang: r.lang,
    source: "system",
    cards: r.cards?.length ? r.cards : undefined,
    action: r.action ?? undefined,
    suggestions: r.suggestions?.length ? r.suggestions : undefined,
  });

  const ctx = result.ctx;
  if (r.action?.status === "pending" && ctx.pending) ctx.pending.messageId = String(angelMsg._id);
  if (ctx.pending && !ctx.pending.at) ctx.pending.at = Date.now();
  if (result.updateMessage) {
    const a = result.updateMessage.action;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prev: any = await AngelMessage.findOne({ _id: oid(result.updateMessage.id), userId: user._id });
    if (prev?.action) {
      prev.action = { ...prev.action, status: a.status, needsConfirm: false, canUndo: a.canUndo, undo: a.undo };
      prev.markModified("action");
      await prev.save();
      updated = { id: String(prev._id), action: actionView(prev.action) };
    }
  }

  conv.context = ctx;
  conv.markModified("context");
  conv.lang = r.lang;
  conv.messageCount = (conv.messageCount ?? 0) + 2;
  conv.lastMessageAt = new Date();
  conv.preview = (r.text || "").slice(0, 160);
  await conv.save();

  return ok({
    conversation: { id: String(conv._id), title: conv.title },
    messages: [messageDTO(userMsg), messageDTO(angelMsg, r.ephemeral)],
    updated,
    speak: r.speak,
    lang: r.lang,
  });
});
