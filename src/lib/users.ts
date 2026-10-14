import type { Types } from "mongoose";
import { AuditLog, Notification, PushSubscription, Session, User, oid, type UserDoc } from "./models";
import { purgeUserFinance } from "./finance";
import { effectivePermissions } from "./permissions";
import { Errors } from "./errors";

/**
 * Data policy on account deletion:
 *  - finance records, notifications, push subscriptions, sessions and the user document are DELETED;
 *  - audit log entries are KEPT for security accountability but anonymised (email removed).
 */
export async function deleteUserCompletely(userId: Types.ObjectId | string) {
  const id = oid(String(userId));
  await purgeUserFinance(id);
  await Promise.all([
    Notification.deleteMany({ userId: id }),
    PushSubscription.deleteMany({ userId: id }),
    Session.deleteMany({ userId: id }),
  ]);
  await AuditLog.updateMany({ actorId: id }, { $set: { actorEmail: "deleted-user" } });
  await User.deleteOne({ _id: id });
}

/** Prevents removing/disabling/demoting the last active administrator. */
export async function assertNotLastAdmin(target: Pick<UserDoc, "_id" | "role" | "status">, action: "delete" | "disable" | "demote") {
  if (target.role !== "admin" || target.status !== "active") return;
  const others = await User.countDocuments({ role: "admin", status: "active", _id: { $ne: target._id } });
  if (others === 0) {
    throw Errors.badRequest(`You cannot ${action} the last active administrator.`);
  }
}

export function adminUserView(u: UserDoc) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    plan: u.plan,
    status: u.status,
    currency: u.currency || "INR",
    permissions: u.permissions ?? [],
    effectivePermissions: effectivePermissions(u.role, u.permissions ?? []),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastLoginAt: u.lastLoginAt ?? null,
  };
}
