import { route, ok, parseBody } from "@/lib/api";
import { User, type UserDoc } from "@/lib/models";
import { adminCreateUserSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/auth";
import { adminUserView } from "@/lib/users";
import { DEFAULT_ADMIN_PERMISSIONS, DEFAULT_USER_PERMISSIONS, isAdminPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { Errors } from "@/lib/errors";

export const runtime = "nodejs";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const GET = route({ admin: true, perms: ["users.view"] }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  const q = (sp.get("q") || "").trim().slice(0, 80);
  if (q) filter.$or = [{ email: { $regex: escapeRegex(q), $options: "i" } }, { name: { $regex: escapeRegex(q), $options: "i" } }];
  const plan = sp.get("plan");
  if (plan && ["free", "plus", "pro", "unlimited"].includes(plan)) filter.plan = plan;
  const status = sp.get("status");
  if (status && ["active", "disabled"].includes(status)) filter.status = status;
  const role = sp.get("role");
  if (role && ["user", "admin"].includes(role)) filter.role = role;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 20));

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean<UserDoc[]>(),
    User.countDocuments(filter),
  ]);
  return ok({ items: items.map(adminUserView), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const POST = route({ admin: true, perms: ["users.create"] }, async ({ req, user, perms, ip }) => {
  const data = await parseBody(req, adminCreateUserSchema);
  if (await User.exists({ email: data.email })) throw Errors.conflict("A user with this email already exists.");

  let permissions = data.permissions ?? (data.role === "admin" ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_USER_PERMISSIONS);
  if (data.role !== "admin") permissions = permissions.filter((p) => !isAdminPermission(p));
  // Anti privilege-escalation: an admin can only grant admin permissions they hold themselves.
  const notHeld = permissions.filter((p) => isAdminPermission(p) && !perms.includes(p));
  if (notHeld.length) throw Errors.forbidden();
  if (data.role === "admin" && !perms.includes("users.update")) throw Errors.forbidden();

  const created = await User.create({
    name: data.name,
    email: data.email,
    passwordHash: await hashPassword(data.password),
    role: data.role,
    plan: data.role === "admin" ? "unlimited" : data.plan,
    permissions,
  });
  await audit({ actor: user, action: "admin.user.create", resource: "user", resourceId: String(created._id), targetUserId: String(created._id), metadata: { email: data.email, role: data.role, plan: data.plan }, ip });
  await notifyUser(String(created._id), { type: "system", title: "Welcome to Budget Pro", message: "An administrator created your account. You can change your password in Settings.", link: "/settings", push: false });
  return ok({ user: adminUserView(created.toObject()) }, "User created successfully.", 201);
});
