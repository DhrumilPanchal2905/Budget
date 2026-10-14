import { route, ok } from "@/lib/api";
import { AuditLog, COLLECTIONS, Expense, Income, User } from "@/lib/models";
import { fromMinor } from "@/lib/money";
import { currentMonthKey, lastMonths, monthLabel, monthRange } from "@/lib/analytics";

export const runtime = "nodejs";

export const GET = route({ admin: true, perms: ["users.view"] }, async ({ perms }) => {
  const months = lastMonths(currentMonthKey(), 12);
  const from = monthRange(months[0]).start;

  const [userAgg, counts, incomeSum, expenseSum, signups, recent] = await Promise.all([
    User.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          disabled: { $sum: { $cond: [{ $eq: ["$status", "disabled"] }, 1, 0] } },
          free: { $sum: { $cond: [{ $eq: ["$plan", "free"] }, 1, 0] } },
          plus: { $sum: { $cond: [{ $eq: ["$plan", "plus"] }, 1, 0] } },
          pro: { $sum: { $cond: [{ $eq: ["$plan", "pro"] }, 1, 0] } },
          admins: { $sum: { $cond: [{ $eq: ["$role", "admin"] }, 1, 0] } },
          activeLast30: { $sum: { $cond: [{ $gte: ["$lastLoginAt", new Date(Date.now() - 30 * 86400000)] }, 1, 0] } },
        },
      },
    ]),
    Promise.all(Object.entries(COLLECTIONS).map(async ([name, m]) => [name, await m.estimatedDocumentCount()] as const)),
    Income.aggregate([{ $group: { _id: null, t: { $sum: "$amount" } } }]),
    Expense.aggregate([{ $group: { _id: null, t: { $sum: "$amount" } } }]),
    User.aggregate([
      { $match: { createdAt: { $gte: from } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, n: { $sum: 1 } } },
    ]),
    perms.includes("audit.view") ? AuditLog.find().sort({ createdAt: -1 }).limit(15).lean() : Promise.resolve([]),
  ]);

  const signupMap = new Map<string, number>(
    (signups as { _id: { y: number; m: number }; n: number }[]).map((s) => [`${s._id.y}-${String(s._id.m).padStart(2, "0")}`, s.n] as [string, number]),
  );
  const u = userAgg[0] ?? { total: 0, active: 0, disabled: 0, free: 0, plus: 0, pro: 0, admins: 0, activeLast30: 0 };
  return ok({
    users: { total: u.total, active: u.active, inactive: u.disabled, free: u.free, plus: u.plus, pro: u.pro, admins: u.admins, activeLast30: u.activeLast30 },
    collections: Object.fromEntries(counts),
    finance: {
      totalIncome: fromMinor(incomeSum[0]?.t ?? 0),
      totalExpense: fromMinor(expenseSum[0]?.t ?? 0),
      avgIncomePerUser: u.total ? fromMinor(Math.round((incomeSum[0]?.t ?? 0) / u.total)) : 0,
    },
    signups: months.map((k) => ({ month: k, label: monthLabel(k), users: signupMap.get(k) ?? 0 })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recent: recent.map((a: any) => ({ id: String(a._id), action: a.action, actorEmail: a.actorEmail ?? "system", resource: a.resource ?? null, createdAt: a.createdAt })),
  });
});
