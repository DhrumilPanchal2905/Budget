import Link from "next/link";
import type { Metadata } from "next";
import { Banknote, Calculator, Coins, Flame, Globe2, Landmark, LifeBuoy, PieChart, PiggyBank, Receipt, Scale, ShieldCheck, Sunset, TrendingUp, Wallet, Percent } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { TOOLS } from "@/lib/tools-registry";
import { jsonLd, pageMeta, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/tools");

const ICON: Record<string, typeof Calculator> = {
  "emi-calculator": Calculator,
  "budget-planner": PieChart,
  "savings-goal-calculator": PiggyBank,
  "sip-calculator": TrendingUp,
  "income-tax-calculator": Receipt,
  "fd-calculator": Landmark,
  "rd-calculator": Coins,
  "ppf-calculator": ShieldCheck,
  "gst-calculator": Percent,
  "inflation-calculator": Flame,
  "loan-prepayment-calculator": Banknote,
  "compound-interest-calculator": TrendingUp,
  "retirement-calculator": Sunset,
  "emergency-fund-calculator": LifeBuoy,
  "net-worth-calculator": Scale,
  "currency-converter": Globe2,
};

export default function ToolsPage() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }]}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({ "@context": "https://schema.org", "@type": "ItemList", name: "Free money calculators", itemListElement: TOOLS.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.title, url: `${SITE_URL}/tools/${t.slug}` })) }),
        }}
      />
      <section className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Free money calculators</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {TOOLS.length} free tools — no sign-up, private (they run in your browser), and most work in 45+ currencies. Or just ask Angel: “5 lakh loan 9% 5 saal EMI?”
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((x) => {
            const Icon = ICON[x.slug] ?? Wallet;
            return (
              <Link key={x.slug} href={`/tools/${x.slug}`} className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/50">
                <Icon className="h-5 w-5 text-primary" />
                <h2 className="mt-3 text-base font-semibold">{x.title}</h2>
                <p className="mt-1 text-sm text-muted">{x.description}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </PublicShell>
  );
}
