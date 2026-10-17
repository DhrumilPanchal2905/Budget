import { route, ok, parseBody } from "@/lib/api";
import { Budget } from "@/lib/models";
import { budgetSchema } from "@/lib/validation";
import { budgetReport, checkBudgetAlerts, TOTAL } from "@/lib/budgets";
import { audit } from "@/lib/audit";
import { publish, userChannel } from "@/lib/realtime";
import { fromMinor } from "@/lib/money";
import { Errors } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = route({ perms: ["finance.read", "expense.view"] }, async ({ user }) => ok(await budgetReport(String(user._id))));

/** Create or change a monthly limit for one category (or "__total__" for the whole month). */
export const PUT = route({ perms: ["finance.write", "expense.view"] }, async ({ req, user, ip }) => {
  const { category, amount, alertPct } = await parseBody(req, budgetSchema);
  const exists = await Budget.exists({ userId: user._id, category });
  if (!exists && (await Budget.countDocuments({ userId: user._id })) >= 40) throw Errors.badRequest("You can have up to 40 budgets.");
  await Budget.updateOne({ userId: user._id, category }, { $set: { amount, alertPct }, $unset: { lastAlert: 1 } }, { upsert: true });
  await audit({ actor: user, action: "finance.budget.set", resource: "budget", targetUserId: String(user._id), metadata: { category, amount: fromMinor(amount) }, ip });
  await publish([userChannel(String(user._id))], "finance:changed", { resource: "budget", action: "update" });
  await checkBudgetAlerts(user, category === TOTAL ? null : category);
  return ok(await budgetReport(String(user._id)), "Budget saved.");
});

export const DELETE = route({ perms: ["finance.write", "expense.view"] }, async ({ req, user, ip }) => {
  const category = (req.nextUrl.searchParams.get("category") || "").slice(0, 40);
  if (!category) throw Errors.badRequest("Category is required.");
  const r = await Budget.deleteOne({ userId: user._id, category });
  if (!r.deletedCount) throw Errors.notFound("Budget");
  await audit({ actor: user, action: "finance.budget.delete", resource: "budget", targetUserId: String(user._id), metadata: { category }, ip });
  await publish([userChannel(String(user._id))], "finance:changed", { resource: "budget", action: "delete" });
  return ok(await budgetReport(String(user._id)), "Budget removed.");
});
