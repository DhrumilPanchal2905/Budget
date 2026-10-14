import { route, ok } from "@/lib/api";
import { Passkey, isObjectId } from "@/lib/models";
import { audit } from "@/lib/audit";
import { Errors } from "@/lib/errors";

export const runtime = "nodejs";

/** Remove a device's auto login. Scoped to the signed-in user (cannot touch other users' devices). */
export const DELETE = route({}, async ({ user, params, ip }) => {
  if (!isObjectId(params.id)) throw Errors.notFound("Device");
  const pk = await Passkey.findOneAndDelete({ _id: params.id, userId: user._id }).lean<{ deviceName?: string } | null>();
  if (!pk) throw Errors.notFound("Device");
  await audit({ actor: user, action: "auth.passkey_remove", resource: "passkey", resourceId: String(params.id), targetUserId: String(user._id), metadata: { device: pk.deviceName }, ip });
  return ok({ id: params.id }, "Device removed. Auto login is disabled on it.");
});
