import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";
import { ToolRender } from "@/components/tools/tool-render";
import { NEW_TOOLS, TOOLS, toolBySlug } from "@/lib/tools-registry";
import { faqLd, jsonLd, pageMeta, SITE_URL } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return NEW_TOOLS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = toolBySlug(slug);
  if (!t) return {};
  return { ...pageMeta(`/tools/${t.slug}`, { title: `${t.title} — free, instant`, description: t.description }), keywords: t.keywords };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = toolBySlug(slug);
  if (!t || t.legacy) notFound();
  const related = TOOLS.filter((x) => x.slug !== t.slug).slice(0, 6);
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: t.title, path: `/tools/${t.slug}` }]}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd([
            { "@context": "https://schema.org", "@type": "WebApplication", name: t.title, description: t.description, url: `${SITE_URL}/tools/${t.slug}`, applicationCategory: "FinanceApplication", operatingSystem: "Any", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } },
            ...(t.faqs.length ? [faqLd(t.faqs)] : []),
          ]),
        }}
      />
      <section className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">{t.intro} Free, private (runs in your browser) — no sign-up.</p>
        <div className="mt-6 rounded-2xl border border-border bg-surface/80 p-5">
          <ToolRender slug={t.slug} />
        </div>
        {t.faqs.length > 0 && (
          <div className="prose-bp mt-8 max-w-3xl">
            {t.faqs.map((f) => (
              <section key={f.q}>
                <h2>{f.q}</h2>
                <p>{f.a}</p>
              </section>
            ))}
          </div>
        )}
        <div className="mt-10">
          <h2 className="text-sm font-semibold">More free calculators</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {related.map((r) => (
              <Link key={r.slug} href={`/tools/${r.slug}`} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-primary/50 hover:text-fg">
                {r.title}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
