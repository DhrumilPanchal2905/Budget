import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BarChart3, Bell, Bot, Calculator, Check, Globe, Landmark, Languages, Lock, Mic, Radio, ShieldCheck, Smartphone, Target, Wallet, Zap } from "lucide-react";
import { PLANS, PUBLIC_PLAN_IDS } from "@/lib/plans";
import { PublicShell } from "@/components/public-shell";
import { APP_LD, FAQ, ORG_LD, WEBSITE_LD, faqLd, jsonLd, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/", { title: "Budget Pro — Free AI budget planner & expense tracker (English, हिंदी, ગુજરાતી)" });

const features = [
  { icon: Bot, title: "Angel — your own AI", text: "Ask anything about your money by voice or chat. Angel answers from your real data, explains why, and suggests what to do next." },
  { icon: Wallet, title: "Category budgets", text: "Monthly limits per category with live 'left per day', month-end projection and 80% / 100% alerts." },
  { icon: Target, title: "Goals that tell the truth", text: "See if every goal is on track vs. today's date, your real saving pace and the projected finish date." },
  { icon: Landmark, title: "EMI & loan tracking", text: "Record EMI payments, see what's left, get due-date reminders and your debt-free date." },
  { icon: BarChart3, title: "Professional analytics", text: "Monthly and all-time charts, category breakdowns and a 50/30/20 needs-wants-savings split." },
  { icon: Zap, title: "Auto-repeat entries", text: "Salary, rent, SIPs and bills add themselves every month — never back-filled, always notified." },
  { icon: Radio, title: "Realtime sync", text: "Phone, laptop and tablet update instantly when anything changes." },
  { icon: Bell, title: "Reminders & push", text: "EMI reminders, budget alerts and goal milestones on your phone." },
  { icon: ShieldCheck, title: "Bank-grade security", text: "Argon2id passwords, HttpOnly sessions, email-verified sign-ups and end-to-end encrypted API traffic." },
];

const examples = [
  { lang: "English", q: "Why did my spending go up this month?" },
  { lang: "हिंदी", q: "इस महीने खाने पर कितना खर्च हुआ?" },
  { lang: "ગુજરાતી", q: "મારું બજેટ કેટલું બાકી છે?" },
  { lang: "Hinglish", q: "6 mahine mein 1 lakh kaise bachaun?" },
];

export default function Home() {
  return (
    <PublicShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd([ORG_LD, WEBSITE_LD, APP_LD, faqLd(FAQ.slice(0, 6))]) }} />
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-[600px]" />

      <section className="relative mx-auto max-w-4xl px-5 pb-14 pt-10 text-center sm:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted">
          <Languages className="h-3 w-3" /> English · हिंदी · ગુજરાતી · voice & chat
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
          The budget planner
          <span className="bg-gradient-to-r from-[var(--series-1)] to-[var(--series-3)] bg-clip-text text-transparent"> that thinks with you.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">
          Budget Pro is a free expense tracker and money manager with its own AI assistant, Angel. Track income, expenses, EMIs and savings goals, set budgets, and just ask —
          “kharcha kyu badha?”, “મારું બેલેન્સ કેટલું છે?” — for accurate answers from your real numbers.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-fg hover:bg-primary/90">
            Create free account <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/tools/budget-planner" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-6 py-3 text-sm font-medium hover:bg-surface-2">
            <Calculator className="h-4 w-4" /> Try the free budget planner
          </Link>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
          <Lock className="h-3 w-3" /> No bank login needed · email-verified accounts · encrypted end to end
        </p>
      </section>

      <section className="relative mx-auto max-w-5xl px-5 pb-16" aria-labelledby="angel-h">
        <div className="grid items-center gap-6 rounded-2xl border border-border bg-surface/80 p-6 backdrop-blur md:grid-cols-2 md:p-8">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
              <Mic className="h-3.5 w-3.5" /> Angel AI
            </p>
            <h2 id="angel-h" className="mt-2 text-2xl font-semibold tracking-tight">Ask in your language. Get a real answer.</h2>
            <p className="mt-3 text-sm text-muted">
              Angel is built in-house — no third-party AI — and trained on how people actually talk about money in India: Hindi, Gujarati, Hinglish, typos and all. It doesn&apos;t just
              show numbers; it compares with your usual, explains what changed, checks your budgets and goals, and offers the next step. It can also add entries, set budgets and undo.
            </p>
            <Link href="/angel-ai" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              How Angel works <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ul className="space-y-2.5">
            {examples.map((e) => (
              <li key={e.q} className="rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-sm">
                <span className="mr-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">{e.lang}</span>
                {e.q}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-20" aria-labelledby="features-h">
        <h2 id="features-h" className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Everything you need to master your money</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted">One app for budgeting, expense tracking, loans and savings — accurate to the paisa, in 45+ currencies.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur">
              <f.icon className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-5xl px-5 pb-20" aria-labelledby="how-h">
        <h2 id="how-h" className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Start budgeting in 3 steps</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["Create your free account", "Sign up with your email — we send a 6-digit code to verify it. Takes under a minute."],
            ["Add income & expenses", "Type them, tap them, or just tell Angel: “salary 50000 aayi”, “petrol 500”. Turn on auto-repeat for salary and rent."],
            ["Set budgets & goals", "Angel suggests category limits from your history and tells you every month what to fix."],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-border bg-surface p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{i + 1}</span>
              <h3 className="mt-3 text-sm font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative mx-auto max-w-5xl px-5 pb-20" id="pricing" aria-labelledby="pricing-h">
        <h2 id="pricing-h" className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Simple plans</h2>
        <p className="mt-2 text-center text-sm text-muted">Start free. Upgrade when you need more.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PUBLIC_PLAN_IDS.map((id) => PLANS[id]).map((p) => (
            <div key={p.id} className={`flex flex-col rounded-2xl border bg-surface p-6 ${p.id === "plus" ? "border-primary/50 ring-1 ring-primary/30" : "border-border"}`}>
              <h3 className="text-sm font-semibold">{p.name}</h3>
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

      <section className="relative mx-auto max-w-3xl px-5 pb-10" aria-labelledby="faq-h">
        <h2 id="faq-h" className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Frequently asked questions</h2>
        <div className="mt-8 space-y-3">
          {FAQ.slice(0, 6).map((f) => (
            <details key={f.q} className="group rounded-xl border border-border bg-surface p-4">
              <summary className="cursor-pointer list-none text-sm font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-center text-sm">
          <Link href="/faq" className="text-primary hover:underline">
            All questions →
          </Link>
        </p>
      </section>

      <section className="relative mx-auto max-w-4xl px-5">
        <div className="glow rounded-2xl border border-border bg-surface p-8 text-center">
          <Globe className="mx-auto h-6 w-6 text-primary" />
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Your money, finally organised — in your language.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">Free forever plan. Works on phone and desktop. Install it like an app.</p>
          <Link href="/register" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-fg hover:bg-primary/90">
            Create free account <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted">
            <Smartphone className="h-3.5 w-3.5" /> Android · iPhone · Windows · Mac
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
