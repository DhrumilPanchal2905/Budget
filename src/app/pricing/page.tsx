import Link from "next/link";
import type { Metadata } from "next";
import { Bot, Check, Lock, ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { GUEST_ANGEL, PLANS, PLAN_IDS } from "@/lib/plans";
import { jsonLd, pageMeta, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/pricing");

const FAQS = [
  { q: "How do Angel AI credits work?", a: "Every plan includes Angel AI. Limited plans get a number of credits per window (for example 20 credits every 5 hours on Free). The window starts with your first message and refills when it ends. A simple question costs 1 credit; long questions, web look-ups and actions cost a little more. Unlimited has no limit." },
  { q: "Does my plan renew automatically?", a: "No. You pay for one month at a time with UPI, card, netbanking or a wallet through Razorpay. We remind you 3 days before the end date; renewing adds 30 days after the current end date." },
  { q: "What happens when I upgrade?", a: "The new plan starts immediately. The unused days of your current paid plan are converted at their value into extra days on the new plan — you never lose what you paid for." },
  { q: "What happens when a plan ends?", a: "Your account goes back to the Free plan. All your data stays; only the limits change." },
  { q: "Can I get a refund?", a: "Yes — see the refund & cancellation policy. Payments made by mistake or charged twice are refunded in full." },
];

export default function PricingPage() {
  const paid = PLAN_IDS.filter((id) => PLANS[id].priceInr > 0).map((id) => PLANS[id]);
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }]}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd([
            {
              "@context": "https://schema.org",
              "@type": "Product",
              name: "Budget Pro",
              description: "AI budget planner and expense tracker with the Angel AI assistant.",
              url: `${SITE_URL}/pricing`,
              brand: { "@type": "Brand", name: "Budget Pro" },
              offers: {
                "@type": "AggregateOffer",
                priceCurrency: "INR",
                lowPrice: "0",
                highPrice: String(Math.max(...paid.map((p) => p.priceInr))),
                offerCount: String(PLAN_IDS.length),
                offers: PLAN_IDS.map((id) => ({ "@type": "Offer", name: PLANS[id].name, price: String(PLANS[id].priceInr), priceCurrency: "INR", availability: "https://schema.org/InStock", url: `${SITE_URL}/pricing` })),
              },
            },
            { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
          ]),
        }}
      />
      <section className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">Simple, honest pricing</h1>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted">
          Start free. Every plan includes Angel AI, budgets, goals, EMIs, analytics, realtime sync and bank-grade security. Pay monthly in ₹ — no auto-renewal, no hidden charges.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLAN_IDS.map((id) => PLANS[id]).map((p) => (
            <div key={p.id} className={`flex flex-col rounded-2xl border bg-surface p-6 ${p.id === "pro" ? "border-primary/50 ring-1 ring-primary/30" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{p.name}</h2>
                {p.id === "pro" && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">Most popular</span>}
              </div>
              <p className="mt-1 text-xs text-muted">{p.tagline}</p>
              <p className="mt-3 text-3xl font-semibold">
                ₹{p.priceInr}
                <span className="text-sm font-normal text-muted">{p.priceInr ? " /month" : " forever"}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-muted">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Link href="/register" className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-medium ${p.id === "pro" ? "bg-primary text-primary-fg hover:bg-primary/90" : "border border-border hover:bg-surface-2"}`}>
                {p.id === "free" ? "Start free" : `Get ${p.name}`}
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 text-sm text-muted sm:grid-cols-3">
          <p className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
            <Bot className="h-4 w-4 shrink-0 text-primary" /> No account? Try Angel as a guest — {GUEST_ANGEL.credits} free questions every {GUEST_ANGEL.windowHours} hours.
          </p>
          <p className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
            <Lock className="h-4 w-4 shrink-0 text-primary" /> Secure checkout by Razorpay: UPI, cards, netbanking, wallets.
          </p>
          <p className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> We never see or store your card / UPI details.
          </p>
        </div>
        <div className="mx-auto mt-14 max-w-3xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight">Pricing questions</h2>
          <div className="mt-6 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="rounded-xl border border-border bg-surface p-4">
                <summary className="cursor-pointer list-none text-sm font-medium">{f.q}</summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            <Link href="/refund-policy" className="hover:text-fg hover:underline">Refund & cancellation policy</Link> · <Link href="/terms" className="hover:text-fg hover:underline">Terms</Link> · <Link href="/contact" className="hover:text-fg hover:underline">Contact</Link>
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
