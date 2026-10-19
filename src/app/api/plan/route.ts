import { route, ok } from "@/lib/api";
import { getUsage } from "@/lib/finance";
import { planForUser, PLANS, PUBLIC_PLAN_IDS } from "@/lib/plans";

export const runtime = "nodejs";

export const GET = route({}, async ({ user }) => {
  const plan = planForUser(user);
  const usage = await getUsage(String(user._id));
  return ok({ current: plan, usage, plans: PUBLIC_PLAN_IDS.map((id) => PLANS[id]) });
});
