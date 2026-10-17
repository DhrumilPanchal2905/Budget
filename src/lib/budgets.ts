// Category budgets: a monthly limit per expense category (and optionally for the whole month).
// Status is computed live from the month's real expenses — exact integer sums in MongoDB.
import { Budget, Expense, oid, type UserDoc } from "./models";
import { currentMonthKey, monthRange, shiftMonth, todayUTC } from "./analytics";
import { formatMoney, fromMinor } from "./money";
import { notifyUser } from "./notify";
import { EXPENSE_CATEGORIES } from "./finance-config";

export const TOTAL = "__total__";

export interface BudgetRow {
  category: string; // "__total__" = all spending
  limit: number; // major units
  spent: number;
  remaining: number;
  pct: number; // spent / limit × 100
  status: "ok" | "warn" | "over";
  alertPct: number;
  /** what you can still spend per remaining day this month (0 when over) */
  perDay: number;
  /** month-end spending at the current pace */
  projected: number;
  projectedOver: boolean;
}

export interface BudgetReport {
  month: string;
  daysLeft: number;
  items: BudgetRow[];
  total: BudgetRow | null;
  /** categories with real spending but no budget yet, with a suggested limit (3-month average) */
  suggestions: { category: string; avg: number; suggested: number }[];
}

const round100 = (minor: number) => Math.ceil(minor / 10000) * 10000; // round UP to ₹100 (minor units)

export async function budgetReport(ownerId: string): Promise<BudgetReport> {
  const userId = oid(ownerId);
  const month = currentMonthKey();
  const { start, end } = monthRange(month);
  const histStart = monthRange(shiftMonth(month, -3)).start;
  const today = todayUTC();
  const dim = new Date(end.getTime() - 86400000).getUTCDate();
  const day = Math.min(dim, today.getUTCDate());
  const daysLeft = Math.max(1, dim - day + 1);

  const [budgets, spentRows, histRows] = await Promise.all([
    Budget.find({ userId }).lean(),
    Expense.aggregate([{ $match: { userId, date: { $gte: start, $lt: end } } }, { $group: { _id: "$category", t: { $sum: "$amount" } } }]),
    Expense.aggregate([{ $match: { userId, date: { $gte: histStart, $lt: start } } }, { $group: { _id: "$category", t: { $sum: "$amount" } } }]),
  ]);
  const spent = new Map<string, number>((spentRows as { _id: string; t: number }[]).map((r) => [r._id, r.t]));
  const totalSpent = [...spent.values()].reduce((a, b) => a + b, 0);

  const row = (category: string, limitMinor: number, spentMinor: number, alertPct: number): BudgetRow => {
    const pct = limitMinor ? Math.round((spentMinor / limitMinor) * 1000) / 10 : 0;
    const remaining = limitMinor - spentMinor;
    const projected = day ? Math.round((spentMinor / day) * dim) : spentMinor;
    return {
      category,
      limit: fromMinor(limitMinor),
      spent: fromMinor(spentMinor),
      remaining: fromMinor(remaining),
      pct,
      status: pct >= 100 ? "over" : pct >= alertPct ? "warn" : "ok",
      alertPct,
      perDay: remaining > 0 ? fromMinor(Math.floor(remaining / daysLeft)) : 0,
      projected: fromMinor(projected),
      projectedOver: projected > limitMinor,
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (budgets as any[]).filter((b) => b.category !== TOTAL).map((b) => row(b.category, b.amount, spent.get(b.category) ?? 0, b.alertPct ?? 80));
  list.sort((a, b) => b.pct - a.pct);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tb = (budgets as any[]).find((b) => b.category === TOTAL);
  const budgeted = new Set(list.map((r) => r.category));
  const suggestions = (histRows as { _id: string; t: number }[])
    .filter((r) => r._id && !budgeted.has(r._id) && r._id !== "EMI / Debt" && (EXPENSE_CATEGORIES as readonly string[]).includes(r._id))
    .map((r) => ({ category: r._id, avgMinor: Math.round(r.t / 3) }))
    .filter((r) => r.avgMinor >= 50000)
    .sort((a, b) => b.avgMinor - a.avgMinor)
    .slice(0, 5)
    .map((r) => ({ category: r.category, avg: fromMinor(r.avgMinor), suggested: fromMinor(round100(Math.round(r.avgMinor * 0.9))) }));

  return { month, daysLeft, items: list, total: tb ? row(TOTAL, tb.amount, totalSpent, tb.alertPct ?? 80) : null, suggestions };
}

/**
 * After an expense is added/changed: notify once per month when a category (or the monthly total) crosses
 * its alert threshold and again when it goes over 100%.
 */
export async function checkBudgetAlerts(owner: Pick<UserDoc, "_id" | "currency">, category: string | null | undefined): Promise<void> {
  const userId = oid(String(owner._id));
  const budgets = await Budget.find({ userId, category: { $in: [category ?? "", TOTAL] } }).lean();
  if (!budgets.length) return;
  const month = currentMonthKey();
  const { start, end } = monthRange(month);
  const cur = owner.currency || "INR";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of budgets as any[]) {
    const match: Record<string, unknown> = { userId, date: { $gte: start, $lt: end } };
    if (b.category !== TOTAL) match.category = b.category;
    const r = await Expense.aggregate([{ $match: match }, { $group: { _id: null, t: { $sum: "$amount" } } }]);
    const spent = r[0]?.t ?? 0;
    const pct = (spent / b.amount) * 100;
    const level = pct >= 100 ? 100 : pct >= (b.alertPct ?? 80) ? b.alertPct ?? 80 : 0;
    if (!level) continue;
    const tag = `${month}:${level}`;
    if (b.lastAlert === tag || (level < 100 && b.lastAlert === `${month}:100`)) continue;
    const name = b.category === TOTAL ? "your monthly budget" : `your ${b.category} budget`;
    await notifyUser(String(owner._id), {
      type: "insight",
      title: level >= 100 ? "Budget exceeded" : `Budget ${Math.round(pct)}% used`,
      message:
        level >= 100
          ? `You've spent ${formatMoney(fromMinor(spent), cur)} — over ${name} of ${formatMoney(fromMinor(b.amount), cur)} by ${formatMoney(fromMinor(spent - b.amount), cur)}.`
          : `You've used ${Math.round(pct)}% of ${name} (${formatMoney(fromMinor(spent), cur)} of ${formatMoney(fromMinor(b.amount), cur)}). ${formatMoney(fromMinor(b.amount - spent), cur)} left this month.`,
      link: "/budgets",
    });
    await Budget.updateOne({ _id: b._id }, { $set: { lastAlert: tag } });
  }
}
