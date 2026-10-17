import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { BudgetPlanner } from "@/components/tools/calculators";
import { faqLd, jsonLd, pageMeta, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/tools/budget-planner");

const FAQS = [
  { q: "What is the 50/30/20 rule?", a: "Spend about 50% of take-home income on needs, 30% on wants and save 20%. It's a simple starting point you can adjust." },
  { q: "What if my rent and EMIs are more than 50%?", a: "Cut wants first and protect at least 10–20% savings. Avoid new EMIs until needs come down." },
  { q: "Where should the 20% go?", a: "Build an emergency fund of 3–6 months of expenses first, then invest for goals and prepay costly loans." },
];

export default function Page() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: "50/30/20 budget planner", path: "/tools/budget-planner" }]}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd([{ "@context": "https://schema.org", "@type": "WebApplication", name: "50/30/20 budget planner", url: `${SITE_URL}/tools/budget-planner`, applicationCategory: "FinanceApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } }, faqLd(FAQS)]) }}
      />
      <section className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">50/30/20 budget planner</h1>
        <p className="mt-2 text-sm text-muted">Split your monthly income with the 50/30/20 rule. Free, private (runs in your browser), 45+ currencies.</p>
        <div className="mt-6 rounded-2xl border border-border bg-surface/80 p-5">
          <BudgetPlanner />
        </div>
        <div className="prose-bp mt-8 max-w-3xl">
          {FAQS.map((f) => (
            <section key={f.q}>
              <h2>{f.q}</h2>
              <p>{f.a}</p>
            </section>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
