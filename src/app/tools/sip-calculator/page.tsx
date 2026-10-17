import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { SipCalculator } from "@/components/tools/calculators";
import { faqLd, jsonLd, pageMeta, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/tools/sip-calculator");

const FAQS = [
  { q: "What is a SIP?", a: "A Systematic Investment Plan invests a fixed amount in a mutual fund every month, averaging your purchase price over time." },
  { q: "Are SIP returns guaranteed?", a: "No. Equity returns vary and can be negative in the short term; SIPs suit goals that are 5+ years away." },
  { q: "How much should I invest?", a: "After an emergency fund is in place, many people aim to invest 10–20% of income for long-term goals." },
];

export default function Page() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: "SIP calculator", path: "/tools/sip-calculator" }]}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd([{ "@context": "https://schema.org", "@type": "WebApplication", name: "SIP calculator", url: `${SITE_URL}/tools/sip-calculator`, applicationCategory: "FinanceApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } }, faqLd(FAQS)]) }}
      />
      <section className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">SIP calculator</h1>
        <p className="mt-2 text-sm text-muted">Estimate the future value of a monthly SIP. Free, private (runs in your browser), 45+ currencies.</p>
        <div className="mt-6 rounded-2xl border border-border bg-surface/80 p-5">
          <SipCalculator />
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
