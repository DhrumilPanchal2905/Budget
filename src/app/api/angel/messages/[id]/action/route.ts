import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { AngelConversation, AngelMessage, isObjectId, oid } from "@/lib/models";
import { rateLimit } from "@/lib/ratelimit";
import { Errors } from "@/lib/errors";
import { actionView, cancelText, claimAction, runConfirmed, undoAction, undoText, type StoredAction } from "@/lib/angel/engine";
import { assertAngel, messageDTO } from "@/lib/angel/server";
import type { Lang } from "@/lib/angel/parse";
import type { Card } from "@/lib/angel/types";
import { forSpeech } from "@/lib/angel/i18n";

export const runtime = "nodejs";

const schema = z.object({ decision: z.enum(["confirm", "cancel", "undo"]) });
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Buttons under an Angel message: Confirm / Cancel a pending action, or Undo a finished one. */
export const POST = route({}, async ({ req, params, user, perms, ip }) => {
  assertAngel(user);
  await rateLimit(`angel-action:${String(user._id)}`, 20, 60);
  const { decision } = await parseBody(req, schema);
  if (!isObjectId(params.id)) throw Errors.notFound("Message");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found: any = await AngelMessage.findOne({ _id: oid(params.id), userId: user._id, role: "angel" }).lean();
  if (!found?.action) throw Errors.notFound("Action");
  const lang = (found.lang as Lang) || "en";
  const cur = user.currency || "INR";
  if (decision === "undo" && Date.now() - new Date(found.createdAt).getTime() > UNDO_WINDOW_MS) throw Errors.badRequest("Undo is available for 24 hours after an action.");

  // Atomically claim the action so it can only ever run (or be undone) once.
  const [from, to] = decision === "undo" ? ["done", "undoing"] : ["pending", decision === "confirm" ? "running" : "cancelled"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg: any = await claimAction(params.id, user._id, from, to);
  if (!msg) throw Errors.conflict(decision === "undo" ? "This action was already undone or cannot be undone." : "This action was already handled.");
  const action = msg.action as StoredAction;

  let text: string;
  let next: StoredAction;
  let ephemeral: Card[] | undefined;
  if (decision === "confirm") {
    const r = await runConfirmed({ ...action, status: "pending" }, user, ip, perms, lang, cur);
    next = r.action;
    text = r.reply.text;
    ephemeral = r.reply.ephemeral;
  } else if (decision === "cancel") {
    next = { ...action, status: "cancelled", needsConfirm: false };
    text = cancelText(lang);
  } else if (!action.canUndo) {
    next = { ...action, status: "done" };
    text = undoText(lang, false);
  } else {
    try {
      await undoAction(action, user, ip, perms);
      next = { ...action, status: "undone", canUndo: false };
      text = undoText(lang, true, action.summary);
    } catch (err) {
      next = { ...action, status: "done" }; // give the Undo button back
      text = undoText(lang, false, undefined, err);
    }
  }

  msg.action = next;
  msg.markModified("action");
  await msg.save();

  // A decided action is no longer "pending" in the chat's memory.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conv: any = await AngelConversation.findOne({ _id: msg.conversationId, userId: user._id });
  const reply = await AngelMessage.create({ conversationId: msg.conversationId, userId: user._id, role: "angel", text, lang, source: "system" });
  if (conv) {
    if (conv.context?.pending?.messageId === String(msg._id)) {
      conv.context = { ...conv.context, pending: null };
      conv.markModified("context");
    }
    conv.messageCount = (conv.messageCount ?? 0) + 1;
    conv.lastMessageAt = new Date();
    conv.preview = text.slice(0, 160);
    await conv.save();
  }

  return ok({ updated: { id: String(msg._id), action: actionView(next) }, message: messageDTO(reply, ephemeral), speak: forSpeech(text), lang });
});
