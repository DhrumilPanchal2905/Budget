import { NextResponse } from "next/server";
import { route, parseBody, handleError } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { User } from "@/lib/models";
import { createSession, publicUser, setSessionCookie, verifyPassword } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { ensureBootstrapAdmin, promoteIfBootstrapAdmin } from "@/lib/bootstrap-admin";

export const runtime = "nodejs";

export const POST = route({ auth: false }, async ({ req, ip }) => {
  try {
    await rateLimit(`login:ip:${ip}`, 30, 15 * 60);
    const { email, password } = await parseBody(req, loginSchema);
    await rateLimit(`login:email:${email}`, 8, 15 * 60);

    // First login of an ADMIN_EMAILS address with ADMIN_PASSWORD creates the admin account.
    await ensureBootstrapAdmin(email, password, ip);

    const user = await User.findOne({ email }).select("+passwordHash");
    const valid = await verifyPassword(user?.passwordHash, password);
    if (!user || !valid) throw new ApiError(401, "Invalid email or password.");
    if (user.status !== "active") throw new ApiError(403, "This account has been disabled. Please contact support.");

    await promoteIfBootstrapAdmin(user, ip);
    user.lastLoginAt = new Date();
    await user.save();
    const token = await createSession(String(user._id), ip, req.headers.get("user-agent") || "");
    await audit({ actor: user, action: "auth.login", resource: "user", resourceId: String(user._id), targetUserId: String(user._id), ip });

    const lean = user.toObject();
    delete (lean as { passwordHash?: string }).passwordHash;
    const res = NextResponse.json({
      success: true,
      message: "Signed in successfully.",
      data: { user: publicUser(lean, effectivePermissions(lean.role, lean.permissions)) },
    });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    return handleError(err);
  }
});
