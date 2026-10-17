import Link from "next/link";
import type { Metadata } from "next";
import { PublicShell, Prose } from "@/components/public-shell";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/features");

const SECTIONS: { h: string; items: string[] }[] = [
  { h: "Income & expense tracking", items: ["Salary and extra income with categories", "17 expense categories (food, groceries, rent, fuel, EMI, SIP…)", "Search, filters, month view, sorting and CSV export", "Auto-repeat for salary, rent, SIPs and bills — added on the right date, never back-filled", "Every amount stored as integer paise — no rounding errors"] },
  { h: "Budgets", items: ["Monthly limit per category or for the whole month", "Live ‘left today’ allowance and month-end projection", "Alerts at your chosen level (default 80%) and at 100%", "Angel suggests limits from your last 3 months"] },
  { h: "Savings goals", items: ["Target amount and date for each goal", "On-track check: where you are vs. where you should be today", "Real saving pace from your contribution history and projected finish date", "Contributions, withdrawals and a full history per goal"] },
  { h: "Debts & EMIs", items: ["Loans with interest rate, EMI and due date", "Record an EMI → it becomes an expense and the balance updates", "Due-date reminders, debt-free projection, avalanche vs. snowball advice"] },
  { h: "Analytics & insights", items: ["Monthly and all-time charts", "Category breakdown and month-over-month comparison", "50/30/20 needs-wants-savings split", "Financial health score and Angel AI suggestions in your language"] },
  { h: "Angel AI assistant", items: ["Understands English, Hindi, Gujarati and Hinglish — typed or spoken", "Answers from your real data, explains why things changed, plans savings", "Adds entries, sets budgets, moves money into goals, undoes mistakes", "General money knowledge: SIP, tax basics, CIBIL, emergency fund"] },
  { h: "Security & privacy", items: ["Email-verified sign-ups (6-digit code)", "Argon2id password hashing and HttpOnly secure sessions", "End-to-end encrypted API requests and responses on top of HTTPS", "Strict per-user data isolation, rate limits and a full audit log", "Device login with fingerprint / face (passkeys)"] },
  { h: "Everywhere", items: ["Responsive on phone, tablet and desktop; installable as an app", "Realtime sync across devices", "7 themes including true black", "45+ currencies with local formatting"] },
];

export default function FeaturesPage() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Features", path: "/features" }]}>
      <Prose>
        <h1>Budget Pro features</h1>
        <p>A complete personal finance app: budgeting, expense tracking, loans, savings goals and an AI assistant that speaks your language. Free to start.</p>
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            <ul>
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
        <p>
          <Link href="/register">Create your free account →</Link>
        </p>
      </Prose>
    </PublicShell>
  );
}
