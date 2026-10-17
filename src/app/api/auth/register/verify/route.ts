import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api";
import { registerVerifySchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { User } from "@/lib/models";
import { createSession, publicUser, setSessionCookie } from "@/lib/auth";
import { DEFAULT_ADMIN_PERMISSIONS, DEFAULT_USER_PERMISSIONS, effectivePermissions } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { ApiError, Errors } from "@/lib/errors";
import { verifyOtp } from "@/lib/otp";
import { adminEmails } from "@/lib/signup";
import { publish } from "@/lib/realtime";
import { createHash, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

/** Step 2 of sign-up: the correct code creates the (verified) account and signs the user in. */
export const POST = route({ auth: false }, async ({ req, ip }) => {
  await rateLimit(`register-verify:ip:${ip}`, 30, 15 * 60);
  const { email, otp } = await parseBody(req, registerVerifySchema);
  await rateLimit(`register-verify:email:${email}`, 10, 60 * 60);
  const nonce = req.cookies.get("bp_signup")?.value || "";
  const payload = await verifyOtp(email, "signup", otp, (p) => {
    const want = Buffer.from(String(p.nonceHash ?? ""), "hex");
    const got = createHash("sha256").update(nonce).digest();
    return want.length === got.length && timingSafeEqual(want, got);
  });
  const name = String(payload.name ?? "");
  const passwordHash = String(payload.passwordHash ?? "");
  if (!name || !passwordHash) throw new ApiError(400, "Please start the sign-up again.");
  if (await User.exists({ email })) throw Errors.conflict("An account with this email already exists.");

  const role = adminEmails().includes(email) ? "admin" : "user";
  const user = await User.create({
    name,
    email,
    passwordHash,
    role,
    permissions: role === "admin" ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_USER_PERMISSIONS,
    plan: role === "admin" ? "unlimited" : "free",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
  });

  const token = await createSession(String(user._id), ip, req.headers.get("user-agent") || "", { remember: true, method: "register", headers: req.headers });
  await audit({ actor: user, action: "auth.register", resource: "user", resourceId: String(user._id), targetUserId: String(user._id), metadata: { role, emailVerified: true }, ip });
  await publish(["admin"], "admin:activity", { action: "auth.register" });
  await notifyUser(String(user._id), {
    type: "system",
    title: "Welcome to Budget Pro 👋",
    message: "Your email is verified. Start by adding your salary and a few expenses — your dashboard and Angel AI suggestions update in realtime.",
    link: "/income",
    push: false,
  });

  const lean = user.toObject();
  delete (lean as { passwordHash?: string }).passwordHash;
  const res = NextResponse.json({ success: true, message: "Email verified — account created.", data: { user: publicUser(lean, effectivePermissions(lean.role, lean.permissions)) } }, { status: 201 });
  setSessionCookie(res, token, true);
  res.cookies.set({ name: "bp_signup", value: "", path: "/api/auth/register", maxAge: 0 });
  return res;
});
