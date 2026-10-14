import { route, ok } from "@/lib/api";
import { getDashboard } from "@/lib/analytics";
import { generateInsights } from "@/lib/insights";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";

export const GET = route({ perms: ["finance.read"] }, async ({ user, perms }) => {
  const plan = getPlan(user.plan);
  const [dashboard, insights] = await Promise.all([
    getDashboard(String(user._id)),
    perms.includes("insights.view")
      ? generateInsights(String(user._id), { advanced: plan.advancedInsights, currency: user.currency || "INR" })
      : Promise.resolve(null),
  ]);
  return ok({ ...dashboard, insights: insights ? insights.insights.slice(0, 4) : [] });
});
