import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { themeScript } from "@/lib/themes";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const siteUrl = process.env.APP_URL || "https://budget.dhrumilpanchal.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Budget Pro — Personal finance, beautifully organised", template: "%s · Budget Pro" },
  description:
    "Budget Pro is a secure personal finance app to track salary, expenses, EMIs, savings goals and get realtime insights — with professional dashboards and charts.",
  applicationName: "Budget Pro",
  keywords: ["budget", "personal finance", "expense tracker", "EMI tracker", "savings goals", "money manager", "India"],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Budget Pro",
    title: "Budget Pro — Personal finance, beautifully organised",
    description: "Track income, expenses, EMIs and savings goals with realtime dashboards and smart insights.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Budget Pro",
    description: "Track income, expenses, EMIs and savings goals with realtime dashboards and smart insights.",
  },
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="midnight" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
