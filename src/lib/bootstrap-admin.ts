import { timingSafeEqual } from "crypto";
import { User } from "./models";
import { hashPassword } from "./auth";
import { DEFAULT_ADMIN_PERMISSIONS } from "./permissions";
import { audit } from "./audit";

// Admin bootstrap from environment variables (server-only, never exposed to the browser):
//   ADMIN_EMAILS   = comma-separated admin emails
//   ADMIN_PASSWORD = password for the FIRST login of an admin email that has no account yet
// On first login with that email + password, the admin account is created automatically.
// Later the password lives (hashed) in the database; ADMIN_PASSWORD can then be removed.

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapAdminEmail(email: string): boolean {
  return adminEmails().includes(email.toLowerCase());
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Creates the admin account on first login if it doesn't exist and the env password matches. */
export async function ensureBootstrapAdmin(email: string, password: string, ip: string): Promise<void> {
  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envPassword || !isBootstrapAdminEmail(email)) return;
  if (!safeEqual(password, envPassword)) return;
  if (await User.exists({ email })) return;

  const created = await User.create({
    name: "Administrator",
    email,
    passwordHash: await hashPassword(envPassword),
    role: "admin",
    permissions: DEFAULT_ADMIN_PERMISSIONS,
    plan: "unlimited",
  });
  await audit({ actor: created, action: "auth.admin_bootstrap", resource: "user", resourceId: String(created._id), targetUserId: String(created._id), ip });
}

/** An existing account whose email is in ADMIN_EMAILS is upgraded to admin after a successful login. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function promoteIfBootstrapAdmin(user: any, ip: string): Promise<void> {
  if (!isBootstrapAdminEmail(user.email)) return;
  const missing = DEFAULT_ADMIN_PERMISSIONS.filter((p) => !(user.permissions ?? []).includes(p));
  if (user.role === "admin" && missing.length === 0 && user.plan === "unlimited") return;
  user.role = "admin";
  user.plan = "unlimited";
  user.permissions = [...new Set([...(user.permissions ?? []), ...DEFAULT_ADMIN_PERMISSIONS])];
  await audit({ actor: user, action: "auth.admin_promote_env", resource: "user", resourceId: String(user._id), targetUserId: String(user._id), ip });
}
