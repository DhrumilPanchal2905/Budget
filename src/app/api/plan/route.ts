import { route, ok } from "@/lib/api";
import { getUsage } from "@/lib/finance";
import { getPlan, PLANS } from "@/lib/plans";

export const runtime = "nodejs";

export const GET = route({}, async ({ user }) => {
  const plan = getPlan(user.plan);
  const usage = await getUsage(String(user._id));
  return ok({ current: plan, usage, plans: Object.values(PLANS) });
});
