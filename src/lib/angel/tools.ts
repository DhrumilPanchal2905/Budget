// Angel AI — read-only database tools. Every query is scoped to one user (or the whole platform for admins).
// Amounts are aggregated in MongoDB on integer paise, exactly like the dashboard, so Angel's numbers match it.
import type { PipelineStage } from "mongoose";
import { Debt, Expense, Goal, Income, User, oid } from "../models";
import { fromMinor } from "../money";

type Match = Record<string, unknown>;

const scoped = (userId: string | null, extra: Match = {}): Match => (userId ? { userId: oid(userId), ...extra } : { ...extra });

export interface CatRow {
  category: string;
  total: number; // major
  count: number;
}

async function byCategory(model: typeof Income, match: Match): Promise<CatRow[]> {
  const rows = await model.aggregate([
    { $match: match },
    { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
  return (rows as { _id: string; total: number; count: number }[]).map((r) => ({ category: r._id ?? "Other", total: fromMinor(r.total), count: r.count }));
}

export interface PeriodSums {
  income: number;
  expense: number;
  incomeCount: number;
  expenseCount: number;
  expenseByCategory: CatRow[];
  incomeByCategory: CatRow[];
}

/** Income/expense totals (+ per category) in [start, end). `category` narrows expenses AND income to one category. */
export async function periodSums(userId: string | null, start: Date, end: Date, category?: string | null): Promise<PeriodSums> {
  const base = scoped(userId, { date: { $gte: start, $lt: end }, ...(category ? { category } : {}) });
  const [exp, inc] = await Promise.all([byCategory(Expense, base), byCategory(Income, base)]);
  const sum = (rows: CatRow[]) => Math.round(rows.reduce((s, r) => s + r.total * 100, 0)) / 100;
  return {
    income: sum(inc),
    expense: sum(exp),
    incomeCount: inc.reduce((s, r) => s + r.count, 0),
    expenseCount: exp.reduce((s, r) => s + r.count, 0),
    expenseByCategory: exp,
    incomeByCategory: inc,
  };
}

export async function lifetime(userId: string): Promise<{ income: number; expense: number; balance: number }> {
  const id = oid(userId);
  const [i, e] = await Promise.all([
    Income.aggregate([{ $match: { userId: id } }, { $group: { _id: null, t: { $sum: "$amount" } } }]),
    Expense.aggregate([{ $match: { userId: id } }, { $group: { _id: null, t: { $sum: "$amount" } } }]),
  ]);
  const inc = i[0]?.t ?? 0;
  const exp = e[0]?.t ?? 0;
  return { income: fromMinor(inc), expense: fromMinor(exp), balance: fromMinor(inc - exp) };
}

export interface TxRow {
  id: string;
  kind: "income" | "expense";
  title: string;
  category: string;
  amount: number;
  date: string;
  createdAt: Date;
}

export async function recentTransactions(userId: string, limit = 6): Promise<TxRow[]> {
  const id = oid(userId);
  const pipeline: PipelineStage[] = [
    { $match: { userId: id } },
    { $project: { title: 1, category: 1, amount: 1, date: 1, createdAt: 1, kind: { $literal: "income" } } },
    { $unionWith: { coll: "expenses", pipeline: [{ $match: { userId: id } }, { $project: { title: 1, category: 1, amount: 1, date: 1, createdAt: 1, kind: { $literal: "expense" } } }] } },
    { $sort: { date: -1, createdAt: -1 } },
    { $limit: limit },
  ];
  const rows = await Income.aggregate(pipeline);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({ id: String(r._id), kind: r.kind, title: r.title, category: r.category, amount: fromMinor(r.amount), date: new Date(r.date).toISOString().slice(0, 10), createdAt: r.createdAt }));
}

/** Most recently CREATED income/expense (for "delete the last entry"). */
export async function lastCreated(userId: string, resource: "income" | "expense" | null): Promise<(TxRow & { resource: "income" | "expense" }) | null> {
  const id = oid(userId);
  const pick = async (kind: "income" | "expense") => {
    const model = kind === "income" ? Income : Expense;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await model.findOne({ userId: id }).sort({ createdAt: -1, _id: -1 }).lean();
    return d ? { id: String(d._id), kind, resource: kind, title: d.title, category: d.category, amount: fromMinor(d.amount), date: new Date(d.date).toISOString().slice(0, 10), createdAt: d.createdAt as Date } : null;
  };
  if (resource) return pick(resource);
  const [a, b] = await Promise.all([pick("income"), pick("expense")]);
  if (!a) return b;
  if (!b) return a;
  return new Date(a.createdAt).getTime() > new Date(b.createdAt).getTime() ? a : b;
}

export async function largestExpense(userId: string, start: Date, end: Date) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await Expense.findOne({ userId: oid(userId), date: { $gte: start, $lt: end } }).sort({ amount: -1 }).lean();
  return d ? { title: d.title as string, category: d.category as string, amount: fromMinor(d.amount), date: new Date(d.date).toISOString().slice(0, 10) } : null;
}

export interface DebtRow {
  id: string;
  title: string;
  total: number;
  remaining: number;
  emi: number;
  interestRate: number;
  dueDate: string;
  status: string;
}

export async function debtsOf(userId: string, includeClosed = false): Promise<DebtRow[]> {
  const rows = await Debt.find({ userId: oid(userId), ...(includeClosed ? {} : { status: { $ne: "closed" } }) })
    .sort({ dueDate: 1 })
    .limit(30)
    .lean();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((d: any) => ({
    id: String(d._id),
    title: d.title,
    total: fromMinor(d.totalAmount),
    remaining: fromMinor(d.remainingAmount),
    emi: fromMinor(d.emiAmount),
    interestRate: d.interestRate ?? 0,
    dueDate: new Date(d.dueDate).toISOString().slice(0, 10),
    status: d.status,
  }));
}

export interface GoalRow {
  id: string;
  name: string;
  target: number;
  current: number;
  targetDate: string;
  status: string;
}

export async function goalsOf(userId: string, onlyOpen = false): Promise<GoalRow[]> {
  const rows = await Goal.find({ userId: oid(userId), status: onlyOpen ? { $in: ["active", "paused"] } : { $ne: "cancelled" } })
    .sort({ status: 1, targetDate: 1 })
    .limit(30)
    .lean();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((g: any) => ({ id: String(g._id), name: g.name, target: fromMinor(g.targetAmount), current: fromMinor(g.currentAmount), targetDate: new Date(g.targetDate).toISOString().slice(0, 10), status: g.status }));
}

/** Monthly averages over the last 3 complete months (falls back to the current month for new users). */
export async function advisorStats(userId: string, todayStr: string) {
  const today = new Date(`${todayStr}T00:00:00Z`);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const start = new Date(Date.UTC(y, m - 3, 1));
  const curStart = new Date(Date.UTC(y, m, 1));
  const id = oid(userId);
  const monthly = (model: typeof Income, match: Match) =>
    model.aggregate([{ $match: match }, { $group: { _id: { y: { $year: "$date" }, m: { $month: "$date" }, c: "$category" }, t: { $sum: "$amount" } } }]);
  const [inc, exp, life, debts] = await Promise.all([
    monthly(Income, { userId: id, date: { $gte: start, $lt: curStart } }),
    monthly(Expense, { userId: id, date: { $gte: start, $lt: curStart } }),
    lifetime(userId),
    debtsOf(userId),
  ]);
  const monthsSeen = new Set<string>();
  let incTotal = 0;
  let expTotal = 0;
  const cats = new Map<string, number>();
  for (const r of inc as { _id: { y: number; m: number }; t: number }[]) {
    monthsSeen.add(`${r._id.y}-${r._id.m}`);
    incTotal += r.t;
  }
  for (const r of exp as { _id: { y: number; m: number; c: string }; t: number }[]) {
    monthsSeen.add(`${r._id.y}-${r._id.m}`);
    expTotal += r.t;
    cats.set(r._id.c, (cats.get(r._id.c) ?? 0) + r.t);
  }
  let months = monthsSeen.size;
  // New users: use the current month so far.
  if (months === 0) {
    const cur = await periodSums(userId, curStart, new Date(Date.UTC(y, m + 1, 1)));
    return {
      months: cur.income || cur.expense ? 1 : 0,
      avgIncome: cur.income,
      avgExpense: cur.expense,
      categoryAvg: cur.expenseByCategory.map((c) => ({ category: c.category, avg: c.total })),
      balance: life.balance,
      lifetime: life,
      emiMonthly: debts.filter((d) => d.status === "active").reduce((s, d) => s + d.emi, 0),
      debts,
    };
  }
  months = Math.max(1, months);
  return {
    months,
    avgIncome: fromMinor(Math.round(incTotal / months)),
    avgExpense: fromMinor(Math.round(expTotal / months)),
    categoryAvg: [...cats.entries()].map(([category, t]) => ({ category, avg: fromMinor(Math.round(t / months)) })).sort((a, b) => b.avg - a.avg),
    balance: life.balance,
    lifetime: life,
    emiMonthly: debts.filter((d) => d.status === "active").reduce((s, d) => s + d.emi, 0),
    debts,
  };
}

// ---------------- platform (admin only) ----------------
export async function platformUsers(start?: Date, end?: Date) {
  const [agg, signups] = await Promise.all([
    User.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          free: { $sum: { $cond: [{ $eq: ["$plan", "free"] }, 1, 0] } },
          plus: { $sum: { $cond: [{ $eq: ["$plan", "plus"] }, 1, 0] } },
          pro: { $sum: { $cond: [{ $eq: ["$plan", "pro"] }, 1, 0] } },
          unlimited: { $sum: { $cond: [{ $eq: ["$plan", "unlimited"] }, 1, 0] } },
          admins: { $sum: { $cond: [{ $eq: ["$role", "admin"] }, 1, 0] } },
          activeLast30: { $sum: { $cond: [{ $gte: ["$lastLoginAt", new Date(Date.now() - 30 * 86400000)] }, 1, 0] } },
        },
      },
    ]),
    start && end ? User.countDocuments({ createdAt: { $gte: start, $lt: end } }) : Promise.resolve(null),
  ]);
  const u = agg[0] ?? { total: 0, active: 0, free: 0, plus: 0, pro: 0, unlimited: 0, admins: 0, activeLast30: 0 };
  return { ...u, signups } as { total: number; active: number; free: number; plus: number; pro: number; unlimited: number; admins: number; activeLast30: number; signups: number | null };
}

export async function topSpenders(start: Date, end: Date, limit = 5) {
  const rows = await Expense.aggregate([
    { $match: { date: { $gte: start, $lt: end } } },
    { $group: { _id: "$userId", total: { $sum: "$amount" } } },
    { $sort: { total: -1 } },
    { $limit: limit },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
    { $project: { total: 1, "u.name": 1, "u.email": 1 } },
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({ name: r.u?.[0]?.name ?? "deleted user", email: r.u?.[0]?.email ?? "", total: fromMinor(r.total) }));
}

export interface UserLite {
  _id: string;
  name: string;
  email: string;
  plan: string;
  role: string;
  status: string;
  createdAt?: Date;
  lastLoginAt?: Date;
}

export async function allUsersLite(limit = 5000): Promise<UserLite[]> {
  const rows = await User.find({}).select("name email plan role status createdAt lastLoginAt").sort({ createdAt: -1 }).limit(limit).lean();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((u: any) => ({ _id: String(u._id), name: u.name, email: u.email, plan: u.plan, role: u.role, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt }));
}

export interface UsersFilter {
  plan?: string | null;
  role?: "admin" | null;
  status?: "active" | "disabled" | null;
  loggedInSince?: Date | null; // active users
  notLoggedInSince?: Date | null; // inactive users
  createdFrom?: Date | null;
  createdTo?: Date | null;
  sort?: "new" | "old" | "login";
}

/** Admin user search for Angel: counts + the first matching users. */
export async function usersQuery(f: UsersFilter, limit = 10): Promise<{ total: number; items: UserLite[] }> {
  const q: Record<string, unknown> = {};
  if (f.plan) q.plan = f.plan;
  if (f.role) q.role = f.role;
  if (f.status) q.status = f.status;
  if (f.loggedInSince) q.lastLoginAt = { $gte: f.loggedInSince };
  if (f.notLoggedInSince) q.$or = [{ lastLoginAt: { $lt: f.notLoggedInSince } }, { lastLoginAt: { $exists: false } }];
  if (f.createdFrom || f.createdTo) q.createdAt = { ...(f.createdFrom ? { $gte: f.createdFrom } : {}), ...(f.createdTo ? { $lt: f.createdTo } : {}) };
  const sort: Record<string, 1 | -1> = f.sort === "old" ? { createdAt: 1 } : f.sort === "login" ? { lastLoginAt: -1 } : { createdAt: -1 };
  const [total, rows] = await Promise.all([
    User.countDocuments(q),
    User.find(q).select("name email plan role status createdAt lastLoginAt").sort(sort).limit(limit).lean(),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { total, items: rows.map((u: any) => ({ _id: String(u._id), name: u.name, email: u.email, plan: u.plan, role: u.role, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt })) };
}

export async function topEarners(start: Date, end: Date, limit = 5) {
  const rows = await Income.aggregate([
    { $match: { date: { $gte: start, $lt: end } } },
    { $group: { _id: "$userId", total: { $sum: "$amount" } } },
    { $sort: { total: -1 } },
    { $limit: limit },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
    { $project: { total: 1, "u.name": 1, "u.email": 1 } },
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({ name: r.u?.[0]?.name ?? "deleted user", email: r.u?.[0]?.email ?? "", total: fromMinor(r.total) }));
}
