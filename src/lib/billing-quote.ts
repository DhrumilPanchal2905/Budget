// Pure pricing logic for plan purchases (no database) — what buying a plan now would do.
import { BILLING_DAYS, PAID_PLAN_IDS, PLAN_RANK, PLANS, effectivePlanId, type PlanId } from "./plans";
import { ApiError } from "./errors";
import type { UserDoc } from "./models";

const DAY = 86400000;

export interface Quote {
  plan: PlanId;
  amountPaise: number;
  mode: "new" | "renew" | "upgrade";
  /** bonus days carried over from the current plan (upgrade) */
  creditDays: number;
  periodStart: Date;
  periodEnd: Date;
}

export type PlanState = Pick<UserDoc, "plan" | "role" | "planExpiresAt" | "planSource">;

/**
 * What buying `plan` now would do for this user. Throws a clear error when the purchase makes no sense
 * (admins, buying a lower plan while a higher one is active, a plan given by an admin).
 */
export function quote(user: PlanState, plan: PlanId, now = Date.now()): Quote {
  if (!PAID_PLAN_IDS.includes(plan)) throw new ApiError(400, "Choose Plus, Pro or Unlimited.");
  if (user.role === "admin") throw new ApiError(400, "Admins already have every feature (Unlimited).");
  const def = PLANS[plan];
  const cur = effectivePlanId(user, now);
  const exp = user.planExpiresAt ? new Date(user.planExpiresAt).getTime() : null;
  const paidActive = cur !== "free" && exp !== null && exp > now;
  const amountPaise = def.priceInr * 100;

  if (cur === plan) {
    if (!paidActive) {
      if (user.planSource !== "paid" && cur !== "free") throw new ApiError(400, `You already have ${def.name} (given by an admin) — no payment needed.`);
    } else {
      const start = new Date(exp!);
      return { plan, amountPaise, mode: "renew", creditDays: 0, periodStart: start, periodEnd: new Date(exp! + BILLING_DAYS * DAY) };
    }
  }
  if (cur !== "free" && PLAN_RANK[plan] < PLAN_RANK[cur]) {
    if (paidActive) throw new ApiError(400, `You're on ${PLANS[cur].name} until ${new Date(exp!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. You can switch to ${def.name} after that.`);
    if (user.planSource !== "paid") throw new ApiError(400, `You already have ${PLANS[cur].name} (given by an admin), which includes everything in ${def.name}.`);
  }
  // new or upgrade: starts now; unused days of a bought plan are converted at fair value into extra days
  let creditDays = 0;
  if (paidActive && PLAN_RANK[plan] > PLAN_RANK[cur]) {
    const remainingDays = (exp! - now) / DAY;
    creditDays = Math.floor((remainingDays * PLANS[cur].priceInr) / def.priceInr);
  }
  return { plan, amountPaise, mode: paidActive ? "upgrade" : "new", creditDays, periodStart: new Date(now), periodEnd: new Date(now + (BILLING_DAYS + creditDays) * DAY) };
}

