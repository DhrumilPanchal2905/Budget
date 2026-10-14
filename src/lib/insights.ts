import { Debt, Expense, Goal, Income, oid } from "./models";
import { formatMoney, fromMinor, pct } from "./money";
import { currentMonthKey, lastMonths, monthLabel, monthRange, shiftMonth, todayUTC } from "./analytics";

// Rule-based financial insights computed in TypeScript from the user's REAL data.
// (Replaces the need for a separate Python service — runs inside the same Vercel function.)

export type Severity = "positive" | "info" | "warning" | "critical";

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  advanced: boolean;
  metric?: string;
}

interface MonthAgg {
  income: number;
  expense: number;
  cats: Map<string, number>;
}

export async function generateInsights(ownerId: string, opts: { advanced: boolean; currency: string }) {
  const userId = oid(ownerId);
  const cur = currentMonthKey();
  const keys = lastMonths(cur, 4); // [m-3, m-2, m-1, current]
  const from = monthRange(keys[0]).start;
  const to = monthRange(cur).end;
  const fmt = (minor: number) => formatMoney(fromMinor(minor), opts.currency);

  const [incRows, expRows, debts, goals, largest] = await Promise.all([
    Income.aggregate([
      { $match: { userId, date: { $gte: from, $lt: to } } },
      { $group: { _id: { y: { $year: "$date" }, m: { $month: "$date" } }, total: { $sum: "$amount" } } },
    ]),
    Expense.aggregate([
      { $match: { userId, date: { $gte: from, $lt: to } } },
      { $group: { _id: { y: { $year: "$date" }, m: { $month: "$date" }, c: "$category" }, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Debt.find({ userId, status: "active" }).lean(),
    Goal.find({ userId, status: "active" }).lean(),
    Expense.find({ userId, date: { $gte: monthRange(cur).start, $lt: to } }).sort({ amount: -1 }).limit(1).lean(),
  ]);

  const months = new Map<string, MonthAgg>(keys.map((k) => [k, { income: 0, expense: 0, cats: new Map() }]));
  const k = (id: { y: number; m: number }) => `${id.y}-${String(id.m).padStart(2, "0")}`;
  for (const r of incRows as { _id: { y: number; m: number }; total: number }[]) {
    const m = months.get(k(r._id));
    if (m) m.income += r.total;
  }
  let curExpenseCount = 0;
  for (const r of expRows as { _id: { y: number; m: number; c: string }; total: number; count: number }[]) {
    const key = k(r._id);
    const m = months.get(key);
    if (!m) continue;
    m.expense += r.total;
    m.cats.set(r._id.c, (m.cats.get(r._id.c) ?? 0) + r.total);
    if (key === cur) curExpenseCount += r.count;
  }

  const now = months.get(cur)!;
  const prev = months.get(shiftMonth(cur, -1))!;
  const history = keys.slice(0, 3).map((x) => months.get(x)!);
  const insights: Insight[] = [];
  const hasAnyData = [...months.values()].some((m) => m.income || m.expense) || debts.length || goals.length;

  if (!hasAnyData) {
    return {
      insights: [
        {
          id: "getting-started",
          severity: "info" as Severity,
          title: "Add your first transactions",
          message: "Record your salary, a few expenses and any EMIs. Insights appear automatically once there is data to analyse.",
          advanced: false,
        },
      ],
      lockedCount: 0,
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------- BASIC (all plans) ----------
  if (now.income > 0) {
    const rate = pct(now.income - now.expense, now.income);
    if (rate < 0) {
      insights.push({ id: "overspending", severity: "critical", advanced: false, title: "Spending exceeds income this month", message: `You have spent ${fmt(now.expense - now.income)} more than you earned in ${monthLabel(cur)}. Review non-essential categories.`, metric: `${rate}%` });
    } else if (rate >= 30) {
      insights.push({ id: "great-savings", severity: "positive", advanced: false, title: "Excellent savings rate", message: `You are saving ${rate}% of your income this month (${fmt(now.income - now.expense)}). Consider moving surplus into a goal or investment.`, metric: `${rate}%` });
    } else if (rate < 10) {
      insights.push({ id: "low-savings", severity: "warning", advanced: false, title: "Low savings rate", message: `Only ${rate}% of this month's income is left after expenses. A 20% savings target is a healthy benchmark.`, metric: `${rate}%` });
    } else {
      insights.push({ id: "savings-rate", severity: "info", advanced: false, title: "Savings on track", message: `You are saving ${rate}% of your income this month.`, metric: `${rate}%` });
    }
  } else if (now.expense > 0) {
    insights.push({ id: "no-income", severity: "warning", advanced: false, title: "No income recorded this month", message: `You have ${fmt(now.expense)} of expenses in ${monthLabel(cur)} but no income entries yet.` });
  }

  if (prev.expense > 0 && now.expense > 0) {
    const change = pct(now.expense - prev.expense, prev.expense);
    if (change >= 15) {
      insights.push({ id: "spend-up", severity: "warning", advanced: false, title: "Spending increased vs last month", message: `Expenses so far are ${change}% higher than all of ${monthLabel(shiftMonth(cur, -1))} (${fmt(now.expense)} vs ${fmt(prev.expense)}).`, metric: `+${change}%` });
    } else if (change <= -15) {
      insights.push({ id: "spend-down", severity: "positive", advanced: false, title: "Spending reduced vs last month", message: `Expenses are ${Math.abs(change)}% lower than last month. Nice discipline!`, metric: `${change}%` });
    }
  }

  const emiTotal = debts.reduce((s, d) => s + (d.emiAmount || 0), 0);
  const avgIncome = Math.max(now.income, Math.round(history.reduce((s, m) => s + m.income, 0) / 3));
  if (emiTotal > 0 && avgIncome > 0) {
    const ratio = pct(emiTotal, avgIncome);
    if (ratio > 50) insights.push({ id: "emi-critical", severity: "critical", advanced: false, title: "EMI burden is very high", message: `EMIs take ${ratio}% of your monthly income (${fmt(emiTotal)}). Above 40–50% leaves little room for emergencies — consider prepaying the highest-interest loan.`, metric: `${ratio}%` });
    else if (ratio > 35) insights.push({ id: "emi-high", severity: "warning", advanced: false, title: "EMI burden is high", message: `EMIs take ${ratio}% of your monthly income. Try to keep it under 35% before taking new loans.`, metric: `${ratio}%` });
    else insights.push({ id: "emi-ok", severity: "positive", advanced: false, title: "EMI burden is manageable", message: `EMIs are ${ratio}% of your monthly income — within a healthy range.`, metric: `${ratio}%` });
  }

  for (const g of goals) {
    const p = pct(g.currentAmount, g.targetAmount);
    if (p >= 90 && p < 100) insights.push({ id: `goal-close-${g._id}`, severity: "positive", advanced: false, title: `Almost there: ${g.name}`, message: `You have reached ${p}% of "${g.name}". Only ${fmt(g.targetAmount - g.currentAmount)} to go!`, metric: `${p}%` });
  }

  // ---------- ADVANCED (Plus / Pro) ----------
  const advanced: Insight[] = [];

  // Category spikes vs 3-month average
  for (const [cat, amount] of now.cats) {
    const avg = history.reduce((s, m) => s + (m.cats.get(cat) ?? 0), 0) / 3;
    if (avg > 0 && amount > avg * 1.5 && amount - avg > 100_000) {
      const change = pct(amount - avg, avg);
      advanced.push({ id: `cat-spike-${cat}`, severity: "warning", advanced: true, title: `Unusually high spending on ${cat}`, message: `${cat} is at ${fmt(amount)} this month — ${change}% above your 3-month average of ${fmt(Math.round(avg))}.`, metric: `+${change}%` });
    }
  }

  // Dominant category
  if (now.expense > 0) {
    const top = [...now.cats.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const share = pct(top[1], now.expense);
      if (share >= 40 && top[0] !== "Rent" && top[0] !== "EMI / Debt") {
        advanced.push({ id: "top-category", severity: "info", advanced: true, title: `${top[0]} dominates your spending`, message: `${share}% of this month's expenses went to ${top[0]}. Setting a monthly cap here would have the biggest impact.`, metric: `${share}%` });
      }
    }
  }

  // Consistent saver
  const positiveMonths = history.filter((m) => m.income > 0 && m.income > m.expense).length;
  if (positiveMonths === 3) {
    const avgSave = Math.round(history.reduce((s, m) => s + (m.income - m.expense), 0) / 3);
    advanced.push({ id: "consistent-saver", severity: "positive", advanced: true, title: "You save consistently", message: `You saved money in each of the last 3 months — about ${fmt(avgSave)} per month on average.` });
    const avgRate = pct(history.reduce((s, m) => s + (m.income - m.expense), 0), history.reduce((s, m) => s + m.income, 0));
    if (avgRate >= 25) {
      const extra = Math.round(avgSave * 0.1);
      advanced.push({ id: "increase-savings", severity: "info", advanced: true, title: "Room to automate more savings", message: `With a ${avgRate}% average savings rate, an automatic transfer of ${fmt(extra)} more per month into a goal is likely comfortable.` });
    }
  } else if (history.filter((m) => m.income > 0).length >= 2 && positiveMonths === 0) {
    advanced.push({ id: "negative-streak", severity: "critical", advanced: true, title: "Expenses exceeded income recently", message: "Your expenses were higher than income in recent months. Build a monthly budget per category to stop the drain." });
  }

  // Goal feasibility
  const today = todayUTC();
  const avgNet = Math.round(history.reduce((s, m) => s + (m.income - m.expense), 0) / 3);
  for (const g of goals) {
    const remaining = g.targetAmount - g.currentAmount;
    if (remaining <= 0) continue;
    const monthsLeft = Math.max(0, (new Date(g.targetDate).getTime() - today.getTime()) / (30.44 * 86400000));
    if (monthsLeft < 0.5) {
      advanced.push({ id: `goal-overdue-${g._id}`, severity: "warning", advanced: true, title: `"${g.name}" deadline reached`, message: `The target date has arrived with ${fmt(remaining)} still to save. Consider extending the date or increasing contributions.` });
      continue;
    }
    const needed = Math.round(remaining / monthsLeft);
    if (avgNet > 0 && needed > avgNet) {
      advanced.push({ id: `goal-risk-${g._id}`, severity: "warning", advanced: true, title: `"${g.name}" may miss its target date`, message: `You need about ${fmt(needed)}/month, but your average monthly surplus is ${fmt(avgNet)}.`, metric: fmt(needed) });
    } else if (needed > 0) {
      advanced.push({ id: `goal-plan-${g._id}`, severity: "info", advanced: true, title: `Plan for "${g.name}"`, message: `Save about ${fmt(needed)} per month to reach it by ${new Date(g.targetDate).toISOString().slice(0, 10)}.`, metric: fmt(needed) });
    }
  }

  // Debt payoff projection + highest interest
  if (debts.length) {
    const highest = [...debts].sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0))[0];
    if (highest.interestRate >= 12) {
      advanced.push({ id: "high-interest", severity: "warning", advanced: true, title: `Prioritise "${highest.title}"`, message: `At ${highest.interestRate}% p.a. it is your costliest debt. Prepaying it first (avalanche method) saves the most interest.` });
    }
    const maxMonths = Math.max(...debts.map((d) => (d.emiAmount ? Math.ceil(d.remainingAmount / d.emiAmount) : 0)));
    if (maxMonths > 0) {
      advanced.push({ id: "debt-free", severity: "info", advanced: true, title: "Debt-free projection", message: `At current EMIs you will be debt-free in about ${maxMonths} month${maxMonths === 1 ? "" : "s"} (${monthLabel(shiftMonth(cur, maxMonths))}).` });
    }
  }

  // Expense pattern change: large single transaction
  const big = largest[0] as unknown as { title: string; amount: number; category: string } | undefined;
  if (big && curExpenseCount >= 3 && now.expense > 0 && big.amount >= now.expense * 0.35) {
    advanced.push({ id: "large-txn", severity: "info", advanced: true, title: "One large expense this month", message: `"${big.title}" (${fmt(big.amount)}, ${big.category}) is ${pct(big.amount, now.expense)}% of this month's spending.` });
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  const sorted = (list: Insight[]) => list.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    insights: sorted(opts.advanced ? [...insights, ...advanced] : insights),
    lockedCount: opts.advanced ? 0 : advanced.length,
    generatedAt: new Date().toISOString(),
  };
}
