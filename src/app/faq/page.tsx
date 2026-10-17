import type { Metadata } from "next";
import { PublicShell, Prose } from "@/components/public-shell";
import { FAQ, faqLd, jsonLd, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/faq");

export default function FaqPage() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "FAQ", path: "/faq" }]}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd()) }} />
      <Prose>
        <h1>Frequently asked questions</h1>
        {FAQ.map((f) => (
          <section key={f.q}>
            <h2>{f.q}</h2>
            <p>{f.a}</p>
          </section>
        ))}
      </Prose>
    </PublicShell>
  );
}
