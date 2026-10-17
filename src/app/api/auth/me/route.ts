import { route, ok, parseBody } from "@/lib/api";
import { profileSchema } from "@/lib/validation";
import { User, type UserDoc } from "@/lib/models";
import { publicUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { publish, userChannel } from "@/lib/realtime";
import { Errors } from "@/lib/errors";
import { effectivePermissions } from "@/lib/permissions";

export const runtime = "nodejs";

/** Current user / session. */
export const GET = route({}, async ({ user, perms }) => ok({ user: publicUser(user, perms) }));

/** Update own profile (name, currency, theme, language). Role/plan/permissions can NEVER be changed here. */
export const PATCH = route({ perms: ["settings.write"] }, async ({ req, user, ip }) => {
  const data = await parseBody(req, profileSchema);
  const update: Record<string, string> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.currency !== undefined) update.currency = data.currency;
  if (data.theme !== undefined) update.theme = data.theme;
  if (data.language !== undefined) update.replyLanguage = data.language;
  if (!Object.keys(update).length) throw Errors.badRequest("Nothing to update.");

  const updated = await User.findByIdAndUpdate(user._id, { $set: update }, { new: true }).lean<UserDoc>();
  if (!updated) throw Errors.notFound("User");
  if (update.name || update.currency) {
    await audit({ actor: user, action: "profile.update", resource: "user", resourceId: String(user._id), targetUserId: String(user._id), metadata: { fields: Object.keys(update) }, ip });
  }
  await publish([userChannel(String(user._id))], "profile:changed", {});
  return ok({ user: publicUser(updated, effectivePermissions(updated.role, updated.permissions)) }, "Profile updated successfully.");
});
