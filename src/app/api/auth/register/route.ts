import { NextResponse } from "next/server";
import { route, parseBody, handleError } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { User } from "@/lib/models";
import { createSession, hashPassword, publicUser, setSessionCookie } from "@/lib/auth";
import { DEFAULT_ADMIN_PERMISSIONS, DEFAULT_USER_PERMISSIONS, effectivePermissions } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { Errors } from "@/lib/errors";

export const runtime = "nodejs";

export const POST = route({ auth: false }, async ({ req, ip }) => {
  try {
    await rateLimit(`register:ip:${ip}`, 10, 60 * 60);
    const { name, email, password } = await parseBody(req, registerSchema);

    if (await User.exists({ email })) throw Errors.conflict("An account with this email already exists.");

    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const role = adminEmails.includes(email) ? "admin" : "user";

    const user = await User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      permissions: role === "admin" ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_USER_PERMISSIONS,
      plan: role === "admin" ? "unlimited" : "free",
      lastLoginAt: new Date(),
    });

    const token = await createSession(String(user._id), ip, req.headers.get("user-agent") || "", { remember: true, method: "register" });
    await audit({ actor: user, action: "auth.register", resource: "user", resourceId: String(user._id), targetUserId: String(user._id), metadata: { role }, ip });
    await notifyUser(String(user._id), {
      type: "system",
      title: "Welcome to Budget Pro 👋",
      message: "Start by adding your salary and a few expenses — your dashboard and insights will update in realtime.",
      link: "/income",
      push: false,
    });

    const lean = user.toObject();
    const res = NextResponse.json(
      { success: true, message: "Account created successfully.", data: { user: publicUser(lean, effectivePermissions(lean.role, lean.permissions)) } },
      { status: 201 },
    );
    setSessionCookie(res, token, true);
    return res;
  } catch (err) {
    return handleError(err);
  }
});
