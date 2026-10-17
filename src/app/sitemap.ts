import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/seo";

const UPDATED = new Date("2026-10-17");

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((p) => ({ url: `${SITE_URL}${p.path === "/" ? "" : p.path}` || SITE_URL, lastModified: UPDATED, changeFrequency: p.freq, priority: p.priority }));
}
