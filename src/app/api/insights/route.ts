import { route, ok } from "@/lib/api";
import { generateInsights } from "@/lib/insights";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";

/** Advanced insights are only computed/returned when the user's plan allows them (server-enforced). */
export const GET = route({ perms: ["insights.view", "finance.read"] }, async ({ user }) => {
  const plan = getPlan(user.plan);
  const data = await generateInsights(String(user._id), { advanced: plan.advancedInsights, currency: user.currency || "INR" });
  return ok({ ...data, advancedEnabled: plan.advancedInsights, plan: plan.id });
});
