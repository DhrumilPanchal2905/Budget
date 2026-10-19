import type { Metadata } from "next";
import { PublicShell, Prose } from "@/components/public-shell";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/privacy");

export default function PrivacyPage() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Privacy", path: "/privacy" }]}>
      <Prose>
        <h1>Privacy policy</h1>
        <p>Last updated: October 2026. This policy explains what Budget Pro (budget.dhrumilpanchal.in) collects and why.</p>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account:</strong> your name, email address and a one-way hash of your password (Argon2id). Your email is verified with a one-time code.</li>
          <li><strong>Finance data you enter:</strong> income, expenses, budgets, debts, goals and notes. Amounts are stored only to show your own dashboards.</li>
          <li><strong>Angel AI chats:</strong> the text of your questions and Angel&apos;s answers, so you can see your history. Voice is converted to text by your browser; we never store audio. You can delete any message, chat or all history.</li>
          <li><strong>Payments:</strong> when you buy a plan, the payment is handled by Razorpay. We receive and keep the order and payment IDs, the amount, the payment method type (e.g. UPI or card), the plan and dates — never your full card number, UPI PIN or bank login. Payment records are kept as required by Indian tax law even if you delete your account.</li>
          <li><strong>Security & usage data:</strong> sign-in sessions, IP address, browser/device type and an <em>approximate</em> location (city/region/country) derived from the IP address by our hosting provider, plus the pages you visit on this site. This is used for security (spotting unusual sign-ins), abuse prevention and understanding how the site is used. We don&apos;t use GPS or precise location.</li>
        </ul>
        <h2>What we don&apos;t do</h2>
        <ul>
          <li>We don&apos;t sell or rent your data, and we don&apos;t show ads.</li>
          <li>We don&apos;t ask for bank logins or card numbers.</li>
          <li>Angel is our own AI — your questions are not sent to third-party AI companies. Only general questions you ask about the world (news, prices, “google karo…”) are looked up with a web search provider, and only the question text is sent — never your financial data or identity.</li>
        </ul>
        <h2>Security</h2>
        <p>HTTPS everywhere, end-to-end encrypted API payloads, HttpOnly secure session cookies, strict per-user data isolation, rate limiting and an audit log of sensitive actions.</p>
        <h2>Retention & deletion</h2>
        <p>You can delete your account from Settings at any time; your finance records, chats, notifications and sessions are deleted. Visit analytics expire automatically after 180 days. Security audit entries are kept in anonymised form.</p>
        <h2>Cookies</h2>
        <p>We use a strictly necessary session cookie to keep you signed in and a first-party visitor cookie to count unique visits. No third-party advertising cookies.</p>
        <h2>Contact</h2>
        <p>
          Questions or requests: dhrumilpanchal295@gmail.com · <a href="/contact">Contact page</a>
        </p>
      </Prose>
    </PublicShell>
  );
}
