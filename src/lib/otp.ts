// One-time email codes for sign-up verification and password reset.
// 6 digits, valid 10 minutes, max 5 wrong attempts, resend after 60 s, max 5 emails per hour per address.
// Only an HMAC of the code is stored, so a database leak does not reveal valid codes.
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { EmailOtp } from "./models";
import { ApiError } from "./errors";
import { otpEmail, sendMail } from "./mailer";

const TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

type Purpose = "signup" | "reset";

function hashCode(email: string, purpose: Purpose, code: string): string {
  const secret = process.env.PAYLOAD_SECRET || process.env.CRON_SECRET || process.env.MONGODB_URI || "budget-pro-local-dev-secret";
  return createHmac("sha256", `otp|${secret}`).update(`${purpose}|${email}|${code}`).digest("hex");
}

/** Creates (or refreshes) a code and emails it. Returns seconds until a resend is allowed. */
export async function issueOtp(email: string, purpose: Purpose, opts: { name?: string; payload?: Record<string, unknown>; resend?: boolean } = {}): Promise<{ resendIn: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing: any = await EmailOtp.findOne({ email, purpose }).lean();
  const now = Date.now();
  if (existing && now - new Date(existing.lastSentAt).getTime() < RESEND_MS) {
    const wait = Math.ceil((RESEND_MS - (now - new Date(existing.lastSentAt).getTime())) / 1000);
    if (opts.resend) throw new ApiError(429, `Please wait ${wait} seconds before requesting a new code.`);
    // a fresh request (e.g. the form was submitted again) keeps the code that was just sent
    if (opts.payload) await EmailOtp.updateOne({ _id: existing._id }, { $set: { payload: opts.payload } });
    return { resendIn: wait };
  }
  const withinHour = existing && now - new Date(existing.lastSentAt).getTime() < 60 * 60 * 1000;
  const sendCount = withinHour ? (existing.sendCount ?? 1) + 1 : 1;
  if (sendCount > MAX_SENDS_PER_HOUR) throw new ApiError(429, "Too many codes requested. Please try again in an hour.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const mail = otpEmail(code, purpose, opts.name);
  await sendMail(email, mail.subject, mail.html, mail.text); // throws if email is not configured → nothing saved
  await EmailOtp.updateOne(
    { email, purpose },
    {
      $set: { codeHash: hashCode(email, purpose, code), attempts: 0, sendCount, lastSentAt: new Date(now), expiresAt: new Date(now + TTL_MS), ...(opts.payload ? { payload: opts.payload } : {}) },
    },
    { upsert: true },
  );
  return { resendIn: RESEND_MS / 1000 };
}

/**
 * Checks a code. The attempt counter is incremented ATOMICALLY before comparing, so parallel guesses can't exceed
 * the limit. `check` adds an extra condition on the stored payload (e.g. same-browser nonce for sign-ups).
 * On success the code is consumed and its payload returned.
 */
export async function verifyOtp(email: string, purpose: Purpose, code: string, check?: (payload: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = await EmailOtp.findOneAndUpdate({ email, purpose, expiresAt: { $gt: now }, attempts: { $lt: MAX_ATTEMPTS } }, { $inc: { attempts: 1 } }, { new: true }).lean();
  if (!doc) {
    const exists = await EmailOtp.exists({ email, purpose, expiresAt: { $gt: now } });
    if (exists) throw new ApiError(429, "Too many wrong attempts. Please request a new code.", { otp: "Too many attempts." });
    throw new ApiError(400, "This code has expired. Please request a new one.", { otp: "Code expired." });
  }
  const want = Buffer.from(doc.codeHash, "hex");
  const got = Buffer.from(hashCode(email, purpose, code.trim()), "hex");
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    const left = MAX_ATTEMPTS - doc.attempts;
    throw new ApiError(400, left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong attempts. Please request a new code.", { otp: "Incorrect code." });
  }
  const payload = (doc.payload ?? {}) as Record<string, unknown>;
  if (check && !check(payload)) throw new ApiError(400, "Please finish signing up in the same browser where you started (or start again here).", { otp: "Start again in this browser." });
  // consume exactly once (a parallel correct request loses the race)
  const del = await EmailOtp.deleteOne({ _id: doc._id, codeHash: doc.codeHash });
  if (!del.deletedCount) throw new ApiError(400, "This code was already used. Please request a new one.", { otp: "Code used." });
  return payload;
}
