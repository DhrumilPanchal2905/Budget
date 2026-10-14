// Subscription plans (shared client + server). Limits are ENFORCED on the server in lib/finance.ts.
// To add paid billing later, connect a payment provider webhook that updates `user.plan`.

export type PlanId = "free" | "plus" | "pro";

export interface PlanDef {
  id: PlanId;
  name: string;
  priceLabel: string;
  maxFinanceRecords: number; // income + expense + debt records
  maxGoals: number;
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
    features: ["100 finance records", "3 savings goals", "Dashboard & charts", "Basic insights", "Realtime sync"],
  },
  plus: {
    id: "plus",
    name: "Plus",
    priceLabel: "Coming soon",
    maxFinanceRecords: 1000,
    maxGoals: 20,
    advancedInsights: true,
    features: ["1,000 finance records", "20 savings goals", "Advanced insights", "CSV export", "Push notifications"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceLabel: "Coming soon",
    maxFinanceRecords: 10000,
    maxGoals: 100,
    advancedInsights: true,
    features: ["10,000 finance records", "100 savings goals", "Advanced insights", "CSV export", "Priority support"],
  },
};

export const PLAN_IDS: PlanId[] = ["free", "plus", "pro"];

export function getPlan(id: string | undefined | null): PlanDef {
  return PLANS[(id as PlanId) ?? "free"] ?? PLANS.free;
}
