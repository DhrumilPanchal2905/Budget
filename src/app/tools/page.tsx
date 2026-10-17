import Link from "next/link";
import type { Metadata } from "next";
import { Calculator, PieChart, PiggyBank, TrendingUp } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/tools");

const TOOLS = [
  { href: "/tools/emi-calculator", icon: Calculator, t: "EMI calculator", d: "Monthly EMI, total interest and a year-by-year repayment schedule." },
  { href: "/tools/budget-planner", icon: PieChart, t: "50/30/20 budget planner", d: "Split your income into needs, wants and savings." },
  { href: "/tools/savings-goal-calculator", icon: PiggyBank, t: "Savings goal calculator", d: "How much to save each month to reach a goal on time." },
  { href: "/tools/sip-calculator", icon: TrendingUp, t: "SIP calculator", d: "See how a monthly SIP can grow with compounding." },
];

export default function ToolsPage() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }]}>
      <section className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Free money calculators</h1>
        <p className="mt-2 text-sm text-muted">No sign-up, works in 45+ currencies.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {TOOLS.map((x) => (
            <Link key={x.href} href={x.href} className="rounded-2xl border border-border bg-surface p-5 hover:border-primary/50">
              <x.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">{x.t}</h2>
              <p className="mt-1 text-sm text-muted">{x.d}</p>
            </Link>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
