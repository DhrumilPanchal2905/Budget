"use client";

import Link from "next/link";
import useSWR from "swr";
import { Activity, Bot, Crown, Database, Globe, HeartPulse, IndianRupee, Mail, Radio, ScrollText, TrendingDown, TrendingUp, UserCheck, UserPlus, UserX, Users, Wallet } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { useSession } from "@/components/session";
import { StatCard } from "@/components/stat";
import { SimpleBars } from "@/components/charts-lazy";
import { Card, CardHeader, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { timeAgo } from "@/lib/client";

interface Stats {
  users: { total: number; active: number; inactive: number; free: number; plus: number; pro: number; unlimited: number; admins: number; activeLast30: number };
  collections: Record<string, number>;
  finance: { totalIncome: number; totalExpense: number; avgIncomePerUser: number };
  signups: { label: string; users: number }[];
  recent: { id: string; action: string; actorEmail: string; resource: string | null; createdAt: string }[];
  live?: { onlineNow: number; visitors24h: number; newUsers7d: number; unverified: number };
  angel?: { conversations: number; questions7d: number };
  revenue?: { all: number; payments: number; month: number; monthPayments: number };
  email?: { ready: boolean; source: string; from: string };
}

interface MyDash {
  monthLabel: string;
  summary: { income: number; expense: number; balance: number; totalSavings: number; freeBalance: number; goalSaved: number; totalDebt: number; savingsRate: number };
  health: { score: number | null };
}

/** The admin's OWN money (admins are users too) — same numbers as their dashboard. */
function MyFinances() {
  const { money, can } = useSession();
  const { data } = useSWR<MyDash>(can("finance.read") ? "/api/dashboard" : null);
  if (!can("finance.read")) return null;
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Your own finances</span>} subtitle={data ? data.monthLabel : "This month"} action={<Link href="/dashboard" className="text-xs font-medium text-primary hover:underline">My dashboard</Link>} />
      {!data ? (
        <div className="p-5"><Skeleton className="h-16" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
          <div><p className="text-xs text-muted">Income</p><p className="tabular font-semibold text-success">{money(data.summary.income, true)}</p></div>
          <div><p className="text-xs text-muted">Expenses</p><p className="tabular font-semibold">{money(data.summary.expense, true)}</p></div>
          <div><p className="text-xs text-muted">Left this month</p><p className="tabular font-semibold">{money(data.summary.balance, true)}</p></div>
          <div><p className="text-xs text-muted">Total balance</p><p className="tabular font-semibold">{money(data.summary.totalSavings, true)}</p></div>
          <div><p className="text-xs text-muted">Health</p><p className="tabular font-semibold">{data.health.score ?? "—"}/100</p></div>
        </div>
      )}
    </Card>
  );
}

const LABELS: Record<string, string> = {
  users: "Users",
  sessions: "Sessions",
  incomes: "Income records",
  expenses: "Expense records",
  debts: "Debt records",
  goals: "Goals",
  notifications: "Notifications",
  auditlogs: "Audit logs",
  pushsubscriptions: "Push subscriptions",
  realtimeevents: "Realtime events",
  ratelimits: "Rate-limit buckets",
  passkeys: "Passkeys (device login)",
  webauthnchallenges: "Passkey challenges",
  angelconversations: "Angel AI chats",
  angelmessages: "Angel AI messages",
  budgets: "Budgets",
  goalcontributions: "Goal contributions",
  visits: "Website visits",
  emailotps: "Pending email codes",
  appsettings: "App settings",
};

function Inner() {
  const { money, can } = useSession();
  const { data, error, isLoading, mutate } = useSWR<Stats>("/api/admin/stats");
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !data)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  const u = data.users;
  const total = u.free + u.plus + u.pro + (u.unlimited ?? 0);
  const planData = [
    { category: "Free", total: u.free, share: total ? Math.round((u.free / total) * 1000) / 10 : 0 },
    { category: "Plus", total: u.plus, share: total ? Math.round((u.plus / total) * 1000) / 10 : 0 },
    { category: "Pro", total: u.pro, share: total ? Math.round((u.pro / total) * 1000) / 10 : 0 },
    { category: "Unlimited", total: u.unlimited ?? 0, share: total ? Math.round(((u.unlimited ?? 0) / total) * 1000) / 10 : 0 },
  ];
  return (
    <div className="space-y-4">
      {data.live && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <Link href="/admin/visitors"><StatCard label="Online now" value={data.live.onlineNow} icon={<Radio className="h-4 w-4 text-success" />} tone={data.live.onlineNow ? "success" : "default"} hint={`${data.live.visitors24h} visitors in 24h →`} /></Link>
          <StatCard label="New users (7 days)" value={data.live.newUsers7d} icon={<UserPlus className="h-4 w-4" />} hint={data.live.unverified ? `${data.live.unverified} unverified` : "all verified"} />
          <StatCard label="Angel AI" value={data.angel?.questions7d ?? 0} icon={<Bot className="h-4 w-4" />} hint={`questions in 7 days · ${data.angel?.conversations ?? 0} chats`} />
          <Link href="/admin/payments"><StatCard label="Revenue this month" value={`₹${(data.revenue?.month ?? 0).toLocaleString("en-IN")}`} icon={<IndianRupee className="h-4 w-4 text-success" />} tone={(data.revenue?.month ?? 0) > 0 ? "success" : "default"} hint={`${data.revenue?.monthPayments ?? 0} payments · ₹${(data.revenue?.all ?? 0).toLocaleString("en-IN")} all time →`} /></Link>
          <Link href="/admin/settings"><StatCard label="OTP email" value={data.email?.ready ? "Working" : "Not set up"} icon={<Mail className="h-4 w-4" />} tone={data.email?.ready ? "success" : "danger"} hint={data.email?.ready ? data.email.from : "Add Gmail App Password →"} /></Link>
        </div>
      )}
      <MyFinances />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total users" value={u.total.toLocaleString("en-IN")} icon={<Users className="h-4 w-4" />} hint={`${u.admins} admin${u.admins === 1 ? "" : "s"}`} />
        <StatCard label="Active users" value={u.active.toLocaleString("en-IN")} icon={<UserCheck className="h-4 w-4" />} hint={`${u.activeLast30} signed in last 30d`} />
        <StatCard label="Inactive (disabled)" value={u.inactive.toLocaleString("en-IN")} icon={<UserX className="h-4 w-4" />} />
        <StatCard label="Paid / unlimited plans" value={(u.plus + u.pro + (u.unlimited ?? 0)).toLocaleString("en-IN")} icon={<Crown className="h-4 w-4" />} hint={`${u.plus} Plus · ${u.pro} Pro · ${u.unlimited ?? 0} Unlimited · ${u.free} Free`} />
        <StatCard label="Income records" value={(data.collections.incomes ?? 0).toLocaleString("en-IN")} />
        <StatCard label="Expense records" value={(data.collections.expenses ?? 0).toLocaleString("en-IN")} />
        <StatCard label="Debt records" value={(data.collections.debts ?? 0).toLocaleString("en-IN")} />
        <StatCard label="Goals" value={(data.collections.goals ?? 0).toLocaleString("en-IN")} />
        <StatCard label="Notifications" value={(data.collections.notifications ?? 0).toLocaleString("en-IN")} />
        <StatCard label="Audit logs" value={(data.collections.auditlogs ?? 0).toLocaleString("en-IN")} icon={<ScrollText className="h-4 w-4" />} />
        <StatCard label="Platform income tracked" value={money(data.finance.totalIncome, true)} icon={<IndianRupee className="h-4 w-4" />} hint={`avg ${money(data.finance.avgIncomePerUser, true)} / user`} />
        <StatCard label="Platform expenses tracked" value={money(data.finance.totalExpense, true)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="New users" subtitle="Sign-ups per month (last 12 months)" />
          <div className="px-3 pb-4 pt-4 sm:px-5">
            <SimpleBars data={data.signups} dataKey="users" name="New users" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Plan distribution" />
          <div className="px-5 pb-5 pt-4">
            <PlanDonut data={planData} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-success" /> Live activity</span>} subtitle="Updates in realtime" action={can("audit.view") ? <Link href="/admin/audit" className="text-xs font-medium text-primary hover:underline">Audit log</Link> : null} />
          <ul className="divide-y divide-border px-5 pb-3 pt-2">
            {!can("audit.view") ? (
              <p className="py-6 text-center text-sm text-muted">Requires audit.view permission.</p>
            ) : !data.recent.length ? (
              <p className="py-6 text-center text-sm text-muted">No activity yet.</p>
            ) : (
              data.recent.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{a.action}</p>
                    <p className="truncate text-xs text-muted">{a.actorEmail}{a.resource ? ` · ${a.resource}` : ""}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">{timeAgo(a.createdAt)}</span>
                </li>
              ))
            )}
          </ul>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Database className="h-4 w-4 text-muted" /> Collections</span>} action={can("database.view") ? <Link href="/admin/database" className="text-xs font-medium text-primary hover:underline">Manage</Link> : null} />
          <ul className="divide-y divide-border px-5 pb-3 pt-2">
            {Object.entries(data.collections).map(([k, v]) => (
              <li key={k} className="flex justify-between py-2 text-sm">
                <span className="text-muted">{LABELS[k] ?? k}</span>
                <span className="tabular font-medium">{v.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function PlanDonut({ data }: { data: { category: string; total: number; share: number }[] }) {
  // Re-use donut, but counts are not currency: render a simple list with bars instead of money labels.
  const total = data.reduce((s, d) => s + d.total, 0);
  if (!total) return <p className="py-10 text-center text-sm text-muted">No users yet</p>;
  const colors = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
  return (
    <div className="space-y-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
        {data.map((d, i) => (d.total ? <div key={d.category} style={{ width: `${(d.total / total) * 100}%`, background: colors[i] }} className="h-full border-r-2 border-surface last:border-0" /> : null))}
      </div>
      <ul className="space-y-2">
        {data.map((d, i) => (
          <li key={d.category} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors[i] }} />
            <span className="flex-1 text-muted">{d.category}</span>
            <span className="tabular font-medium">{d.total.toLocaleString("en-IN")}</span>
            <span className="tabular w-12 text-right text-xs text-muted">{d.share}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequirePerm admin perm="users.view">
      <PageHeader title="Admin overview" subtitle="Platform health, users and activity — live." />
      <Inner />
    </RequirePerm>
  );
}
