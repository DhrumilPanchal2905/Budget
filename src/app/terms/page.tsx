import type { Metadata } from "next";
import { PublicShell, Prose } from "@/components/public-shell";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/terms");

export default function TermsPage() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Terms", path: "/terms" }]}>
      <Prose>
        <h1>Terms of service</h1>
        <p>Last updated: October 2026. By using Budget Pro you agree to these terms.</p>
        <h2>The service</h2>
        <p>Budget Pro is a personal finance organiser. Figures, suggestions and Angel AI answers are calculated from the data you enter and general rules of thumb. They are for information only and are not financial, investment, tax or legal advice. Please consult a qualified professional for decisions.</p>
        <h2>Your account</h2>
        <ul>
          <li>Use a real email address you own; keep your password secret.</li>
          <li>You are responsible for the accuracy of the data you enter.</li>
          <li>Don&apos;t misuse the service (scraping, attacking, sharing accounts, or entering other people&apos;s data without permission).</li>
        </ul>
        <h2>Plans</h2>
        <p>The Free plan has record limits. Paid features may change with notice. Unlimited is assigned by an administrator.</p>
        <h2>Availability</h2>
        <p>We aim for high availability but can&apos;t guarantee uninterrupted service. Keep your own exports (CSV) of important data.</p>
        <h2>Termination</h2>
        <p>You can delete your account at any time. We may suspend accounts that break these terms.</p>
      </Prose>
    </PublicShell>
  );
}
