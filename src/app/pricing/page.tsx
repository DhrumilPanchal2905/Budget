import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { PLANS, PLAN_IDS } from "@/lib/plans";
import { jsonLd, pageMeta, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/pricing");

export default function PricingPage() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }]}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({ "@context": "https://schema.org", "@type": "Product", name: "Budget Pro", url: `${SITE_URL}/pricing`, brand: { "@type": "Brand", name: "Budget Pro" }, offers: { "@type": "Offer", price: "0", priceCurrency: "INR", availability: "https://schema.org/InStock" } }),
        }}
      />
      <section className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-2 text-center text-sm text-muted">Start free. Every plan includes budgets, goals, EMIs, analytics, realtime sync and bank-grade security.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLAN_IDS.map((id) => PLANS[id]).map((p) => (
            <div key={p.id} className={`flex flex-col rounded-2xl border bg-surface p-6 ${p.id === "unlimited" ? "border-primary/50 ring-1 ring-primary/30" : "border-border"}`}>
              <h2 className="text-sm font-semibold">{p.name}</h2>
              <p className="mt-2 text-2xl font-semibold">{p.priceLabel}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-muted">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-6 rounded-lg border border-border px-4 py-2.5 text-center text-sm font-medium hover:bg-surface-2">
                {p.id === "free" ? "Start free" : "Get started"}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
