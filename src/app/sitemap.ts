import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/seo";

// Bump when public content changes (tells search engines to re-crawl).
const UPDATED = new Date("2026-10-19");

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((p) => ({
    url: p.path === "/" ? SITE_URL : `${SITE_URL}${p.path}`,
    lastModified: UPDATED,
    changeFrequency: p.freq,
    priority: p.priority,
    ...(p.path === "/" ? { images: [`${SITE_URL}/opengraph-image`] } : {}),
  }));
}
