import { invalidateUserCache } from "@/lib/auth";
import { route, ok, parseBody } from "@/lib/api";
import { changePasswordSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { Session, User } from "@/lib/models";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";

export const POST = route({}, async ({ req, user, ip, sessionId }) => {
  await rateLimit(`password:user:${user._id}`, 5, 15 * 60);
  const { currentPassword, newPassword } = await parseBody(req, changePasswordSchema);

  const full = await User.findById(user._id).select("+passwordHash");
  if (!full || !(await verifyPassword(full.passwordHash, currentPassword))) {
    throw new ApiError(400, "Current password is incorrect.", { currentPassword: "Current password is incorrect." });
  }
  full.passwordHash = await hashPassword(newPassword);
  await full.save();

  // Sign out every OTHER device.
  await Session.deleteMany({ userId: user._id, _id: { $ne: sessionId } });
  invalidateUserCache(String(user._id));
  await audit({ actor: user, action: "auth.password_change", resource: "user", resourceId: String(user._id), targetUserId: String(user._id), ip });
  await notifyUser(String(user._id), {
    type: "system",
    title: "Password changed",
    message: "Your password was changed and other devices were signed out. If this wasn't you, contact support immediately.",
    link: "/settings",
  });
  return ok({}, "Password changed successfully. Other devices were signed out.");
});
