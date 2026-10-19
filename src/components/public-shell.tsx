import Link from "next/link";
import type { ReactNode } from "react";
import { jsonLd, breadcrumbLd } from "@/lib/seo";
import { WarmUp } from "./warmup";
import { GuestAngelLoader } from "./guest-angel-loader";
import { TOOLS } from "@/lib/tools-registry";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/angel-ai", label: "Angel AI" },
  { href: "/tools", label: "Free tools" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
];

/** Header + footer for public (SEO) pages. Server component — zero client JS except the tiny warm-up ping. */
export function PublicShell({ children, crumbs }: { children: ReactNode; crumbs?: { name: string; path: string }[] }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <WarmUp />
      <GuestAngelLoader />
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Budget Pro home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Budget Pro logo" width={32} height={32} className="h-8 w-8" />
          <span className="font-semibold tracking-tight">Budget Pro</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">
            Sign in
          </Link>
          <Link href="/register" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary/90">
            Get started
          </Link>
        </div>
      </header>
      <nav aria-label="Mobile" className="relative mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs text-muted">
            {n.label}
          </Link>
        ))}
      </nav>
      {crumbs && crumbs.length > 1 && (
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd(crumbs)) }} />
          <nav aria-label="Breadcrumb" className="relative mx-auto max-w-5xl px-5 pt-2 text-xs text-muted">
            {crumbs.map((c, i) => (
              <span key={c.path}>
                {i > 0 && <span className="mx-1.5">/</span>}
                {i < crumbs.length - 1 ? (
                  <Link href={c.path} className="hover:text-fg">
                    {c.name}
                  </Link>
                ) : (
                  <span className="text-fg">{c.name}</span>
                )}
              </span>
            ))}
          </nav>
        </>
      )}
      <main className="relative">{children}</main>
      <footer className="relative mt-16 border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold">Budget Pro</p>
            <p className="mt-2 text-muted">AI budget planner & expense tracker in English, हिंदी and ગુજરાતી. Built by Dhrumil Panchal.</p>
          </div>
          <div>
            <p className="font-semibold">Product</p>
            <ul className="mt-2 space-y-1.5 text-muted">
              <li><Link href="/features" className="hover:text-fg">Features</Link></li>
              <li><Link href="/angel-ai" className="hover:text-fg">Angel AI assistant</Link></li>
              <li><Link href="/pricing" className="hover:text-fg">Pricing</Link></li>
              <li><Link href="/register" className="hover:text-fg">Create free account</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Free tools</p>
            <ul className="mt-2 space-y-1.5 text-muted">
              <li><Link href="/tools/emi-calculator" className="hover:text-fg">EMI calculator</Link></li>
              <li><Link href="/tools/budget-planner" className="hover:text-fg">50/30/20 budget planner</Link></li>
              <li><Link href="/tools/savings-goal-calculator" className="hover:text-fg">Savings goal calculator</Link></li>
              <li><Link href="/tools/sip-calculator" className="hover:text-fg">SIP calculator</Link></li>
              <li><Link href="/tools/income-tax-calculator" className="hover:text-fg">Income tax calculator</Link></li>
              <li><Link href="/tools/fd-calculator" className="hover:text-fg">FD calculator</Link></li>
              <li><Link href="/tools" className="hover:text-fg">All {TOOLS.length} tools →</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Company</p>
            <ul className="mt-2 space-y-1.5 text-muted">
              <li><Link href="/about" className="hover:text-fg">About</Link></li>
              <li><Link href="/faq" className="hover:text-fg">FAQ</Link></li>
              <li><Link href="/privacy" className="hover:text-fg">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-fg">Terms</Link></li>
              <li><Link href="/refund-policy" className="hover:text-fg">Refund policy</Link></li>
              <li><Link href="/contact" className="hover:text-fg">Contact</Link></li>
            </ul>
          </div>
        </div>
        <p className="border-t border-border py-5 text-center text-xs text-muted">© {new Date().getFullYear()} Budget Pro · budget.dhrumilpanchal.in</p>
      </footer>
    </div>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose-bp mx-auto max-w-3xl px-5 py-10">{children}</div>;
}
