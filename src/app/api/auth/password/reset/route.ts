import { route, parseBody, ok } from "@/lib/api";
import { resetPasswordSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { Session, User } from "@/lib/models";
import { hashPassword } from "@/lib/auth";
import { verifyOtp } from "@/lib/otp";
import { audit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { publish, userChannel } from "@/lib/realtime";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";

/** Reset password with the emailed code. Signs out every device (a stolen session stops working). */
export const POST = route({ auth: false }, async ({ req, ip }) => {
  await rateLimit(`reset:ip:${ip}`, 20, 15 * 60);
  const { email, otp, newPassword } = await parseBody(req, resetPasswordSchema);
  await rateLimit(`reset:email:${email}`, 10, 60 * 60);
  await verifyOtp(email, "reset", otp);
  const user = await User.findOne({ email });
  if (!user || user.status !== "active") throw new ApiError(400, "This account can't be reset. Please contact support.");
  user.passwordHash = await hashPassword(newPassword);
  user.emailVerified = true;
  await user.save();
  await Session.deleteMany({ userId: user._id });
  await publish([userChannel(String(user._id))], "session:revoked", {});
  await audit({ actor: user, action: "auth.password_reset", resource: "user", resourceId: String(user._id), targetUserId: String(user._id), metadata: { via: "email_otp" }, ip });
  await notifyUser(String(user._id), { type: "system", title: "Password reset", message: "Your password was reset with an email code. If this wasn't you, contact support immediately.", link: "/settings" });
  return ok({ reset: true }, "Password updated. Please sign in with your new password.");
});
