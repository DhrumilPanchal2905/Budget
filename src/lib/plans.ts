// Subscription plans (shared client + server). Limits are ENFORCED on the server in lib/finance.ts.
// To add paid billing later, connect a payment provider webhook that updates `user.plan`.

export type PlanId = "free" | "plus" | "pro" | "unlimited";

export interface PlanDef {
  id: PlanId;
  name: string;
  priceLabel: string;
  /** income + expense + debt records. `null` = unlimited. */
  maxFinanceRecords: number | null;
  /** `null` = unlimited. */
  maxGoals: number | null;
  unlimited: boolean;
  advancedInsights: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "Free",
    priceLabel: "₹0",
    maxFinanceRecords: 100,
    maxGoals: 3,
    advancedInsights: false,
    unlimited: false,
    features: ["100 finance records", "3 savings goals", "Dashboard & charts", "Basic insights", "Realtime sync"],
  },
  plus: {
    id: "plus",
    name: "Plus",
    priceLabel: "Coming soon",
    maxFinanceRecords: 1000,
    maxGoals: 20,
    advancedInsights: true,
    unlimited: false,
    features: ["1,000 finance records", "20 savings goals", "Advanced insights", "CSV export", "Push notifications"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceLabel: "Coming soon",
    maxFinanceRecords: 10000,
    maxGoals: 100,
    advancedInsights: true,
    unlimited: false,
    features: ["10,000 finance records", "100 savings goals", "Advanced insights", "CSV export", "Priority support"],
  },
  unlimited: {
    id: "unlimited",
    name: "Unlimited",
    priceLabel: "Assigned by admin",
    maxFinanceRecords: null,
    maxGoals: null,
    advancedInsights: true,
    unlimited: true,
    features: ["Unlimited finance records", "Unlimited savings goals", "Advanced insights", "CSV export", "Every feature included"],
  },
};

export const PLAN_IDS: PlanId[] = ["free", "plus", "pro", "unlimited"];

export function getPlan(id: string | undefined | null): PlanDef {
  return PLANS[(id as PlanId) ?? "free"] ?? PLANS.free;
}

/** Plans shown publicly (landing / plan page). Unlimited is only assigned by an admin. */
export const PUBLIC_PLAN_IDS: PlanId[] = ["free", "plus", "pro"];

/** Admins always get the Unlimited plan; everyone else gets their stored plan. */
export function planForUser(user: { plan?: string | null; role?: string | null }): PlanDef {
  return user.role === "admin" ? PLANS.unlimited : getPlan(user.plan);
}

/** "1,000" for limited plans, "Unlimited" for null. */
export function limitLabel(limit: number | null): string {
  return limit === null ? "Unlimited" : limit.toLocaleString("en-IN");
}

/** Usage percentage for progress bars (0 for unlimited plans). */
export function usagePct(used: number, limit: number | null): number {
  return limit === null || limit <= 0 ? 0 : Math.min(100, (used / limit) * 100);
}

export const PLAN_LABELS: Record<PlanId, string> = { free: "Free", plus: "Plus", pro: "Pro", unlimited: "Unlimited" };
