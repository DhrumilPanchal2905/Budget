// Angel AI — server helpers shared by the /api/angel/* routes.
import { AngelConversation, AngelMessage, isObjectId, oid, type UserDoc } from "../models";
import { planForUser } from "../plans";
import { ApiError, Errors } from "../errors";
import type { QuotaState } from "./quota";
import { actionView, claimAction, undoAction, undoText, type StoredAction } from "./engine";
import type { Lang } from "./parse";
import type { AngelMessageDTO, AngelQuotaDTO, Card, ConversationDTO } from "./types";
import type { Permission } from "../permissions";

/**
 * Angel is part of EVERY plan (limited plans have credits per window — see quota.ts).
 * `ANGEL_ENABLED=false` switches it off instantly for everyone.
 */
export function angelEnabledFor(_user?: Pick<UserDoc, "plan" | "role">): boolean {
  return process.env.ANGEL_ENABLED !== "false";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function assertAngel(_user?: UserDoc) {
  if (process.env.ANGEL_ENABLED === "false") throw new ApiError(503, "Angel AI is turned off right now.");
}

/** Quota state for the browser. */
export function quotaDTO(state: QuotaState, user: Parameters<typeof planForUser>[0] | null): AngelQuotaDTO {
  return { ...state, plan: user ? planForUser(user).id : "guest" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function messageDTO(doc: any, ephemeral?: Card[]): AngelMessageDTO {
  const cards = [...((doc.cards as Card[] | undefined) ?? []), ...(ephemeral ?? [])];
  return {
    id: String(doc._id),
    role: doc.role,
    text: doc.text,
    lang: (doc.lang as Lang) || "en",
    source: doc.source || "text",
    cards: cards.length ? cards : undefined,
    action: actionView(doc.action as StoredAction | undefined),
    suggestions: doc.suggestions?.length ? doc.suggestions : undefined,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function conversationDTO(c: any): ConversationDTO {
  return { id: String(c._id), title: c.title, lastMessageAt: new Date(c.lastMessageAt ?? c.updatedAt).toISOString(), messageCount: c.messageCount ?? 0, preview: c.preview ?? "" };
}

export async function ownConversation(userId: unknown, id: unknown) {
  if (!isObjectId(id)) throw Errors.notFound("Chat");
  const conv = await AngelConversation.findOne({ _id: oid(id), userId });
  if (!conv) throw Errors.notFound("Chat");
  return conv;
}

/** Undo the most recent undoable Angel action (this chat first, then anything in the last 24h). */
export async function undoLatest(user: UserDoc, ip: string, perms: Permission[], conversationId: unknown, lang: Lang): Promise<{ text: string; messageId: string | null; action: StoredAction | null }> {
  // Only actions from the last 24 hours can be undone (same rule as the Undo button).
  const base = { userId: user._id, role: "angel", "action.status": "done", "action.canUndo": true, createdAt: { $gte: new Date(Date.now() - 86400000) } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cand: any = await AngelMessage.findOne({ ...base, conversationId }).sort({ createdAt: -1 }).select("_id").lean();
  if (!cand) cand = await AngelMessage.findOne(base).sort({ createdAt: -1 }).select("_id").lean();
  if (!cand) return { text: undoText(lang, false), messageId: null, action: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg: any = await claimAction(String(cand._id), user._id, "done", "undoing");
  if (!msg) return { text: undoText(lang, false), messageId: null, action: null };
  const action = msg.action as StoredAction;
  try {
    await undoAction({ ...action, status: "done" }, user, ip, perms);
  } catch (err) {
    msg.action = { ...action, status: "done" };
    msg.markModified("action");
    await msg.save();
    return { text: undoText(lang, false, undefined, err), messageId: null, action: null };
  }
  const updated: StoredAction = { ...action, status: "undone", canUndo: false };
  msg.action = updated;
  msg.markModified("action");
  await msg.save();
  return { text: undoText(lang, true, action.summary), messageId: String(msg._id), action: updated };
}
