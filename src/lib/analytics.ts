import type { Model, PipelineStage } from "mongoose";
import { Debt, Expense, Goal, Income, Notification, oid } from "./models";
import { fromMinor, pct } from "./money";
import { APP_TIMEZONE } from "./env";
import { goalInsight } from "./goals";

// All aggregation happens in MongoDB on integer minor units → exact totals, no floating drift.
// Dates are stored as UTC midnight of the chosen calendar day, so UTC grouping = calendar grouping.

export function currentMonthKey(tz = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

export function todayUTC(tz = APP_TIMEZONE): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

export function monthRange(key: string): { start: Date; end: Date } {
  const [y, m] = key.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function lastMonths(endKey: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(endKey, i - n + 1));
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>;

async function sumAmount(model: AnyModel, match: Record<string, unknown>): Promise<number> {
  const r = await model.aggregate([{ $match: match }, { $group: { _id: null, t: { $sum: "$amount" } } }]);
  return r[0]?.t ?? 0;
}

async function byCategory(model: AnyModel, match: Record<string, unknown>) {
  const r = await model.aggregate([
    { $match: match },
    { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
  return r.map((x: { _id: string; total: number; count: number }) => ({ category: x._id, total: x.total, count: x.count }));
}

async function byMonth(model: AnyModel, match: Record<string, unknown>) {
  const r = await model.aggregate([
    { $match: match },
    { $group: { _id: { y: { $year: "$date" }, m: { $month: "$date" } }, total: { $sum: "$amount" } } },
  ]);
  const map = new Map<string, number>();
  for (const x of r as { _id: { y: number; m: number }; total: number }[]) {
    map.set(`${x._id.y}-${String(x._id.m).padStart(2, "0")}`, x.total);
  }
  return map;
}

async function byDay(model: AnyModel, match: Record<string, unknown>) {
  const r = await model.aggregate([{ $match: match }, { $group: { _id: { $dayOfMonth: "$date" }, total: { $sum: "$amount" } } }]);
  const map = new Map<number, number>();
  for (const x of r as { _id: number; total: number }[]) map.set(x._id, x.total);
  return map;
}

async function debtSummary(userId: ReturnType<typeof oid>) {
  const r = await Debt.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: null,
        remainingActive: { $sum: { $cond: [{ $ne: ["$status", "closed"] }, "$remainingAmount", 0] } },
        emiActive: { $sum: { $cond: [{ $eq: ["$status", "active"] }, "$emiAmount", 0] } },
        totalBorrowed: { $sum: "$totalAmount" },
        active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  const d = r[0] ?? { remainingActive: 0, emiActive: 0, totalBorrowed: 0, active: 0, count: 0 };
  return d as { remainingActive: number; emiActive: number; totalBorrowed: number; active: number; count: number };
}

async function goalSummary(userId: ReturnType<typeof oid>) {
  const r = await Goal.aggregate([
    { $match: { userId, status: { $ne: "cancelled" } } },
    { $group: { _id: null, saved: { $sum: "$currentAmount" }, target: { $sum: "$targetAmount" }, count: { $sum: 1 }, achieved: { $sum: { $cond: [{ $eq: ["$status", "achieved"] }, 1, 0] } } } },
  ]);
  return (r[0] ?? { saved: 0, target: 0, count: 0, achieved: 0 }) as { saved: number; target: number; count: number; achieved: number };
}

const mapCats = (cats: { category: string; total: number; count: number }[], whole: number) =>
  cats.map((c) => ({ category: c.category, total: fromMinor(c.total), count: c.count, share: pct(c.total, whole) }));

// ======================= MONTHLY =======================
export async function getMonthly(ownerId: string, key: string) {
  const userId = oid(ownerId);
  const { start, end } = monthRange(key);
  const prev = monthRange(shiftMonth(key, -1));
  const inMonth = { userId, date: { $gte: start, $lt: end } };
  const inPrev = { userId, date: { $gte: prev.start, $lt: prev.end } };

  // Performance: month totals are derived from the per-category groups (same filter → identical integer sums),
  // which saves four database round-trips on every dashboard / analytics load.
  const [prevIncome, expCats, incCats, prevExpCats, incDays, expDays, debts, goals] = await Promise.all([
    sumAmount(Income, inPrev),
    byCategory(Expense, inMonth),
    byCategory(Income, inMonth),
    byCategory(Expense, inPrev),
    byDay(Income, inMonth),
    byDay(Expense, inMonth),
    debtSummary(userId),
    goalSummary(userId),
  ]);
  const total = (rows: { total: number }[]) => rows.reduce((sum, r) => sum + r.total, 0);
  const income = total(incCats);
  const expense = total(expCats);
  const prevExpense = total(prevExpCats);
  const emiPaid = expCats.find((c) => c.category === "EMI / Debt")?.total ?? 0;

  const daysInMonth = new Date(end.getTime() - 86400000).getUTCDate();
  let cumIncome = 0;
  let cumExpense = 0;
  const daily = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const inc = incDays.get(day) ?? 0;
    const exp = expDays.get(day) ?? 0;
    cumIncome += inc;
    cumExpense += exp;
    return { day, label: String(day), income: fromMinor(inc), expense: fromMinor(exp), balance: fromMinor(cumIncome - cumExpense) };
  });

  const prevMap = new Map<string, number>(prevExpCats.map((c) => [c.category, c.total] as [string, number]));
  const categoryComparison = expCats.map((c) => ({
    category: c.category,
    current: fromMinor(c.total),
    previous: fromMinor(prevMap.get(c.category) ?? 0),
  }));

  const net = income - expense;
  return {
    month: key,
    label: monthLabel(key),
    income: fromMinor(income),
    expense: fromMinor(expense),
    savings: fromMinor(net),
    balance: fromMinor(net),
    savingsRate: pct(net, income),
    emiPaid: fromMinor(emiPaid),
    emiDue: fromMinor(debts.emiActive),
    debtRemaining: fromMinor(debts.remainingActive),
    goalSaved: fromMinor(goals.saved),
    previous: {
      month: shiftMonth(key, -1),
      income: fromMinor(prevIncome),
      expense: fromMinor(prevExpense),
      savings: fromMinor(prevIncome - prevExpense),
      incomeChange: prevIncome ? pct(income - prevIncome, prevIncome) : null,
      expenseChange: prevExpense ? pct(expense - prevExpense, prevExpense) : null,
    },
    expenseByCategory: mapCats(expCats, expense),
    incomeByCategory: mapCats(incCats, income),
    categoryComparison,
    daily,
  };
}

// ======================= OVERALL =======================
export async function getOverall(ownerId: string) {
  const userId = oid(ownerId);
  const [income, expense, incMonths, expMonths, expCats, incCats, debts, goals, debtList, goalList, firstInc, firstExp] = await Promise.all([
    sumAmount(Income, { userId }),
    sumAmount(Expense, { userId }),
    byMonth(Income, { userId }),
    byMonth(Expense, { userId }),
    byCategory(Expense, { userId }),
    byCategory(Income, { userId }),
    debtSummary(userId),
    goalSummary(userId),
    Debt.find({ userId }).sort({ status: 1, remainingAmount: -1 }).limit(20).lean(),
    Goal.find({ userId, status: { $ne: "cancelled" } }).sort({ targetDate: 1 }).limit(20).lean(),
    Income.findOne({ userId }).sort({ date: 1 }).select("date").lean<{ date: Date }>(),
    Expense.findOne({ userId }).sort({ date: 1 }).select("date").lean<{ date: Date }>(),
  ]);

  const nowKey = currentMonthKey();
  const firstDates = [firstInc?.date, firstExp?.date].filter(Boolean) as Date[];
  let startKey = shiftMonth(nowKey, -11);
  if (firstDates.length) {
    const first = new Date(Math.min(...firstDates.map((d) => new Date(d).getTime())));
    const fk = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`;
    if (fk < startKey) startKey = fk < shiftMonth(nowKey, -35) ? shiftMonth(nowKey, -35) : fk;
  }
  // also include future-dated months if any data exists there
  const allKeys = [...incMonths.keys(), ...expMonths.keys()].sort();
  const lastKey = allKeys.length && allKeys[allKeys.length - 1] > nowKey ? allKeys[allKeys.length - 1] : nowKey;

  const months: string[] = [];
  for (let k = startKey; k <= lastKey; k = shiftMonth(k, 1)) months.push(k);

  // savings carried in from months older than the window
  let cumulative = 0;
  for (const k of allKeys) if (k < startKey) cumulative += (incMonths.get(k) ?? 0) - (expMonths.get(k) ?? 0);

  const monthly = months.map((k) => {
    const inc = incMonths.get(k) ?? 0;
    const exp = expMonths.get(k) ?? 0;
    cumulative += inc - exp;
    return {
      month: k,
      label: monthLabel(k),
      income: fromMinor(inc),
      expense: fromMinor(exp),
      savings: fromMinor(inc - exp),
      cumulativeSavings: fromMinor(cumulative),
      savingsRate: pct(inc - exp, inc),
    };
  });

  const activeMonths = monthly.filter((m) => m.income || m.expense).length || 1;
  return {
    totals: {
      income: fromMinor(income),
      expense: fromMinor(expense),
      savings: fromMinor(income - expense),
      savingsRate: pct(income - expense, income),
      debtRemaining: fromMinor(debts.remainingActive),
      totalBorrowed: fromMinor(debts.totalBorrowed),
      debtPaid: fromMinor(Math.max(0, debts.totalBorrowed - debts.remainingActive)),
      emiMonthly: fromMinor(debts.emiActive),
      goalSaved: fromMinor(goals.saved),
      goalTarget: fromMinor(goals.target),
      goalsAchieved: goals.achieved,
      goalCount: goals.count,
      avgMonthlyIncome: fromMinor(Math.round(income / activeMonths)),
      avgMonthlyExpense: fromMinor(Math.round(expense / activeMonths)),
    },
    monthly,
    expenseByCategory: mapCats(expCats, expense),
    incomeByCategory: mapCats(incCats, income),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debts: debtList.map((d: any) => ({
      id: String(d._id),
      title: d.title,
      status: d.status,
      total: fromMinor(d.totalAmount),
      remaining: fromMinor(d.remainingAmount),
      paid: fromMinor(Math.max(0, d.totalAmount - d.remainingAmount)),
      emi: fromMinor(d.emiAmount),
      progress: d.totalAmount ? pct(d.totalAmount - d.remainingAmount, d.totalAmount) : 0,
      monthsLeft: d.emiAmount && d.status !== "closed" ? Math.ceil(d.remainingAmount / d.emiAmount) : 0,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    goals: goalList.map((g: any) => ({
      id: String(g._id),
      name: g.name,
      status: g.status,
      target: fromMinor(g.targetAmount),
      current: fromMinor(g.currentAmount),
      progress: Math.min(100, pct(g.currentAmount, g.targetAmount)),
      targetDate: new Date(g.targetDate).toISOString().slice(0, 10),
      insight: goalInsight(g),
    })),
  };
}

// ======================= DASHBOARD =======================
export async function getDashboard(ownerId: string) {
  const userId = oid(ownerId);
  const key = currentMonthKey();
  const today = todayUTC();
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const sixMonths = lastMonths(key, 6);
  const sixStart = monthRange(sixMonths[0]).start;
  const { end } = monthRange(key);

  const recentPipeline: PipelineStage[] = [
    { $match: { userId } },
    { $project: { title: 1, category: 1, amount: 1, date: 1, createdAt: 1, kind: { $literal: "income" } } },
    {
      $unionWith: {
        coll: "expenses",
        pipeline: [{ $match: { userId } }, { $project: { title: 1, category: 1, amount: 1, date: 1, createdAt: 1, kind: { $literal: "expense" } } }],
      },
    },
    { $sort: { date: -1, createdAt: -1 } },
    { $limit: 8 },
  ];

  const [month, lifetimeIncome, lifetimeExpense, incMonths, expMonths, debts, goals, upcoming, topGoals, recent, unread, latestNotifs, threeMonthIncome, activeGoals] =
    await Promise.all([
      getMonthly(ownerId, key),
      sumAmount(Income, { userId }),
      sumAmount(Expense, { userId }),
      byMonth(Income, { userId, date: { $gte: sixStart, $lt: end } }),
      byMonth(Expense, { userId, date: { $gte: sixStart, $lt: end } }),
      debtSummary(userId),
      goalSummary(userId),
      Debt.find({ userId, status: "active", dueDate: { $lte: in30 } }).sort({ dueDate: 1 }).limit(6).lean(),
      Goal.find({ userId, status: { $in: ["active", "achieved"] } }).sort({ status: 1, targetDate: 1 }).limit(5).lean(),
      Income.aggregate(recentPipeline),
      Notification.countDocuments({ userId, read: false }),
      Notification.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
      sumAmount(Income, { userId, date: { $gte: monthRange(shiftMonth(key, -3)).start, $lt: monthRange(key).start } }),
      Goal.find({ userId, status: "active" }).select("targetAmount currentAmount targetDate createdAt status").limit(100).lean(),
    ]);

  const trend = sixMonths.map((k) => ({
    month: k,
    label: monthLabel(k),
    income: fromMinor(incMonths.get(k) ?? 0),
    expense: fromMinor(expMonths.get(k) ?? 0),
    savings: fromMinor((incMonths.get(k) ?? 0) - (expMonths.get(k) ?? 0)),
  }));

  // Health indicators
  const monthIncomeMinor = Math.round(month.income * 100);
  const refIncome = Math.max(monthIncomeMinor, Math.round(threeMonthIncome / 3));
  const emiRatio = refIncome ? pct(debts.emiActive, refIncome) : null;
  const savingsRate = monthIncomeMinor ? month.savingsRate : null;
  const goalProgress = goals.target ? pct(goals.saved, goals.target) : null;
  // Goals: being ON TRACK (vs where you should be by today) matters more than raw progress.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goalStates = (activeGoals as any[]).map((g) => goalInsight(g).status);
  const goalsOnTrack = goalStates.length ? pct(goalStates.filter((st) => st === "on_track" || st === "ahead" || st === "achieved").length, goalStates.length) : null;

  let score: number | null = null;
  if (monthIncomeMinor || month.expense || debts.count || goals.count) {
    score = 50;
    if (savingsRate !== null) score += savingsRate >= 20 ? 25 : savingsRate >= 10 ? 15 : savingsRate >= 0 ? 5 : -20;
    else if (month.expense > 0) score -= 15;
    if (emiRatio !== null) score += emiRatio === 0 ? 15 : emiRatio <= 20 ? 12 : emiRatio <= 40 ? 3 : -15;
    if (goalsOnTrack !== null) score += goalsOnTrack >= 75 ? 10 : goalsOnTrack >= 40 ? 5 : -5;
    else if (goalProgress !== null) score += goalProgress >= 50 ? 10 : goalProgress >= 20 ? 5 : 0;
    score = Math.max(0, Math.min(100, Math.round(score)));
  }

  return {
    month: key,
    monthLabel: monthLabel(key),
    summary: {
      income: month.income,
      expense: month.expense,
      balance: month.balance,
      savingsRate: month.savingsRate,
      incomeChange: month.previous.incomeChange,
      expenseChange: month.previous.expenseChange,
      totalSavings: fromMinor(lifetimeIncome - lifetimeExpense),
      // money set aside in goals is still part of your balance — "free" is what's left to spend
      freeBalance: fromMinor(lifetimeIncome - lifetimeExpense - goals.saved),
      goalSaved: fromMinor(goals.saved),
      goalTarget: fromMinor(goals.target),
      totalDebt: fromMinor(debts.remainingActive),
      emiMonthly: fromMinor(debts.emiActive),
      emiPaidThisMonth: month.emiPaid,
      activeDebts: debts.active,
    },
    health: {
      score,
      savingsRate,
      emiRatio,
      expenseRatio: monthIncomeMinor ? pct(Math.round(month.expense * 100), monthIncomeMinor) : null,
      goalProgress,
      goalsOnTrack,
    },
    trend,
    expenseByCategory: month.expenseByCategory.slice(0, 6),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upcoming: upcoming.map((d: any) => {
      const due = new Date(d.dueDate);
      return {
        id: String(d._id),
        title: d.title,
        emi: fromMinor(d.emiAmount),
        dueDate: due.toISOString().slice(0, 10),
        daysLeft: Math.round((due.getTime() - today.getTime()) / 86400000),
      };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    goals: topGoals.map((g: any) => ({
      id: String(g._id),
      name: g.name,
      status: g.status,
      target: fromMinor(g.targetAmount),
      current: fromMinor(g.currentAmount),
      progress: Math.min(100, pct(g.currentAmount, g.targetAmount)),
      targetDate: new Date(g.targetDate).toISOString().slice(0, 10),
      insight: goalInsight(g),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recent: recent.map((r: any) => ({
      id: String(r._id),
      kind: r.kind,
      title: r.title,
      category: r.category,
      amount: fromMinor(r.amount),
      date: new Date(r.date).toISOString().slice(0, 10),
    })),
    notifications: {
      unread,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      latest: latestNotifs.map((n: any) => ({ id: String(n._id), title: n.title, message: n.message, read: n.read, type: n.type, createdAt: n.createdAt, link: n.link ?? null })),
    },
  };
}
