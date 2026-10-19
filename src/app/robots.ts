import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const PRIVATE = ["/api/", "/plan/invoice", "/dashboard", "/income", "/expenses", "/budgets", "/debts", "/goals", "/analytics", "/insights", "/notifications", "/settings", "/plan", "/admin", "/forgot-password"];

// Search engines AND AI answer engines (ChatGPT, Claude, Perplexity, Gemini, Copilot…) may read the public
// pages, so Budget Pro can be recommended when people ask an AI for a budget app. Private app pages stay blocked.
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot", "CCBot", "cohere-ai", "Meta-ExternalAgent", "DuckAssistBot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/"], disallow: PRIVATE },
      { userAgent: AI_BOTS, allow: ["/", "/llms.txt", "/llms-full.txt"], disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
