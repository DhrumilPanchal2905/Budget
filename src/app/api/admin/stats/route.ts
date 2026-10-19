import { route, ok } from "@/lib/api";
import { AngelConversation, AngelMessage, AuditLog, COLLECTIONS, Expense, Income, Payment, User, Visit } from "@/lib/models";
import { resolveMail } from "@/lib/mailer";
import { fromMinor } from "@/lib/money";
import { currentMonthKey, lastMonths, monthLabel, monthRange } from "@/lib/analytics";

export const runtime = "nodejs";

export const GET = route({ admin: true, perms: ["users.view"] }, async ({ perms }) => {
  const months = lastMonths(currentMonthKey(), 12);
  const from = monthRange(months[0]).start;

  const dayStart = new Date(Date.now() - 24 * 3600 * 1000);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [userAgg, counts, incomeSum, expenseSum, signups, recent, online, visitorsToday, angelChats, angelMsgs7d, mail, newUsers7d, unverified, revenue] = await Promise.all([
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
          unlimited: { $sum: { $cond: [{ $eq: ["$plan", "unlimited"] }, 1, 0] } },
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
    Visit.aggregate([{ $match: { createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } } }, { $group: { _id: "$visitorId" } }, { $count: "n" }]),
    Visit.aggregate([{ $match: { createdAt: { $gte: dayStart } } }, { $group: { _id: "$visitorId" } }, { $count: "n" }]),
    AngelConversation.estimatedDocumentCount(),
    AngelMessage.countDocuments({ role: "user", createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
    resolveMail(),
    User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
    User.countDocuments({ emailVerified: false }),
    Payment.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, all: { $sum: "$amount" }, n: { $sum: 1 }, month: { $sum: { $cond: [{ $gte: ["$paidAt", monthStart] }, "$amount", 0] } }, monthN: { $sum: { $cond: [{ $gte: ["$paidAt", monthStart] }, 1, 0] } } } },
    ]),
  ]);

  const signupMap = new Map<string, number>(
    (signups as { _id: { y: number; m: number }; n: number }[]).map((s) => [`${s._id.y}-${String(s._id.m).padStart(2, "0")}`, s.n] as [string, number]),
  );
  const u = userAgg[0] ?? { total: 0, active: 0, disabled: 0, free: 0, plus: 0, pro: 0, unlimited: 0, admins: 0, activeLast30: 0 };
  return ok({
    users: { total: u.total, active: u.active, inactive: u.disabled, free: u.free, plus: u.plus, pro: u.pro, unlimited: u.unlimited, admins: u.admins, activeLast30: u.activeLast30 },
    collections: Object.fromEntries(counts),
    finance: {
      totalIncome: fromMinor(incomeSum[0]?.t ?? 0),
      totalExpense: fromMinor(expenseSum[0]?.t ?? 0),
      avgIncomePerUser: u.total ? fromMinor(Math.round((incomeSum[0]?.t ?? 0) / u.total)) : 0,
    },
    signups: months.map((k) => ({ month: k, label: monthLabel(k), users: signupMap.get(k) ?? 0 })),
    live: { onlineNow: online[0]?.n ?? 0, visitors24h: visitorsToday[0]?.n ?? 0, newUsers7d, unverified },
    angel: { conversations: angelChats, questions7d: angelMsgs7d },
    revenue: { all: (revenue[0]?.all ?? 0) / 100, payments: revenue[0]?.n ?? 0, month: (revenue[0]?.month ?? 0) / 100, monthPayments: revenue[0]?.monthN ?? 0 },
    email: { ready: Boolean(mail.pass), source: mail.source, from: mail.fromEmail },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recent: recent.map((a: any) => ({ id: String(a._id), action: a.action, actorEmail: a.actorEmail ?? "system", resource: a.resource ?? null, createdAt: a.createdAt })),
  });
});
