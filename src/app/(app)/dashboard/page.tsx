"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, HeartPulse, Landmark, PiggyBank, Plus, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useSession } from "@/components/session";
import { RequirePerm } from "@/components/guard";
import { StatCard } from "@/components/stat";
import { TrendArea, CategoryDonut } from "@/components/charts";
import { InsightRow, type InsightView } from "@/components/insight-card";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Progress, Skeleton, cn } from "@/components/ui";
import { fmtDate, timeAgo } from "@/lib/client";

interface Dashboard {
  month: string;
  monthLabel: string;
  summary: {
    income: number;
    expense: number;
    balance: number;
    savingsRate: number;
    incomeChange: number | null;
    expenseChange: number | null;
    totalSavings: number;
    goalSaved: number;
    goalTarget: number;
    totalDebt: number;
    emiMonthly: number;
    emiPaidThisMonth: number;
    activeDebts: number;
  };
  health: { score: number | null; savingsRate: number | null; emiRatio: number | null; expenseRatio: number | null; goalProgress: number | null };
  trend: { label: string; income: number; expense: number; savings: number }[];
  expenseByCategory: { category: string; total: number; share: number }[];
  upcoming: { id: string; title: string; emi: number; dueDate: string; daysLeft: number }[];
  goals: { id: string; name: string; status: string; target: number; current: number; progress: number; targetDate: string }[];
  recent: { id: string; kind: "income" | "expense"; title: string; category: string; amount: number; date: string }[];
  notifications: { unread: number; latest: { id: string; title: string; message: string; read: boolean; createdAt: string; link: string | null }[] };
  insights: InsightView[];
}

function HealthGauge({ score }: { score: number | null }) {
  const v = score ?? 0;
  const r = 52;
  const c = Math.PI * r;
  const tone = score === null ? "rgb(var(--muted))" : v >= 70 ? "rgb(var(--success))" : v >= 45 ? "rgb(var(--warning))" : "rgb(var(--danger))";
  const label = score === null ? "No data" : v >= 70 ? "Healthy" : v >= 45 ? "Fair" : "Needs attention";
  return (
    <div className="relative mx-auto w-[140px]">
      <svg viewBox="0 0 120 68" className="w-full" aria-label={`Financial health ${score ?? "unknown"} of 100`}>
        <path d="M8 60 A52 52 0 0 1 112 60" fill="none" stroke="rgb(var(--surface-2))" strokeWidth="10" strokeLinecap="round" />
        <path d="M8 60 A52 52 0 0 1 112 60" fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} style={{ transition: "stroke-dasharray .6s ease" }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="tabular text-2xl font-semibold leading-none">{score ?? "—"}</p>
        <p className="mt-1 text-[11px] text-muted">{label}</p>
      </div>
    </div>
  );
}

function Indicator({ label, value, good, suffix = "%" }: { label: string; value: number | null; good: boolean | null; suffix?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={cn("tabular font-medium", good === null ? "" : good ? "text-success" : "text-warning")}>{value === null ? "—" : `${value}${suffix}`}</span>
    </div>
  );
}

function DashboardInner() {
  const { user, money, can } = useSession();
  const { data, error, isLoading, mutate } = useSWR<Dashboard>("/api/dashboard");

  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const s = data.summary;
  const h = data.health;
  const firstName = user.name.split(" ")[0];
  const hasData = s.income || s.expense || data.recent.length || data.goals.length || s.activeDebts;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Hi, ${firstName} 👋`}
        subtitle={`Here's your financial overview for ${data.monthLabel}.`}
        actions={
          <>
            {can("expense.create") && (
              <Link href="/expenses?new=1">
                <Button variant="secondary" size="md">
                  <Plus className="h-4 w-4" /> Expense
                </Button>
              </Link>
            )}
            {can("income.create") && (
              <Link href="/income?new=1">
                <Button size="md">
                  <Plus className="h-4 w-4" /> Income
                </Button>
              </Link>
            )}
          </>
        }
      />

      {!hasData && (
        <Card className="glow overflow-hidden p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Let&apos;s set up your finances</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">Add your salary, a few expenses and any EMIs. Every chart, total and insight on this page is calculated from your real data and updates instantly.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/income?new=1"><Button><TrendingUp className="h-4 w-4" /> Add salary</Button></Link>
            <Link href="/expenses?new=1"><Button variant="secondary"><TrendingDown className="h-4 w-4" /> Add expense</Button></Link>
            <Link href="/goals?new=1"><Button variant="secondary"><Target className="h-4 w-4" /> Create goal</Button></Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Income this month" value={money(s.income)} icon={<TrendingUp className="h-4 w-4" />} change={s.incomeChange} hint="vs last month" />
        <StatCard label="Expenses this month" value={money(s.expense)} icon={<TrendingDown className="h-4 w-4" />} change={s.expenseChange} changeGoodWhenUp={false} hint="vs last month" />
        <StatCard label="Remaining balance" value={money(s.balance)} icon={<Wallet className="h-4 w-4" />} tone={s.balance < 0 ? "danger" : "default"} hint={s.income ? `${s.savingsRate}% savings rate` : "Add income to see rate"} />
        <StatCard label="Total savings" value={money(s.totalSavings)} icon={<PiggyBank className="h-4 w-4" />} tone={s.totalSavings < 0 ? "danger" : "default"} hint="Lifetime income − expenses" />
        <StatCard label="Goal savings" value={money(s.goalSaved)} icon={<Target className="h-4 w-4" />} hint={s.goalTarget ? `of ${money(s.goalTarget, true)} target` : "No goals yet"} />
        <StatCard label="Total debt" value={money(s.totalDebt)} icon={<Landmark className="h-4 w-4" />} hint={`${s.activeDebts} active loan${s.activeDebts === 1 ? "" : "s"}`} />
        <StatCard label="EMI obligations" value={money(s.emiMonthly)} icon={<CalendarClock className="h-4 w-4" />} hint={`${money(s.emiPaidThisMonth, true)} paid this month`} />
        <StatCard label="Health score" value={h.score === null ? "—" : `${h.score}/100`} icon={<HeartPulse className="h-4 w-4" />} tone={h.score === null ? "default" : h.score >= 70 ? "success" : h.score >= 45 ? "warning" : "danger"} hint="Savings, EMI load & goals" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Income vs expenses" subtitle="Last 6 months" action={can("reports.view") ? <Link href="/analytics" className="text-xs font-medium text-primary hover:underline">Full analytics</Link> : null} />
          <div className="px-3 pb-4 pt-4 sm:px-5">
            <TrendArea data={data.trend} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Financial health" subtitle={data.monthLabel} />
          <div className="space-y-4 px-5 pb-5 pt-5">
            <HealthGauge score={h.score} />
            <div className="space-y-2.5 border-t border-border pt-4">
              <Indicator label="Savings rate" value={h.savingsRate} good={h.savingsRate === null ? null : h.savingsRate >= 20} />
              <Indicator label="EMI to income" value={h.emiRatio} good={h.emiRatio === null ? null : h.emiRatio <= 35} />
              <Indicator label="Expense ratio" value={h.expenseRatio} good={h.expenseRatio === null ? null : h.expenseRatio <= 80} />
              <Indicator label="Goal progress" value={h.goalProgress} good={h.goalProgress === null ? null : h.goalProgress >= 50} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Spending by category" subtitle={data.monthLabel} />
          <div className="px-5 pb-5 pt-4">
            <CategoryDonut data={data.expenseByCategory} height={170} emptyText="No expenses this month" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Savings goals" action={<Link href="/goals" className="text-xs font-medium text-primary hover:underline">Manage</Link>} />
          <div className="space-y-4 px-5 pb-5 pt-4">
            {!data.goals.length ? (
              <EmptyState icon={<Target className="h-5 w-5" />} title="No goals yet" message="Create a goal like an emergency fund or a vacation." />
            ) : (
              data.goals.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{g.name}</span>
                    {g.status === "achieved" ? <Badge tone="success">Achieved</Badge> : <span className="tabular text-xs text-muted">{g.progress}%</span>}
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
        <Card>
          <CardHeader title="Upcoming payments" subtitle="EMIs due in the next 30 days" action={<Link href="/debts" className="text-xs font-medium text-primary hover:underline">Debts</Link>} />
          <div className="px-5 pb-4 pt-3">
            {!data.upcoming.length ? (
              <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="Nothing due soon" message="Active EMIs due within 30 days appear here." />
            ) : (
              <ul className="divide-y divide-border">
                {data.upcoming.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.title}</p>
                      <p className="text-xs text-muted">{fmtDate(u.dueDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-sm font-medium">{money(u.emi)}</p>
                      <Badge tone={u.daysLeft < 0 ? "danger" : u.daysLeft <= 3 ? "warning" : "default"}>
                        {u.daysLeft < 0 ? `${Math.abs(u.daysLeft)}d overdue` : u.daysLeft === 0 ? "Today" : `in ${u.daysLeft}d`}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Recent transactions" />
          <div className="px-5 pb-3 pt-2">
            {!data.recent.length ? (
              <EmptyState title="No transactions yet" message="Income and expenses you add will show up here." />
            ) : (
              <ul className="divide-y divide-border">
                {data.recent.map((t) => (
                  <li key={`${t.kind}-${t.id}`} className="flex items-center gap-3 py-2.5">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", t.kind === "income" ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
                      {t.kind === "income" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted">
                        {t.category} · {fmtDate(t.date)}
                      </p>
                    </div>
                    <p className={cn("tabular text-sm font-semibold", t.kind === "income" ? "text-success" : "text-fg")}>
                      {t.kind === "income" ? "+" : "−"}
                      {money(t.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          {can("insights.view") && (
            <Card>
              <CardHeader title="Insights" action={<Link href="/insights" className="text-xs font-medium text-primary hover:underline">See all</Link>} />
              <div className="divide-y divide-border px-5 pb-2 pt-1">
                {data.insights.length ? data.insights.map((i) => <InsightRow key={i.id} insight={i} compact />) : <p className="py-6 text-center text-sm text-muted">No insights yet.</p>}
              </div>
            </Card>
          )}
          {can("notifications.read") && (
            <Card>
              <CardHeader title="Notifications" subtitle={data.notifications.unread ? `${data.notifications.unread} unread` : "All caught up"} action={<Link href="/notifications" className="text-xs font-medium text-primary hover:underline">Open</Link>} />
              <ul className="divide-y divide-border px-5 pb-2 pt-2">
                {data.notifications.latest.length ? (
                  data.notifications.latest.map((n) => (
                    <li key={n.id} className="flex gap-2.5 py-2.5">
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-border" : "bg-primary")} />
                      <div className="min-w-0">
                        <p className="truncate text-sm">{n.title}</p>
                        <p className="text-[11px] text-muted">{timeAgo(n.createdAt)}</p>
                      </div>
                    </li>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-muted">No notifications.</p>
                )}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequirePerm perm="finance.read">
      <DashboardInner />
    </RequirePerm>
  );
}
