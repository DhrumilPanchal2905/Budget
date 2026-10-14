"use client";

import useSWR from "swr";
import { Check, Crown } from "lucide-react";
import { Badge, Card, ErrorState, PageHeader, Progress, Skeleton, cn } from "@/components/ui";
import { limitLabel, usagePct, type PlanDef } from "@/lib/plans";

interface Resp {
  current: PlanDef;
  usage: { incomes: number; expenses: number; debts: number; goals: number; financeRecords: number };
  plans: PlanDef[];
}

export default function PlanPage() {
  const { data, error, isLoading, mutate } = useSWR<Resp>("/api/plan");
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const { current, usage } = data;
  const recPct = usagePct(usage.financeRecords, current.maxFinanceRecords);
  const goalPct = usagePct(usage.goals, current.maxGoals);

  return (
    <>
      <PageHeader title="Plan & usage" subtitle="Limits are enforced on the server for every request." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glow p-5 lg:col-span-1">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <p className="text-sm text-muted">Current plan</p>
          </div>
          <p className="mt-2 text-3xl font-semibold">{current.name}</p>
          <ul className="mt-4 space-y-1.5 text-sm">
            <li className="flex justify-between">
              <span className="text-muted">Advanced insights</span>
              <span>{current.advancedInsights ? "Enabled" : "Disabled"}</span>
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

      <h2 className="mb-3 mt-8 text-sm font-semibold">Available plans</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {data.plans.map((p) => (
          <Card key={p.id} className={cn("flex flex-col p-5", p.id === current.id && "border-primary/50 ring-1 ring-primary/30")}>
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">{p.name}</p>
              {p.id === current.id && <Badge tone="primary">Current</Badge>}
            </div>
            <p className="mt-1 text-2xl font-semibold">{p.priceLabel}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> <span className="text-muted">{f}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted">
              {p.id === current.id ? "You are on this plan." : "Online payments are coming soon. Contact the administrator to switch plans."}
            </p>
          </Card>
        ))}
      </div>
    </>
  );
}
