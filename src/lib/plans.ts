// Subscription plans (shared client + server). Limits are ENFORCED on the server (lib/finance.ts for records,
// lib/angel/quota.ts for Angel AI). Paid plans are bought monthly through Razorpay (lib/billing.ts).

export type PlanId = "free" | "plus" | "pro" | "unlimited";

export interface AngelQuota {
  /** Angel credits per window. `null` = no limit. One normal message = 1 credit; heavy use costs more. */
  credits: number | null;
  /** length of one usage window in hours — when it ends, the credits refill */
  windowHours: number;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  /** monthly price in INR (0 = free) */
  priceInr: number;
  priceLabel: string;
  /** income + expense + debt records. `null` = unlimited. */
  maxFinanceRecords: number | null;
  /** `null` = unlimited. */
  maxGoals: number | null;
  unlimited: boolean;
  advancedInsights: boolean;
  angel: AngelQuota;
  tagline: string;
  features: string[];
}

/** Visitors who are not signed in can try Angel too (money questions, calculators, web answers). */
export const GUEST_ANGEL: AngelQuota = { credits: 8, windowHours: 6 };

/**
 * What one Angel message costs. Long questions, web look-ups and actions cost more, so heavy use finishes the
 * window sooner; simple questions are cheap.
 */
export const ANGEL_COST = { message: 1, longMessage: 1, web: 2, action: 1 } as const;

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "Free",
    priceInr: 0,
    priceLabel: "₹0",
    maxFinanceRecords: 100,
    maxGoals: 3,
    advancedInsights: false,
    unlimited: false,
    angel: { credits: 20, windowHours: 5 },
    tagline: "Get started",
    features: ["100 finance records", "3 savings goals", "Angel AI — 20 credits every 5 hours", "Dashboard, budgets & charts", "Basic insights", "Realtime sync"],
  },
  plus: {
    id: "plus",
    name: "Plus",
    priceInr: 50,
    priceLabel: "₹50/month",
    maxFinanceRecords: 1000,
    maxGoals: 20,
    advancedInsights: true,
    unlimited: false,
    angel: { credits: 80, windowHours: 5 },
    tagline: "For everyday budgeting",
    features: ["1,000 finance records", "20 savings goals", "Angel AI — 80 credits every 5 hours", "Advanced insights", "CSV export", "Push reminders"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceInr: 100,
    priceLabel: "₹100/month",
    maxFinanceRecords: 10000,
    maxGoals: 100,
    advancedInsights: true,
    unlimited: false,
    angel: { credits: 250, windowHours: 5 },
    tagline: "For serious savers",
    features: ["10,000 finance records", "100 savings goals", "Angel AI — 250 credits every 5 hours", "Advanced insights", "CSV export", "Priority support"],
  },
  unlimited: {
    id: "unlimited",
    name: "Unlimited",
    priceInr: 500,
    priceLabel: "₹500/month",
    maxFinanceRecords: null,
    maxGoals: null,
    advancedInsights: true,
    unlimited: true,
    angel: { credits: null, windowHours: 5 },
    tagline: "No limits at all",
    features: ["Unlimited finance records", "Unlimited savings goals", "Unlimited Angel AI (voice + chat)", "Advanced insights", "CSV export", "Every feature included"],
  },
};

export const PLAN_IDS: PlanId[] = ["free", "plus", "pro", "unlimited"];
/** Plans that can be bought. */
export const PAID_PLAN_IDS: PlanId[] = ["plus", "pro", "unlimited"];
/** Plans shown publicly (landing / pricing / plan page). */
export const PUBLIC_PLAN_IDS: PlanId[] = ["free", "plus", "pro", "unlimited"];
export const PLAN_RANK: Record<PlanId, number> = { free: 0, plus: 1, pro: 2, unlimited: 3 };
/** One paid period. */
export const BILLING_DAYS = 30;

export function getPlan(id: string | undefined | null): PlanDef {
  return PLANS[(id as PlanId) ?? "free"] ?? PLANS.free;
}

export interface PlanHolder {
  plan?: string | null;
  role?: string | null;
  /** set for bought plans; when it passes, the account is back on Free */
  planExpiresAt?: Date | string | null;
}

/** True when a bought plan's period has ended. Plans given by an admin have no end date. */
export function planExpired(user: PlanHolder, now = Date.now()): boolean {
  return Boolean(user.planExpiresAt) && new Date(user.planExpiresAt as Date).getTime() <= now;
}

/** The plan a user really has right now: admins → Unlimited; expired bought plans → Free. */
export function effectivePlanId(user: PlanHolder, now = Date.now()): PlanId {
  if (user.role === "admin") return "unlimited";
  const id = getPlan(user.plan).id;
  if (id !== "free" && planExpired(user, now)) return "free";
  return id;
}

export function planForUser(user: PlanHolder): PlanDef {
  return PLANS[effectivePlanId(user)];
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
