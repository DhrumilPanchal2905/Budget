import { route, ok } from "@/lib/api";
import { generateInsights } from "@/lib/insights";
import { planForUser } from "@/lib/plans";
import { insightLang } from "@/lib/lang";

export const runtime = "nodejs";

/** Advanced insights are only computed/returned when the user's plan allows them (server-enforced). */
export const GET = route({ perms: ["insights.view", "finance.read"] }, async ({ user, req }) => {
  const plan = planForUser(user);
  const data = await generateInsights(String(user._id), { advanced: plan.advancedInsights, currency: user.currency || "INR", lang: insightLang(req.nextUrl.searchParams.get("lang"), user.replyLanguage) });
  return ok({ ...data, advancedEnabled: plan.advancedInsights, plan: plan.id });
});
