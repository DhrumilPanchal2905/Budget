import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { EmiCalculator } from "@/components/tools/calculators";
import { faqLd, jsonLd, pageMeta, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/tools/emi-calculator");

const FAQS = [
  { q: "How is EMI calculated?", a: "EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1), where P is the loan amount, r is the monthly interest rate (yearly rate ÷ 12 ÷ 100) and n is the number of months." },
  { q: "Does prepaying reduce interest?", a: "Yes. Early EMIs are mostly interest, so prepayments in the first years cut total interest the most." },
  { q: "What EMI is affordable?", a: "Keep all EMIs together under about 35–40% of your take-home income so there's room for savings and emergencies." },
];

export default function Page() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: "EMI calculator", path: "/tools/emi-calculator" }]}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd([{ "@context": "https://schema.org", "@type": "WebApplication", name: "EMI calculator", url: `${SITE_URL}/tools/emi-calculator`, applicationCategory: "FinanceApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } }, faqLd(FAQS)]) }}
      />
      <section className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">EMI calculator</h1>
        <p className="mt-2 text-sm text-muted">Calculate your loan EMI instantly. Free, private (runs in your browser), 45+ currencies.</p>
        <div className="mt-6 rounded-2xl border border-border bg-surface/80 p-5">
          <EmiCalculator />
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
