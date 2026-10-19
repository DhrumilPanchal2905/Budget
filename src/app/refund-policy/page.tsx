import type { Metadata } from "next";
import { PublicShell, Prose } from "@/components/public-shell";
import { pageMeta } from "@/lib/seo";
import { businessInfo } from "@/lib/business";

export const metadata: Metadata = pageMeta("/refund-policy");

export default function RefundPolicyPage() {
  const b = businessInfo();
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Refund & cancellation policy", path: "/refund-policy" }]}>
      <Prose>
        <h1>Refund & cancellation policy</h1>
        <p>Last updated: October 2026. This policy applies to Budget Pro paid plans (Plus, Pro and Unlimited) bought on budget.dhrumilpanchal.in.</p>
        <h2>What you buy</h2>
        <p>Each purchase is a <strong>one-month (30-day) digital subscription</strong> that starts as soon as the payment is confirmed. Nothing is shipped — the plan is activated in your account instantly and you get an email receipt and invoice.</p>
        <h2>No auto-renewal</h2>
        <p>Plans never renew automatically and we never store your card or UPI details, so there is nothing to cancel. When the 30 days end, your account simply returns to the Free plan with all your data kept.</p>
        <h2>Cancellation</h2>
        <p>You can stop using a paid plan at any time. Because plans are prepaid for one month and don&apos;t renew, no further charge will ever be made.</p>
        <h2>Refunds</h2>
        <ul>
          <li><strong>Charged twice / charged but plan not activated:</strong> full refund, or we activate the plan — your choice. Most such cases are fixed automatically within minutes.</li>
          <li><strong>Changed your mind:</strong> ask within <strong>7 days</strong> of the payment and if you have used Angel AI or added records only lightly, we refund the full amount.</li>
          <li><strong>Service problem:</strong> if a paid feature didn&apos;t work for a significant part of your period and we couldn&apos;t fix it, we refund the unused part.</li>
        </ul>
        <p>Approved refunds are made to the original payment method through Razorpay within <strong>5–7 working days</strong> (bank timelines may vary). When a refund is made, the plan bought with that payment ends.</p>
        <h2>How to ask</h2>
        <p>
          Email <a href={`mailto:${b.email}`}>{b.email}</a> from your account email with your invoice number (shown on the Plan page). We reply within 2 working days.
        </p>
      </Prose>
    </PublicShell>
  );
}
