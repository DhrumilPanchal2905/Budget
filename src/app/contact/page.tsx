import type { Metadata } from "next";
import { Mail, MapPin, Phone, User } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { jsonLd, pageMeta, SITE_URL } from "@/lib/seo";
import { businessInfo } from "@/lib/business";

export const metadata: Metadata = pageMeta("/contact");

export default function ContactPage() {
  const b = businessInfo();
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }]}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({ "@context": "https://schema.org", "@type": "ContactPage", url: `${SITE_URL}/contact`, mainEntity: { "@type": "Organization", name: b.name, email: b.email, ...(b.phone ? { telephone: b.phone } : {}), address: b.address, founder: { "@type": "Person", name: b.owner } } }),
        }}
      />
      <section className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Contact us</h1>
        <p className="mt-2 text-sm text-muted">Questions about your account, a payment, a refund or a feature? We usually reply within 2 working days.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <a href={`mailto:${b.email}`} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 hover:bg-surface-2">
            <Mail className="mt-0.5 h-5 w-5 text-primary" />
            <span>
              <span className="block text-sm font-medium">Email</span>
              <span className="text-sm text-muted">{b.email}</span>
            </span>
          </a>
          {b.phone && (
            <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 hover:bg-surface-2">
              <Phone className="mt-0.5 h-5 w-5 text-primary" />
              <span>
                <span className="block text-sm font-medium">Phone</span>
                <span className="text-sm text-muted">{b.phone}</span>
              </span>
            </a>
          )}
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
            <User className="mt-0.5 h-5 w-5 text-primary" />
            <span>
              <span className="block text-sm font-medium">Owner</span>
              <span className="text-sm text-muted">{b.owner} · {b.name}</span>
            </span>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
            <MapPin className="mt-0.5 h-5 w-5 text-primary" />
            <span>
              <span className="block text-sm font-medium">Address</span>
              <span className="whitespace-pre-line text-sm text-muted">{b.address}</span>
            </span>
          </div>
        </div>
        <p className="mt-6 text-xs text-muted">For payment issues please include your invoice number or Razorpay payment ID (shown on the Plan page and in your receipt email).</p>
      </section>
    </PublicShell>
  );
}
