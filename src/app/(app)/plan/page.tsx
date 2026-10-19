"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Bot, Check, Crown, FileText, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardHeader, ErrorState, PageHeader, Progress, Skeleton, cn } from "@/components/ui";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { limitLabel, usagePct, type PlanDef, type PlanId } from "@/lib/plans";
import { buyPlan } from "@/lib/checkout-client";
import type { AngelQuotaDTO } from "@/lib/angel/types";

interface PlanResp {
  current: PlanDef;
  usage: { incomes: number; expenses: number; debts: number; goals: number; financeRecords: number };
  plans: PlanDef[];
}
interface Option {
  plan: PlanId;
  amount: number;
  available: boolean;
  mode?: "new" | "renew" | "upgrade";
  creditDays?: number;
  periodEnd?: string;
  reason?: string;
}
interface BillingResp {
  enabled: boolean;
  mode: "live" | "test" | "off";
  current: { id: PlanId; name: string; expiresAt: string | null; source: string | null };
  options: Option[];
  history: { id: string; plan: PlanId; amount: number; status: string; paidAt: string; periodStart: string; periodEnd: string; invoiceNo: string; paymentId: string; method: string | null; creditDays: number }[];
}

const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const daysLeft = (d: string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000));

export default function PlanPage() {
  const { data, error, isLoading, mutate } = useSWR<PlanResp>("/api/plan");
  const billing = useSWR<BillingResp>("/api/billing");
  const quota = useSWR<{ quota: AngelQuotaDTO }>("/api/angel/quota");
  const { refresh, isAdmin } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<PlanId | null>(null);

  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const { current, usage } = data;
  const recPct = usagePct(usage.financeRecords, current.maxFinanceRecords);
  const goalPct = usagePct(usage.goals, current.maxGoals);
  const b = billing.data;
  const q = quota.data?.quota;
  const exp = b?.current.expiresAt;

  const buy = async (plan: PlanId) => {
    if (plan === "free") return;
    setBusy(plan);
    try {
      const r = await buyPlan(plan);
      if (r.status === "paid") toast.success("Payment successful 🎉", r.message);
      else if (r.status === "pending") toast.info("Payment received", r.message);
      else if (r.status === "failed") toast.error("Payment", r.message);
      if (r.status === "paid" || r.status === "pending") {
        refresh();
        void mutate();
        void billing.mutate();
        void quota.mutate();
      }
    } catch (e) {
      toast.error("Couldn't start payment", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Plan & billing" subtitle="Limits are enforced on the server. Payments are processed securely by Razorpay." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glow p-5 lg:col-span-1">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <p className="text-sm text-muted">Current plan</p>
          </div>
          <p className="mt-2 text-3xl font-semibold">{current.name}</p>
          {exp && !isAdmin ? (
            <p className="mt-1 text-sm text-muted">
              Active until <b className="text-fg">{fmt(exp)}</b> · {daysLeft(exp)} days left
            </p>
          ) : current.id !== "free" ? (
            <p className="mt-1 text-sm text-muted">{isAdmin ? "Admins always have every feature." : "Given by an administrator — no end date."}</p>
          ) : (
            <p className="mt-1 text-sm text-muted">Free forever. Upgrade any time.</p>
          )}
          <ul className="mt-4 space-y-1.5 text-sm">
            <li className="flex justify-between">
              <span className="text-muted">Angel AI</span>
              <span>{current.angel.credits === null ? "Unlimited" : `${current.angel.credits} credits / ${current.angel.windowHours} h`}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Advanced insights</span>
              <span>{current.advancedInsights ? "Enabled" : "—"}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Finance records</span>
              <span className="tabular">{limitLabel(current.maxFinanceRecords)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Savings goals</span>
              <span className="tabular">{limitLabel(current.maxGoals)}</span>
            </li>
          </ul>
        </Card>
        <Card className="space-y-5 p-5 lg:col-span-2">
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-primary" /> Angel AI credits
              </span>
              <span className="tabular text-muted">{!q ? "…" : q.limit === null ? "Unlimited" : `${q.remaining} of ${q.limit} left`}</span>
            </div>
            {q && q.limit !== null && <Progress value={usagePct(q.used, q.limit)} tone={q.remaining === 0 ? "danger" : (q.remaining ?? 0) <= q.limit * 0.2 ? "warning" : "primary"} />}
            <p className="mt-1.5 text-xs text-muted">
              {q && q.limit !== null
                ? q.resetAt
                  ? `Refills ${new Date(q.resetAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} (${q.windowHours}-hour window). Simple questions cost 1 credit; long questions, web look-ups and actions cost a bit more.`
                  : `Your ${q.windowHours}-hour window starts with your next message.`
                : "No limits on Angel."}
            </p>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>Finance records</span>
              <span className="tabular text-muted">
                {usage.financeRecords.toLocaleString("en-IN")} / {limitLabel(current.maxFinanceRecords)}
              </span>
            </div>
            {!current.unlimited && <Progress value={recPct} tone={recPct >= 100 ? "danger" : recPct >= 80 ? "warning" : "primary"} />}
            <p className="mt-1.5 text-xs text-muted">
              {usage.incomes} income · {usage.expenses} expenses · {usage.debts} debts
            </p>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>Savings goals</span>
              <span className="tabular text-muted">
                {usage.goals} / {limitLabel(current.maxGoals)}
              </span>
            </div>
            {!current.unlimited && <Progress value={goalPct} tone={goalPct >= 100 ? "danger" : goalPct >= 80 ? "warning" : "primary"} />}
          </div>
        </Card>
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Plans</h2>
        {b?.mode === "test" && <Badge tone="warning">Test mode — no real money is charged</Badge>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => {
          const opt = b?.options.find((o) => o.plan === p.id);
          const isCurrent = p.id === current.id;
          const label = !opt ? "" : opt.mode === "renew" ? `Renew — ₹${opt.amount}` : opt.mode === "upgrade" ? `Upgrade — ₹${opt.amount}` : `Get ${p.name} — ₹${opt.amount}`;
          return (
            <Card key={p.id} className={cn("flex flex-col p-5", isCurrent && "border-primary/50 ring-1 ring-primary/30", p.id === "pro" && !isCurrent && "border-primary/30")}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-semibold">{p.name}</p>
                {isCurrent ? <Badge tone="primary">Current</Badge> : p.id === "pro" ? <Badge tone="success">Popular</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-muted">{p.tagline}</p>
              <p className="mt-3 text-2xl font-semibold">
                {p.priceInr === 0 ? "₹0" : `₹${p.priceInr}`}
                {p.priceInr > 0 && <span className="text-sm font-normal text-muted"> /month</span>}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> <span className="text-muted">{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {p.id === "free" ? (
                  <p className="rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-center text-xs text-muted">{isCurrent ? "You are on this plan." : "Included for everyone."}</p>
                ) : isAdmin ? (
                  <p className="rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-center text-xs text-muted">Admins have every feature.</p>
                ) : !b ? (
                  <Skeleton className="h-10" />
                ) : !b.enabled ? (
                  <p className="rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-center text-xs text-muted">Online payments are being set up — please check back soon.</p>
                ) : opt?.available ? (
                  <>
                    <Button className="w-full" variant={p.id === "pro" || opt.mode === "renew" ? "primary" : "secondary"} loading={busy === p.id} disabled={!!busy} onClick={() => void buy(p.id)}>
                      {opt.mode === "upgrade" || opt.mode === "renew" ? <Sparkles className="h-4 w-4" /> : null} {label}
                    </Button>
                    <p className="mt-2 text-center text-[11px] text-muted">
                      {opt.mode === "renew" ? `Adds 30 days → until ${fmt(opt.periodEnd!)}` : opt.creditDays ? `+${opt.creditDays} bonus days from your current plan · until ${fmt(opt.periodEnd!)}` : `30 days · until ${fmt(opt.periodEnd!)} · no auto-renew`}
                    </p>
                  </>
                ) : (
                  <p className="rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-center text-xs text-muted">{opt?.reason ?? "—"}</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1">
          <Lock className="h-3.5 w-3.5" /> UPI, cards, netbanking & wallets via Razorpay
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" /> We never see or store your card / UPI details
        </span>
        <Link href="/refund-policy" className="hover:text-fg hover:underline">
          Refund & cancellation policy
        </Link>
      </p>

      {b && b.history.length > 0 && (
        <Card className="mt-8">
          <CardHeader title="Payment history" subtitle="Invoices can be printed or saved as PDF." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-5 py-2 text-right font-medium">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {b.history.map((h) => (
                  <tr key={h.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2.5">{fmt(h.paidAt)}</td>
                    <td className="px-3 py-2.5 capitalize">{h.plan}</td>
                    <td className="px-3 py-2.5 text-muted">
                      {h.periodStart ? fmt(h.periodStart) : "—"} → {h.periodEnd ? fmt(h.periodEnd) : "—"}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      ₹{h.amount.toLocaleString("en-IN")} {h.status === "refunded" && <Badge tone="warning">Refunded</Badge>}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Link href={`/plan/invoice/${h.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <FileText className="h-3.5 w-3.5" /> {h.invoiceNo}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
