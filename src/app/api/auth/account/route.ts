import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api";
import { deleteAccountSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { User } from "@/lib/models";
import { clearSessionCookie, verifyPassword } from "@/lib/auth";
import { deleteUserCompletely, assertNotLastAdmin } from "@/lib/users";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";

/** Permanently delete the signed-in user's account and ALL related data. */
export const DELETE = route({}, async ({ req, user, ip }) => {
  await rateLimit(`account-delete:user:${user._id}`, 5, 60 * 60);
  const { password } = await parseBody(req, deleteAccountSchema);
  const full = await User.findById(user._id).select("+passwordHash");
  if (!full || !(await verifyPassword(full.passwordHash, password))) {
    throw new ApiError(400, "Password is incorrect.", { password: "Password is incorrect." });
  }
  await assertNotLastAdmin(user, "delete");
  await deleteUserCompletely(user._id);
  await audit({ actor: null, action: "auth.account_delete", resource: "user", resourceId: String(user._id), metadata: { self: true }, ip });

  const res = NextResponse.json({ success: true, message: "Your account and all data were deleted." });
  clearSessionCookie(res);
  return res;
});
