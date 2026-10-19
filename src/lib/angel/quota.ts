// Angel AI usage limits. Every plan gets Angel; limited plans get N credits per window (e.g. 20 credits every
// 5 hours). The window starts with your first message and refills when it ends — "chat a bit, take a break,
// chat again". Simple questions cost 1 credit; long questions, web look-ups and actions cost more, so heavy use
// ends the window sooner. Unlimited (and admins) never hit a limit.
import { createHash } from "crypto";
import { AngelUsage } from "../models";
import { ApiError } from "../errors";
import { ANGEL_COST, GUEST_ANGEL, planForUser, type AngelQuota, type PlanHolder } from "../plans";

export interface QuotaState {
  /** null = unlimited */
  limit: number | null;
  used: number;
  remaining: number | null;
  /** when the credits refill (ISO), null when no window is running */
  resetAt: string | null;
  windowHours: number;
}

const H = 3600_000;

export class QuotaExceeded extends ApiError {
  constructor(
    public state: QuotaState,
    public guest: boolean,
  ) {
    super(429, quotaMessage(state, guest), { quota: "angel", resetAt: state.resetAt ?? "", limit: String(state.limit ?? ""), guest: guest ? "1" : "" });
  }
}

export function waitLabel(resetAt: string | null, now = Date.now()): string {
  if (!resetAt) return "a little while";
  const mins = Math.max(1, Math.ceil((new Date(resetAt).getTime() - now) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function quotaMessage(state: QuotaState, guest: boolean): string {
  const wait = waitLabel(state.resetAt);
  return guest
    ? `You've used Angel's free guest chats for now. They refill in ${wait} — or create a free account for more (and answers from your own budget).`
    : `You've used your Angel credits for now. They refill in ${wait}. Upgrade your plan for more — Unlimited has no limit.`;
}

/** Message cost before the answer (the base) — extras (web, action) are added after the answer. */
export function baseCost(text: string): number {
  return ANGEL_COST.message + (text.trim().length > 280 ? ANGEL_COST.longMessage : 0);
}

const hash = (s: string) => createHash("sha256").update(`bp-guest|${s}`).digest("base64url").slice(0, 32);

export function guestDeviceKey(deviceId: string) {
  return `g:${hash(deviceId)}`;
}
export function userKey(userId: unknown) {
  return `u:${String(userId)}`;
}

function toState(doc: { used?: number; resetAt?: Date } | null, q: AngelQuota, now: number): QuotaState {
  if (q.credits === null) return { limit: null, used: 0, remaining: null, resetAt: null, windowHours: q.windowHours };
  const active = doc?.resetAt && new Date(doc.resetAt).getTime() > now;
  const used = active ? Math.max(0, doc?.used ?? 0) : 0;
  return { limit: q.credits, used, remaining: Math.max(0, q.credits - used), resetAt: active ? new Date(doc!.resetAt!).toISOString() : null, windowHours: q.windowHours };
}

export async function readQuota(key: string, q: AngelQuota): Promise<QuotaState> {
  if (q.credits === null) return toState(null, q, Date.now());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = await AngelUsage.findOne({ key }).select("used resetAt").lean();
  return toState(doc, q, Date.now());
}

/**
 * Atomically takes `cost` credits from the window (starting a new window when the old one ended).
 * Throws QuotaExceeded when there aren't enough credits left. Safe under parallel requests.
 */
export async function consume(key: string, q: AngelQuota, cost: number, guest = false): Promise<QuotaState> {
  if (q.credits === null) return toState(null, q, Date.now());
  const now = new Date();
  const limit = q.credits;
  // 1) running window with enough credits left
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any = await AngelUsage.findOneAndUpdate({ key, resetAt: { $gt: now }, used: { $lte: limit - cost } }, { $inc: { used: cost } }, { new: true }).lean();
  if (doc) return toState(doc, q, now.getTime());
  // 2) no window (or it ended) → start a new one
  const resetAt = new Date(now.getTime() + q.windowHours * H);
  try {
    doc = await AngelUsage.findOneAndUpdate(
      { key, $or: [{ resetAt: { $lte: now } }, { resetAt: { $exists: false } }, { resetAt: null }] },
      { $set: { used: cost, windowStart: now, resetAt, expiresAt: new Date(resetAt.getTime() + 24 * H) } },
      { new: true, upsert: true },
    ).lean();
    if (doc) return toState(doc, q, now.getTime());
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    // a window is running (another request created it, or it is used up) → fall through
  }
  // 3) a window is running but used up → maybe a parallel request just started it; retry step 1 once
  doc = await AngelUsage.findOneAndUpdate({ key, resetAt: { $gt: now }, used: { $lte: limit - cost } }, { $inc: { used: cost } }, { new: true }).lean();
  if (doc) return toState(doc, q, now.getTime());
  const cur = await readQuota(key, q);
  throw new QuotaExceeded(cur, guest);
}

/** Extra cost after the answer (web look-up, action). Never blocks the answer that was already given. */
export async function charge(key: string, q: AngelQuota, extra: number): Promise<QuotaState> {
  if (q.credits === null || extra <= 0) return readQuota(key, q);
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = await AngelUsage.findOneAndUpdate({ key, resetAt: { $gt: now } }, { $inc: { used: extra } }, { new: true }).lean();
  return toState(doc, q, now.getTime());
}

export function quotaForUser(user: PlanHolder): AngelQuota {
  return planForUser(user).angel;
}

/** Gives credits back (e.g. the IP pool when the device itself was out). */
export async function refund(key: string, amount: number) {
  if (amount <= 0) return;
  await AngelUsage.updateOne({ key, resetAt: { $gt: new Date() }, used: { $gte: amount } }, { $inc: { used: -amount } });
}

/**
 * Guests: the device limit (cookie), plus a looser per-IP pool (5×, shared by everyone behind that IP) so clearing
 * cookies doesn't reset it. Without a device cookie the IP gets the plain guest limit.
 */
export async function consumeGuest(deviceId: string | null, ip: string, cost: number): Promise<{ state: QuotaState; keys: string[] }> {
  const ipHash = hash(ip);
  if (!deviceId) {
    const key = `gn:${ipHash}`;
    return { state: await consume(key, GUEST_ANGEL, cost, true), keys: [key] };
  }
  const ipKey = `gi:${ipHash}`;
  const devKey = guestDeviceKey(deviceId);
  const ipQuota: AngelQuota = { credits: (GUEST_ANGEL.credits ?? 0) * 5, windowHours: GUEST_ANGEL.windowHours };
  await consume(ipKey, ipQuota, cost, true);
  try {
    return { state: await consume(devKey, GUEST_ANGEL, cost, true), keys: [devKey, ipKey] };
  } catch (e) {
    await refund(ipKey, cost).catch(() => null);
    throw e;
  }
}

/** Extra guest cost after the answer (web look-up). */
export async function chargeGuest(keys: string[], extra: number): Promise<QuotaState> {
  const [first, ...rest] = keys;
  const ipQuota: AngelQuota = { credits: (GUEST_ANGEL.credits ?? 0) * 5, windowHours: GUEST_ANGEL.windowHours };
  await Promise.all(rest.map((k) => charge(k, ipQuota, extra)));
  return charge(first, GUEST_ANGEL, extra);
}
