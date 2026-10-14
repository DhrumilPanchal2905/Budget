// Shared (client + server) permission catalogue.
// The SERVER is the only authority: client-side checks exist purely to hide UI.

export const USER_PERMISSIONS = [
  "finance.read",
  "finance.write",
  "income.view",
  "income.create",
  "income.update",
  "income.delete",
  "expense.view",
  "expense.create",
  "expense.update",
  "expense.delete",
  "debt.view",
  "debt.create",
  "debt.update",
  "debt.delete",
  "goal.view",
  "goal.create",
  "goal.update",
  "goal.delete",
  "notifications.read",
  "notifications.manage",
  "insights.view",
  "reports.view",
  "reports.export",
  "settings.write",
] as const;

export const ADMIN_PERMISSIONS = [
  "users.view",
  "users.create",
  "users.update",
  "users.delete",
  "users.finance.view",
  "users.finance.manage",
  "database.view",
  "database.delete",
  "audit.view",
  "admin.notifications.send",
] as const;

export const ALL_PERMISSIONS = [...USER_PERMISSIONS, ...ADMIN_PERMISSIONS] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
export type Role = "user" | "admin";

export const PERMISSION_GROUPS: { label: string; items: Permission[] }[] = [
  { label: "Finance", items: ["finance.read", "finance.write"] },
  { label: "Income", items: ["income.view", "income.create", "income.update", "income.delete"] },
  { label: "Expenses", items: ["expense.view", "expense.create", "expense.update", "expense.delete"] },
  { label: "Debt / EMI", items: ["debt.view", "debt.create", "debt.update", "debt.delete"] },
  { label: "Goals", items: ["goal.view", "goal.create", "goal.update", "goal.delete"] },
  { label: "Notifications", items: ["notifications.read", "notifications.manage"] },
  { label: "Insights & reports", items: ["insights.view", "reports.view", "reports.export"] },
  { label: "Settings", items: ["settings.write"] },
  { label: "Admin — users", items: ["users.view", "users.create", "users.update", "users.delete"] },
  { label: "Admin — user finance", items: ["users.finance.view", "users.finance.manage"] },
  { label: "Admin — system", items: ["database.view", "database.delete", "audit.view", "admin.notifications.send"] },
];

export const DEFAULT_USER_PERMISSIONS: Permission[] = [...USER_PERMISSIONS];
export const DEFAULT_ADMIN_PERMISSIONS: Permission[] = [...ALL_PERMISSIONS];

const ADMIN_SET = new Set<string>(ADMIN_PERMISSIONS);
const ALL_SET = new Set<string>(ALL_PERMISSIONS);

export function isAdminPermission(p: string): boolean {
  return ADMIN_SET.has(p);
}

export function isValidPermission(p: string): p is Permission {
  return ALL_SET.has(p);
}

/**
 * Effective permissions: admin-only permissions are ignored unless the role is "admin".
 * This means a normal user can never gain admin powers even if a permission string
 * somehow ends up stored on their account.
 */
export function effectivePermissions(role: Role, stored: string[]): Permission[] {
  return stored.filter(
    (p): p is Permission => isValidPermission(p) && (role === "admin" || !isAdminPermission(p)),
  );
}

export function hasPermission(perms: readonly string[], p: Permission): boolean {
  return perms.includes(p);
}
