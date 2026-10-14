import Link from "next/link";
import { ArrowRight, BarChart3, Bell, Check, Landmark, Lock, Palette, Radio, ShieldCheck, Smartphone, Target, Zap } from "lucide-react";
import { PLANS } from "@/lib/plans";

const features = [
  { icon: BarChart3, title: "Professional dashboards", text: "Monthly and all-time analytics with accurate, server-calculated charts." },
  { icon: Landmark, title: "EMI & debt tracking", text: "Track loans, record EMI payments and see your debt-free date." },
  { icon: Target, title: "Savings goals", text: "Set targets, add contributions and know if you are on track." },
  { icon: Zap, title: "Smart insights", text: "Spending spikes, EMI burden and goal feasibility — from your real data." },
  { icon: Radio, title: "Realtime sync", text: "Every device updates instantly when anything changes." },
  { icon: Bell, title: "Reminders & push", text: "EMI due-date reminders and notifications on your phone." },
  { icon: ShieldCheck, title: "Bank-grade security", text: "Argon2id passwords, HttpOnly sessions, strict data isolation." },
  { icon: Palette, title: "7 beautiful themes", text: "Midnight black, Ocean, Emerald, Royal, Sunset, Graphite and Light." },
  { icon: Smartphone, title: "Mobile-first", text: "Designed for phones, tablets and desktops alike." },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="glow pointer-events-none absolute inset-0" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="font-semibold tracking-tight">Budget Pro</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">
            Sign in
          </Link>
          <Link href="/register" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary/90">
            Get started
          </Link>
        </nav>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-4xl px-5 pb-16 pt-14 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted">
            <Lock className="h-3 w-3" /> Private, secure & realtime
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
            Your money,
            <span className="bg-gradient-to-r from-[var(--series-1)] to-[var(--series-3)] bg-clip-text text-transparent"> finally organised.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">
            Track salary, expenses, EMIs and savings goals in one beautiful dashboard. Budget Pro turns your real numbers into clear charts and practical insights.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-fg hover:bg-primary/90">
              Create free account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 text-sm font-medium hover:bg-surface-2">
              I already have an account
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-24" id="pricing">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Simple plans</h2>
          <p className="mt-2 text-center text-sm text-muted">Start free. Upgrade when you need more.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {Object.values(PLANS).map((p) => (
              <div key={p.id} className={`flex flex-col rounded-2xl border bg-surface p-6 ${p.id === "plus" ? "border-primary/50 ring-1 ring-primary/30" : "border-border"}`}>
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="mt-2 text-3xl font-semibold">{p.priceLabel}</p>
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
      </main>

      <footer className="relative border-t border-border py-8 text-center text-xs text-muted">© {new Date().getFullYear()} Budget Pro · budget.dhrumilpanchal.in</footer>
    </div>
  );
}
