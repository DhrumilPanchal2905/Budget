import { invalidateUserCache } from "@/lib/auth";
import { route, ok, parseBody } from "@/lib/api";
import { AuditLog, Expense, Income, Notification, Payment, Session, User, Visit, isObjectId, oid, type UserDoc } from "@/lib/models";
import { placeLabel } from "@/lib/geo";
import { adminUpdateUserSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/auth";
import { adminUserView, assertCanManage, assertNotLastAdmin, deleteUserCompletely } from "@/lib/users";
import { getUsage } from "@/lib/finance";
import { DEFAULT_ADMIN_PERMISSIONS, effectivePermissions, isAdminPermission, type Permission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notifyUser, serializeNotification } from "@/lib/notify";
import { publish, userChannel } from "@/lib/realtime";
import { Errors } from "@/lib/errors";
import { currentMonthKey, getOverall, lastMonths, monthLabel, monthRange } from "@/lib/analytics";
import { fromMinor } from "@/lib/money";
import { getPlan, planForUser } from "@/lib/plans";

export const runtime = "nodejs";

async function loadTarget(id: unknown): Promise<UserDoc> {
  if (!isObjectId(id)) throw Errors.notFound("User");
  const u = await User.findById(id).lean<UserDoc>();
  if (!u) throw Errors.notFound("User");
  return u;
}


/** Full user inspection: profile, plan, permissions, finance totals, monthly chart, notifications, activity. */
export const GET = route({ admin: true, perms: ["users.view"] }, async ({ params, perms }) => {
  const target = await loadTarget(params.id);
  const id = String(target._id);
  const userId = oid(id);
  const canFinance = perms.includes("users.finance.view");
  const canAudit = perms.includes("audit.view");

  const months = lastMonths(currentMonthKey(), 12);
  const from = monthRange(months[0]).start;
  const monthAgg = (model: typeof Income) =>
    model.aggregate([
      { $match: { userId, date: { $gte: from } } },
      { $group: { _id: { y: { $year: "$date" }, m: { $month: "$date" } }, t: { $sum: "$amount" } } },
    ]);

  const [usage, overall, incM, expM, notifications, activity, sessions, sessionList, visits, payments] = await Promise.all([
    getUsage(id),
    canFinance ? getOverall(id) : Promise.resolve(null),
    canFinance ? monthAgg(Income) : Promise.resolve([]),
    canFinance ? monthAgg(Expense) : Promise.resolve([]),
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
    canAudit
      ? AuditLog.find({ $or: [{ targetUserId: userId }, { actorId: userId }] }).sort({ createdAt: -1 }).limit(40).lean()
      : Promise.resolve([]),
    Session.countDocuments({ userId, expiresAt: { $gt: new Date() } }),
    Session.find({ userId, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 }).limit(10).select("createdAt lastSeenAt userAgent method country region city ip").lean(),
    Visit.find({ userId }).sort({ createdAt: -1 }).limit(15).select("createdAt path city region country countryCode device browser os").lean(),
    Payment.find({ userId }).sort({ createdAt: -1 }).limit(20).select("plan amount status paidAt createdAt invoiceNo paymentId method periodEnd").lean(),
  ]);

  const toMap = (rows: { _id: { y: number; m: number }; t: number }[]) =>
    new Map<string, number>(rows.map((r) => [`${r._id.y}-${String(r._id.m).padStart(2, "0")}`, r.t] as [string, number]));
  const im = toMap(incM as never);
  const em = toMap(expM as never);

  return ok({
    user: adminUserView(target),
    plan: planForUser(target),
    usage,
    activeSessions: sessions,
    whereabouts: {
      lastSeenAt: target.lastSeenAt ?? target.lastLoginAt ?? null,
      lastLocation: target.lastLocation ? placeLabel(target.lastLocation) : null,
      emailVerified: target.emailVerified !== false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sessions: sessionList.map((x: any) => ({ id: String(x._id), createdAt: x.createdAt, lastSeenAt: x.lastSeenAt, method: x.method, place: placeLabel(x), device: String(x.userAgent || "").slice(0, 120) })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      visits: visits.map((v: any) => ({ id: String(v._id), at: v.createdAt, path: v.path, place: placeLabel(v), code: v.countryCode ?? null, device: `${v.browser ?? ""} · ${v.os ?? ""}` })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payments: payments.map((p: any) => ({ id: String(p._id), plan: p.plan, amount: p.amount / 100, status: p.status, at: p.paidAt ?? p.createdAt, invoiceNo: p.invoiceNo ?? null, paymentId: p.paymentId ?? null, method: p.method ?? null, periodEnd: p.periodEnd ?? null })),
    totals: overall?.totals ?? null,
    monthly: canFinance
      ? months.map((k) => ({ month: k, label: monthLabel(k), income: fromMinor(im.get(k) ?? 0), expense: fromMinor(em.get(k) ?? 0) }))
      : [],
    notifications: notifications.map(serializeNotification),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activity: activity.map((a: any) => ({
      id: String(a._id),
      action: a.action,
      actorEmail: a.actorEmail ?? "system",
      resource: a.resource ?? null,
      metadata: a.metadata ?? {},
      createdAt: a.createdAt,
    })),
  });
});

/** Edit user: profile, role, plan, status, permissions, password reset — with anti-escalation rules. */
export const PATCH = route({ admin: true, perms: ["users.update"] }, async ({ req, params, user, perms, ip }) => {
  const target = await loadTarget(params.id);
  const data = await parseBody(req, adminUpdateUserSchema);
  const isSelf = String(target._id) === String(user._id);
  if (!isSelf) assertCanManage(target, perms);

  if (isSelf && (data.role !== undefined || data.status !== undefined || data.permissions !== undefined || data.plan !== undefined)) {
    throw Errors.badRequest("You cannot change your own role, status, plan or permissions. Ask another administrator.");
  }

  const set: Record<string, unknown> = {};
  const changes: string[] = [];
  const nextRole = data.role ?? target.role;

  if (data.name !== undefined && data.name !== target.name) {
    set.name = data.name;
    changes.push("name");
  }
  if (data.email !== undefined && data.email !== target.email) {
    if (await User.exists({ email: data.email, _id: { $ne: target._id } })) throw Errors.conflict("A user with this email already exists.");
    set.email = data.email;
    changes.push("email");
  }
  if (data.plan !== undefined && (data.plan !== target.plan || target.planExpiresAt)) {
    // a plan given by an admin has no end date (replaces a bought plan's period)
    set.plan = data.plan;
    set.planExpiresAt = null;
    set.planSource = "admin";
    changes.push("plan");
  }
  if (data.role !== undefined && data.role !== target.role) {
    if (data.role === "user") await assertNotLastAdmin(target, "demote");
    set.role = data.role;
    changes.push("role");
    // Admins always get the Unlimited plan.
    if (data.role === "admin" && target.plan !== "unlimited") {
      set.plan = "unlimited";
      if (!changes.includes("plan")) changes.push("plan");
    }
  }
  if (data.status !== undefined && data.status !== target.status) {
    if (data.status === "disabled") await assertNotLastAdmin(target, "disable");
    set.status = data.status;
    changes.push("status");
  }

  // Permissions: compute final list then verify the actor may grant every admin permission in it.
  let finalPerms: Permission[] | undefined;
  if (data.permissions !== undefined) finalPerms = [...new Set(data.permissions)] as Permission[];
  else if (set.role === "admin") finalPerms = [...new Set([...(target.permissions as Permission[]), ...DEFAULT_ADMIN_PERMISSIONS.filter((p) => perms.includes(p))])];
  if (finalPerms) {
    if (nextRole !== "admin") finalPerms = finalPerms.filter((p) => !isAdminPermission(p));
    const before = new Set(target.permissions ?? []);
    const added = finalPerms.filter((p) => !before.has(p));
    // Compare against EFFECTIVE perms: stale admin perms stored on a non-admin must not be "kept" on promotion.
    const effectiveBefore = new Set<string>(effectivePermissions(target.role, target.permissions ?? []));
    if (finalPerms.some((p) => isAdminPermission(p) && !effectiveBefore.has(p) && !perms.includes(p))) {
      throw Errors.badRequest("You can only grant admin permissions that you hold yourself.");
    }
    const changed = added.length || [...before].some((p) => !finalPerms!.includes(p as Permission));
    if (changed) {
      set.permissions = finalPerms;
      changes.push("permissions");
    }
  } else if (set.role === "user") {
    set.permissions = (target.permissions ?? []).filter((p) => !isAdminPermission(p));
  }

  if (data.password) {
    set.passwordHash = await hashPassword(data.password);
    changes.push("password");
  }
  if (!changes.length) throw Errors.badRequest("No changes to save.");

  const updated = await User.findByIdAndUpdate(target._id, { $set: set }, { new: true }).lean<UserDoc>();
  invalidateUserCache(String(target._id));
  if (!updated) throw Errors.notFound("User");

  // Kill sessions when access is revoked or credentials reset.
  if (set.status === "disabled" || changes.includes("password")) {
    await Session.deleteMany({ userId: target._id });
    invalidateUserCache(String(target._id));
    await publish([userChannel(String(target._id))], "session:revoked", {});
  } else {
    await publish([userChannel(String(target._id))], "profile:changed", {});
  }

  const action = changes.includes("permissions")
    ? "admin.user.permissions_change"
    : changes.includes("plan")
      ? "admin.user.plan_change"
      : changes.includes("role")
        ? "admin.user.role_change"
        : "admin.user.update";
  await audit({
    actor: user,
    action,
    resource: "user",
    resourceId: String(target._id),
    targetUserId: String(target._id),
    metadata: {
      changes,
      ...(set.plan ? { plan: { from: target.plan, to: set.plan } } : {}),
      ...(set.role ? { role: { from: target.role, to: set.role } } : {}),
      ...(set.status ? { status: { from: target.status, to: set.status } } : {}),
    },
    ip,
  });

  if (data.notifyUser && !isSelf && set.status !== "disabled") {
    const parts: string[] = [];
    if (set.plan) parts.push(`your plan is now ${getPlan(String(set.plan)).name}`);
    if (changes.includes("permissions") || set.role) parts.push("your access permissions were updated");
    if (changes.includes("password")) parts.push("your password was reset");
    if (changes.includes("name") || changes.includes("email")) parts.push("your profile details were updated");
    if (parts.length) {
      await notifyUser(String(target._id), {
        type: "admin",
        title: "Account updated by admin",
        message: `An administrator made changes: ${parts.join(", ")}.`,
        link: set.plan ? "/plan" : "/settings",
      });
    }
  }
  return ok({ user: adminUserView(updated) }, "User updated successfully.");
});

export const DELETE = route({ admin: true, perms: ["users.delete"] }, async ({ params, user, perms, ip }) => {
  const target = await loadTarget(params.id);
  if (String(target._id) === String(user._id)) throw Errors.badRequest("Use Settings → Delete account to delete your own account.");
  assertCanManage(target, perms);
  await assertNotLastAdmin(target, "delete");
  await publish([userChannel(String(target._id))], "session:revoked", {});
  await deleteUserCompletely(target._id);
  await audit({ actor: user, action: "admin.user.delete", resource: "user", resourceId: String(target._id), metadata: { email: target.email }, ip });
  return ok({ id: String(target._id) }, "User deleted successfully.");
});
