"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { useSession } from "@/components/session";
import { StatCard } from "@/components/stat";
import { CategoryComparison, CategoryDonut, IncomeExpenseBars, SAVINGS_COLOR, SERIES, SingleLine } from "@/components/charts-lazy";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Progress, Skeleton, Tabs } from "@/components/ui";
import { fmtDate, monthStr, qs } from "@/lib/client";

interface Cat {
  category: string;
  total: number;
  count: number;
  share: number;
}
interface Monthly {
  month: string;
  label: string;
  income: number;
  expense: number;
  savings: number;
  balance: number;
  savingsRate: number;
  emiPaid: number;
  emiDue: number;
  debtRemaining: number;
  goalSaved: number;
  previous: { income: number; expense: number; savings: number; incomeChange: number | null; expenseChange: number | null };
  expenseByCategory: Cat[];
  incomeByCategory: Cat[];
  categoryComparison: { category: string; current: number; previous: number }[];
  daily: { label: string; income: number; expense: number; balance: number }[];
}
interface Overall {
  totals: {
    income: number;
    expense: number;
    savings: number;
    savingsRate: number;
    debtRemaining: number;
    totalBorrowed: number;
    debtPaid: number;
    emiMonthly: number;
    goalSaved: number;
    goalTarget: number;
    goalsAchieved: number;
    goalCount: number;
    avgMonthlyIncome: number;
    avgMonthlyExpense: number;
  };
  monthly: { label: string; income: number; expense: number; savings: number; cumulativeSavings: number; savingsRate: number }[];
  expenseByCategory: Cat[];
  incomeByCategory: Cat[];
  debts: { id: string; title: string; status: string; total: number; remaining: number; paid: number; emi: number; progress: number; monthsLeft: number }[];
  goals: { id: string; name: string; status: string; target: number; current: number; progress: number; targetDate: string }[];
}

function shift(m: string, d: number) {
  const [y, mo] = m.split("-").map(Number);
  return monthStr(new Date(y, mo - 1 + d, 1));
}

function MonthlyView() {
  const { money } = useSession();
  const [month, setMonth] = useState(monthStr());
  const { data, error, isLoading, mutate } = useSWR<Monthly>(`/api/analytics${qs({ view: "monthly", month })}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="secondary" onClick={() => setMonth((m) => shift(m, -1))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface-2/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="Month"
        />
        <Button size="icon" variant="secondary" onClick={() => setMonth((m) => shift(m, 1))} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
        {month !== monthStr() && (
          <Button size="sm" variant="ghost" onClick={() => setMonth(monthStr())}>
            This month
          </Button>
        )}
      </div>

      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : !data || isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
          <Skeleton className="h-80 sm:col-span-2 lg:col-span-4" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Income" value={money(data.income)} change={data.previous.incomeChange} hint="vs previous month" />
            <StatCard label="Expenses" value={money(data.expense)} change={data.previous.expenseChange} changeGoodWhenUp={false} hint="vs previous month" />
            <StatCard label="Net savings" value={money(data.savings)} tone={data.savings < 0 ? "danger" : "success"} hint={data.income ? `${data.savingsRate}% of income` : undefined} />
            <StatCard label="EMI paid / due" value={money(data.emiPaid)} hint={`of ${money(data.emiDue)} monthly EMIs`} />
            <StatCard label="Debt remaining" value={money(data.debtRemaining)} hint="All active loans" />
            <StatCard label="Goal savings" value={money(data.goalSaved)} hint="Saved across goals" />
            <StatCard label="Last month income" value={money(data.previous.income)} />
            <StatCard label="Last month expenses" value={money(data.previous.expense)} />
          </div>

          <Card>
            <CardHeader title={`Daily income & expenses — ${data.label}`} subtitle="Per day of the month" />
            <div className="px-3 pb-4 pt-4 sm:px-5">
              <IncomeExpenseBars data={data.daily} height={260} />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Running balance" subtitle="Cumulative income − expenses through the month" />
              <div className="px-3 pb-4 pt-4 sm:px-5">
                <SingleLine data={data.daily} dataKey="balance" name="Balance" color={SAVINGS_COLOR} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Expenses by category" />
              <div className="px-5 pb-5 pt-4">
                <CategoryDonut data={data.expenseByCategory} height={190} emptyText="No expenses this month" />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Category comparison" subtitle="This month vs previous month" />
              <div className="px-3 pb-4 pt-4 sm:px-5">
                {data.categoryComparison.length ? <CategoryComparison data={data.categoryComparison} /> : <EmptyState title="No expenses to compare" />}
              </div>
            </Card>
            <Card>
              <CardHeader title="Income sources" />
              <div className="px-5 pb-5 pt-4">
                <CategoryDonut data={data.incomeByCategory} height={190} emptyText="No income this month" />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function OverallView() {
  const { money } = useSession();
  const { data, error, isLoading, mutate } = useSWR<Overall>("/api/analytics?view=overall");
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (!data || isLoading)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total income" value={money(t.income)} hint={`avg ${money(t.avgMonthlyIncome, true)}/month`} />
        <StatCard label="Total expenses" value={money(t.expense)} hint={`avg ${money(t.avgMonthlyExpense, true)}/month`} />
        <StatCard label="Total savings" value={money(t.savings)} tone={t.savings < 0 ? "danger" : "success"} hint={t.income ? `${t.savingsRate}% savings rate` : undefined} />
        <StatCard label="Total debt" value={money(t.debtRemaining)} hint={`${money(t.debtPaid, true)} repaid of ${money(t.totalBorrowed, true)}`} />
        <StatCard label="Monthly EMIs" value={money(t.emiMonthly)} />
        <StatCard label="Goal savings" value={money(t.goalSaved)} hint={t.goalTarget ? `of ${money(t.goalTarget, true)}` : undefined} />
        <StatCard label="Goals achieved" value={`${t.goalsAchieved} / ${t.goalCount}`} />
        <StatCard label="Savings rate" value={t.income ? `${t.savingsRate}%` : "—"} tone={t.savingsRate >= 20 ? "success" : t.savingsRate < 0 ? "danger" : "default"} />
      </div>

      <Card>
        <CardHeader title="Monthly income vs expenses" subtitle="Long-term trend" />
        <div className="px-3 pb-4 pt-4 sm:px-5">
          <IncomeExpenseBars data={data.monthly} height={300} showSavings />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Savings trend" subtitle="Cumulative net savings over time" />
          <div className="px-3 pb-4 pt-4 sm:px-5">
            <SingleLine data={data.monthly} dataKey="cumulativeSavings" name="Cumulative savings" color={SAVINGS_COLOR} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Monthly expense trend" />
          <div className="px-3 pb-4 pt-4 sm:px-5">
            <SingleLine data={data.monthly} dataKey="expense" name="Expenses" color={SERIES[1]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Monthly income trend" />
          <div className="px-3 pb-4 pt-4 sm:px-5">
            <SingleLine data={data.monthly} dataKey="income" name="Income" color={SERIES[0]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Expense categories" subtitle="All time" />
          <div className="px-5 pb-5 pt-4">
            <CategoryDonut data={data.expenseByCategory} height={190} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Debt / EMI progress" />
          <div className="space-y-4 px-5 pb-5 pt-4">
            {!data.debts.length ? (
              <EmptyState title="No debts tracked" />
            ) : (
              data.debts.map((d) => (
                <div key={d.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{d.title}</span>
                    {d.status === "closed" ? <Badge tone="success">Paid off</Badge> : <span className="tabular text-xs text-muted">{d.monthsLeft} months left</span>}
                  </div>
                  <Progress value={d.progress} tone={d.status === "closed" ? "success" : "primary"} />
                  <p className="tabular mt-1 text-xs text-muted">
                    {money(d.paid, true)} paid · {money(d.remaining, true)} remaining · EMI {money(d.emi, true)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Savings goal progress" />
          <div className="space-y-4 px-5 pb-5 pt-4">
            {!data.goals.length ? (
              <EmptyState title="No goals yet" />
            ) : (
              data.goals.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{g.name}</span>
                    <span className="tabular text-xs text-muted">{g.progress}%</span>
                  </div>
                  <Progress value={g.progress} tone={g.status === "achieved" ? "success" : "primary"} />
                  <p className="tabular mt-1 text-xs text-muted">
                    {money(g.current, true)} of {money(g.target, true)} · by {fmtDate(g.targetDate)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [view, setView] = useState<"monthly" | "overall">("monthly");
  return (
    <RequirePerm perm={["finance.read", "reports.view"]}>
      <PageHeader
        title="Analytics"
        subtitle="Accurate, server-calculated reports from your real data."
        actions={<Tabs value={view} onChange={setView} items={[{ value: "monthly", label: "Monthly" }, { value: "overall", label: "Overall" }]} />}
      />
      {view === "monthly" ? <MonthlyView /> : <OverallView />}
    </RequirePerm>
  );
}
