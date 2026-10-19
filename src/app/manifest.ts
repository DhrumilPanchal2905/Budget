import type { MetadataRoute } from "next";

// Web app manifest — also the store listing when the PWA is installed or packaged for Google Play (TWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Budget Pro — AI budget planner & expense tracker",
    short_name: "Budget Pro",
    description:
      "Track expenses, budgets, EMIs and savings goals with Angel — an AI money assistant that understands English, Hindi (हिंदी) and Gujarati (ગુજરાતી), by voice or chat. 16 free calculators including income tax, EMI, SIP, FD and GST.",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "en-IN",
    dir: "ltr",
    categories: ["finance", "productivity", "business"],
    prefer_related_applications: false,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      { src: "/screenshots/narrow", sizes: "1080x1920", type: "image/png", form_factor: "narrow", label: "Dashboard and Angel AI on a phone" },
      { src: "/screenshots/wide", sizes: "1920x1080", type: "image/png", form_factor: "wide", label: "Budget Pro on desktop" },
    ],
    shortcuts: [
      { name: "Add expense", short_name: "Expense", url: "/expenses?new=1", description: "Add a new expense" },
      { name: "Budgets", url: "/budgets", description: "See what's left in each budget" },
      { name: "Angel suggestions", short_name: "Angel", url: "/insights", description: "Personal money suggestions" },
      { name: "Free calculators", short_name: "Tools", url: "/tools", description: "Income tax, EMI, SIP, FD and more" },
    ],
  };
}
