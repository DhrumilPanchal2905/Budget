import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { route, parseBody } from "@/lib/api";
import { SECURE_COOKIES } from "@/lib/env";
import { registerSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { User } from "@/lib/models";
import { hashPassword } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { issueOtp } from "@/lib/otp";
import { mailError } from "@/lib/signup";

export const runtime = "nodejs";

const SIGNUP_COOKIE = "bp_signup";

/**
 * Step 1 of sign-up: validate, then email a 6-digit code. The account is created only after the code is
 * verified (POST /api/auth/register/verify) — so every self-registered email address is real and owned.
 * Accounts created by an admin skip this step.
 */
export const POST = route({ auth: false }, async ({ req, ip }) => {
  await rateLimit(`register:ip:${ip}`, 10, 60 * 60);
  const { name, email, password } = await parseBody(req, registerSchema);
  await rateLimit(`register:email:${email}`, 6, 60 * 60);
  if (await User.exists({ email })) throw Errors.conflict("An account with this email already exists.");
  const passwordHash = await hashPassword(password);
  // Binds this sign-up to THIS browser: only the browser holding the nonce cookie can finish it. Without it, someone
  // else could re-submit the form for your email with their password and wait for you to enter your code.
  const nonce = randomBytes(24).toString("base64url");
  const nonceHash = createHash("sha256").update(nonce).digest("hex");
  let resendIn = 60;
  try {
    ({ resendIn } = await issueOtp(email, "signup", { name, payload: { name, passwordHash, nonceHash } }));
  } catch (err) {
    mailError(err);
  }
  const res = NextResponse.json({ success: true, message: `We sent a 6-digit code to ${email}.`, data: { otpRequired: true, email, resendIn } }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set({ name: SIGNUP_COOKIE, value: nonce, httpOnly: true, secure: SECURE_COOKIES, sameSite: "strict", path: "/api/auth/register", maxAge: 60 * 60 });
  return res;
});
