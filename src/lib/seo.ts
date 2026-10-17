// Central SEO facts (one source of truth for metadata, JSON-LD, sitemap, llms.txt).
export const SITE_URL = (process.env.APP_URL || "https://budget.dhrumilpanchal.in").replace(/\/$/, "");
export const SITE_NAME = "Budget Pro";
export const AUTHOR = { name: "Dhrumil Panchal", url: "https://dhrumilpanchal.in" };
export const TAGLINE = "Free AI budget planner & expense tracker — in English, हिंदी and ગુજરાતી";
export const DESCRIPTION =
  "Budget Pro is a free, secure budget planner and expense tracker with its own AI assistant, Angel, that understands English, Hindi and Gujarati. Track income, expenses, EMIs and savings goals, set category budgets, get accurate suggestions and a monthly 50/30/20 analysis — by voice or chat.";

export const KEYWORDS = [
  "budget planner",
  "expense tracker",
  "AI budget app",
  "money manager",
  "personal finance app India",
  "EMI tracker",
  "loan tracker",
  "savings goal tracker",
  "50/30/20 budget",
  "monthly budget planner",
  "Hindi budget app",
  "Gujarati budget app",
  "voice expense tracker",
  "free budget app",
  "बजट ऐप",
  "खर्च ट्रैकर",
  "बजट प्लानर",
  "બજેટ એપ",
  "ખર્ચ ટ્રેકર",
  "hisab kitab app",
  "kharcha app",
];

/** Public, indexable pages (used by the sitemap, llms.txt and internal links). */
export const PUBLIC_PAGES: { path: string; title: string; description: string; priority: number; freq: "daily" | "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", title: "Budget Pro — AI budget planner & expense tracker", description: DESCRIPTION, priority: 1, freq: "weekly" },
  { path: "/features", title: "Features", description: "Everything in Budget Pro: income & expense tracking, category budgets, EMIs, savings goals, analytics, realtime sync, push reminders and bank-grade security.", priority: 0.9, freq: "monthly" },
  { path: "/angel-ai", title: "Angel AI — your multilingual money assistant", description: "Angel is Budget Pro's own AI. Ask about your money in English, Hindi or Gujarati — by voice or text — and get accurate answers, reasons and suggestions from your real data.", priority: 0.9, freq: "monthly" },
  { path: "/pricing", title: "Pricing", description: "Start free. Plus and Pro add more records and advanced insights; Unlimited includes Angel AI.", priority: 0.8, freq: "monthly" },
  { path: "/tools", title: "Free money calculators", description: "Free EMI calculator, 50/30/20 budget planner, savings goal calculator and SIP calculator — no sign-up needed.", priority: 0.8, freq: "monthly" },
  { path: "/tools/emi-calculator", title: "EMI calculator", description: "Calculate your loan EMI, total interest and full repayment instantly — home, car, personal or education loan.", priority: 0.8, freq: "monthly" },
  { path: "/tools/budget-planner", title: "50/30/20 budget planner", description: "Split your monthly income into needs, wants and savings with the 50/30/20 rule — free budget calculator.", priority: 0.8, freq: "monthly" },
  { path: "/tools/savings-goal-calculator", title: "Savings goal calculator", description: "Find out how much to save every month to reach any goal by your target date.", priority: 0.7, freq: "monthly" },
  { path: "/tools/sip-calculator", title: "SIP calculator", description: "Estimate how a monthly SIP grows with compounding over time.", priority: 0.7, freq: "monthly" },
  { path: "/faq", title: "FAQ", description: "Answers about Budget Pro: security, Angel AI languages, budgets, goals, EMIs, plans and data privacy.", priority: 0.7, freq: "monthly" },
  { path: "/about", title: "About", description: "Why Budget Pro exists and who builds it.", priority: 0.5, freq: "yearly" },
  { path: "/register", title: "Create a free account", description: "Create your free Budget Pro account in under a minute.", priority: 0.7, freq: "yearly" },
  { path: "/login", title: "Sign in", description: "Sign in to Budget Pro.", priority: 0.4, freq: "yearly" },
  { path: "/privacy", title: "Privacy policy", description: "How Budget Pro collects, uses and protects your data.", priority: 0.3, freq: "yearly" },
  { path: "/terms", title: "Terms of service", description: "The terms for using Budget Pro.", priority: 0.3, freq: "yearly" },
];

export const FAQ: { q: string; a: string }[] = [
  { q: "Is Budget Pro free?", a: "Yes. The Free plan includes 100 finance records, 3 savings goals, dashboards, budgets, basic insights and realtime sync. Plus and Pro raise the limits and add advanced insights; Unlimited (assigned by an admin) also includes the Angel AI assistant." },
  { q: "What is Angel AI?", a: "Angel is Budget Pro's own AI assistant, built in-house without any third-party AI service. It answers questions about your money from your real data, explains why things changed, plans savings, checks budgets and goals, and can add entries for you — by voice or chat." },
  { q: "Which languages does Angel understand?", a: "English, Hindi (हिंदी), Gujarati (ગુજરાતી) and Hinglish / romanised Gujarati — in native script or English letters, typed or spoken. Replies come in the language you ask in, or the one you choose in Settings." },
  { q: "Is my financial data safe?", a: "Passwords are hashed with Argon2id, sessions use HttpOnly secure cookies, every API request and response is end-to-end encrypted on top of HTTPS, data is strictly isolated per user, and every sensitive action is audited. Budget Pro never sells your data." },
  { q: "Do I need to connect my bank account?", a: "No. You add income and expenses yourself (or just tell Angel, e.g. “petrol 500”). Salary, rent and bills can auto-repeat every month." },
  { q: "How do budgets work?", a: "Set a monthly limit per category (or for the whole month). Budget Pro shows what's left, what you can spend per day, projects month-end spending, and notifies you at 80% and 100%." },
  { q: "How does Budget Pro know if my savings goal is on track?", a: "It compares how much you've saved with how much you should have saved by today, tracks your real monthly saving pace from your contribution history, and projects the finish date — so you know early if you're behind." },
  { q: "Can I use it in other currencies?", a: "Yes. Budget Pro supports 45+ world currencies, including INR, USD, EUR, GBP, AED, SAR, SGD, AUD and CAD, with correct local number formatting." },
  { q: "Does it work on mobile?", a: "Yes. It's fully responsive and can be installed on your home screen (Android and iPhone) like an app, with push notifications for EMI reminders and budget alerts." },
];

export function jsonLd(data: Record<string, unknown> | Record<string, unknown>[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export const ORG_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#org`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  founder: { "@type": "Person", name: AUTHOR.name },
};

export const WEBSITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: SITE_NAME,
  description: DESCRIPTION,
  inLanguage: ["en", "hi", "gu"],
  publisher: { "@id": `${SITE_URL}/#org` },
};

export const APP_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#app`,
  name: SITE_NAME,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web, Android, iOS (installable PWA)",
  url: SITE_URL,
  description: DESCRIPTION,
  inLanguage: ["en", "hi", "gu"],
  offers: [{ "@type": "Offer", price: "0", priceCurrency: "INR", name: "Free" }],
  featureList: [
    "Income and expense tracking",
    "Category budgets with alerts",
    "EMI and loan tracking",
    "Savings goals with on-track projection",
    "AI assistant in English, Hindi and Gujarati (voice and chat)",
    "50/30/20 analysis",
    "Realtime sync across devices",
    "End-to-end encrypted API",
  ],
  author: { "@type": "Person", name: AUTHOR.name },
  publisher: { "@id": `${SITE_URL}/#org` },
};

export function faqLd(items = FAQ) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}

export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: `${SITE_URL}${t.path}` })),
  };
}

export function pageMeta(path: string, extra: { title?: string; description?: string } = {}) {
  const p = PUBLIC_PAGES.find((x) => x.path === path);
  const title = extra.title ?? p?.title ?? SITE_NAME;
  const description = extra.description ?? p?.description ?? DESCRIPTION;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: `${SITE_URL}${path}`, type: "website" as const, siteName: SITE_NAME },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}
