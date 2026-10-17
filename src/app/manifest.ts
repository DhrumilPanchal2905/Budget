import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Budget Pro — AI budget planner",
    short_name: "Budget Pro",
    description: "Budget planner & expense tracker with Angel AI in English, Hindi and Gujarati.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "en-IN",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add expense", url: "/expenses?new=1" },
      { name: "Budgets", url: "/budgets" },
      { name: "Angel suggestions", url: "/insights" },
    ],
  };
}
