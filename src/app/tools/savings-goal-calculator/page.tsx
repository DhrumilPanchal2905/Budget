import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { SavingsGoalCalculator } from "@/components/tools/calculators";
import { faqLd, jsonLd, pageMeta, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/tools/savings-goal-calculator");

const FAQS = [
  { q: "How do I reach a savings goal faster?", a: "Automate a fixed transfer on salary day, cut one or two \"wants\" categories, and put bonuses straight into the goal." },
  { q: "Should I include returns?", a: "For goals under 2–3 years use a low, safe rate (e.g. 6%); for longer goals you may assume higher but uncertain returns." },
  { q: "Can Budget Pro track this for me?", a: "Yes — create a goal and Budget Pro shows if you're on track today, your real saving pace and the projected finish date." },
];

export default function Page() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: "Savings goal calculator", path: "/tools/savings-goal-calculator" }]}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd([{ "@context": "https://schema.org", "@type": "WebApplication", name: "Savings goal calculator", url: `${SITE_URL}/tools/savings-goal-calculator`, applicationCategory: "FinanceApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } }, faqLd(FAQS)]) }}
      />
      <section className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Savings goal calculator</h1>
        <p className="mt-2 text-sm text-muted">How much to save every month for any goal. Free, private (runs in your browser), 45+ currencies.</p>
        <div className="mt-6 rounded-2xl border border-border bg-surface/80 p-5">
          <SavingsGoalCalculator />
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
