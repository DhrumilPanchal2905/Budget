// The free calculators (public, no sign-up). One source of truth for the tools index, each tool page, the sitemap
// and llms.txt. The four original tools keep their own pages; the rest are served by /tools/[slug].

export interface ToolDef {
  slug: string;
  title: string;
  /** one line for cards / meta description */
  description: string;
  intro: string;
  keywords: string[];
  faqs: { q: string; a: string }[];
  /** has its own page folder (older tools) */
  legacy?: boolean;
}

export const TOOLS: ToolDef[] = [
  { slug: "emi-calculator", title: "EMI calculator", description: "Calculate your loan EMI, total interest and full repayment instantly — home, car, personal or education loan.", intro: "", keywords: ["emi calculator", "loan emi"], faqs: [], legacy: true },
  { slug: "budget-planner", title: "50/30/20 budget planner", description: "Split your monthly income into needs, wants and savings with the 50/30/20 rule — free budget calculator.", intro: "", keywords: ["50 30 20 rule", "budget planner"], faqs: [], legacy: true },
  { slug: "savings-goal-calculator", title: "Savings goal calculator", description: "Find out how much to save every month to reach any goal by your target date.", intro: "", keywords: ["savings goal calculator"], faqs: [], legacy: true },
  { slug: "sip-calculator", title: "SIP calculator", description: "Estimate how a monthly SIP grows with compounding over time.", intro: "", keywords: ["sip calculator"], faqs: [], legacy: true },
  {
    slug: "income-tax-calculator",
    title: "Income tax calculator (FY 2026-27)",
    description: "Compare new vs old tax regime for FY 2026-27 — slabs, 87A rebate, surcharge and cess, with your monthly TDS.",
    intro: "Find your income tax under both regimes in seconds and see which one saves you more. Updated for FY 2026-27 (AY 2027-28).",
    keywords: ["income tax calculator", "new vs old regime", "tax calculator fy 2026-27", "87a rebate"],
    faqs: [
      { q: "Is income up to ₹12 lakh tax-free in the new regime?", a: "Yes. With the ₹60,000 rebate under section 87A, taxable income up to ₹12 lakh has zero tax in the new regime. Salaried people also get a ₹75,000 standard deduction, so a salary up to ₹12.75 lakh pays no tax." },
      { q: "Which regime should I choose?", a: "If your deductions (80C, 80D, HRA, home-loan interest, NPS) are large — roughly ₹4–5 lakh or more — the old regime may still win. Otherwise the new regime usually gives lower tax. The calculator shows both side by side." },
      { q: "Did Budget 2026 change the slabs?", a: "No. FY 2026-27 uses the same slabs as FY 2025-26: 0–4L nil, 4–8L 5%, 8–12L 10%, 12–16L 15%, 16–20L 20%, 20–24L 25% and above 24L 30% in the new regime." },
    ],
  },
  {
    slug: "fd-calculator",
    title: "FD calculator",
    description: "Fixed deposit maturity and interest with quarterly, monthly or yearly compounding.",
    intro: "See exactly what your fixed deposit will be worth at maturity, the interest you earn and the effective yearly yield.",
    keywords: ["fd calculator", "fixed deposit calculator", "fd interest"],
    faqs: [
      { q: "How is FD interest calculated in India?", a: "Most banks compound FD interest quarterly: Maturity = P × (1 + r/4)^(4 × years), where r is the yearly rate as a decimal." },
      { q: "Is FD interest taxable?", a: "Yes. FD interest is added to your income and taxed at your slab rate. Banks deduct TDS when interest crosses the yearly limit; you can submit Form 15G/15H if your income is below the taxable limit." },
    ],
  },
  {
    slug: "rd-calculator",
    title: "RD calculator",
    description: "Recurring deposit maturity value and interest for any monthly amount and tenure.",
    intro: "Plan a recurring deposit: enter your monthly instalment, rate and months to see the maturity amount.",
    keywords: ["rd calculator", "recurring deposit calculator"],
    faqs: [{ q: "How do banks calculate RD maturity?", a: "Each monthly instalment earns interest compounded quarterly for the time it stays deposited; the maturity value is the sum of all instalments with their interest." }],
  },
  {
    slug: "ppf-calculator",
    title: "PPF calculator",
    description: "Public Provident Fund maturity, interest and year-by-year balance — tax-free returns.",
    intro: "Estimate your PPF balance after 15 years (or extensions) and how much of it is tax-free interest.",
    keywords: ["ppf calculator", "public provident fund"],
    faqs: [
      { q: "What is the PPF lock-in?", a: "15 years, extendable in blocks of 5 years. Partial withdrawals are allowed from the 7th financial year." },
      { q: "How much can I invest in PPF?", a: "From ₹500 up to ₹1.5 lakh per financial year. Deposits made before the 5th of a month earn interest for that month." },
    ],
  },
  {
    slug: "gst-calculator",
    title: "GST calculator",
    description: "Add or remove GST from any price with CGST, SGST and IGST split.",
    intro: "Work out GST-inclusive or GST-exclusive prices in one click, with the CGST/SGST/IGST breakup for your invoice.",
    keywords: ["gst calculator", "gst inclusive", "cgst sgst"],
    faqs: [{ q: "How do I remove GST from a price?", a: "Price before GST = Price including GST × 100 ÷ (100 + GST rate). For 18%: ₹1,180 × 100 ÷ 118 = ₹1,000." }],
  },
  {
    slug: "inflation-calculator",
    title: "Inflation calculator",
    description: "See what things will cost in the future and how inflation reduces the value of money.",
    intro: "Find the future cost of today's expenses and how much purchasing power your money loses over time.",
    keywords: ["inflation calculator", "future value of money"],
    faqs: [{ q: "What inflation rate should I assume?", a: "For long-term planning in India, 5–7% a year is a common assumption; use higher for education and healthcare costs." }],
  },
  {
    slug: "loan-prepayment-calculator",
    title: "Loan prepayment calculator",
    description: "How much interest and how many years you save by prepaying your home or personal loan.",
    intro: "Try extra monthly payments or a one-time prepayment and see the interest saved and how much earlier your loan ends.",
    keywords: ["loan prepayment calculator", "home loan prepayment"],
    faqs: [{ q: "Should I reduce EMI or tenure after prepaying?", a: "Keeping the EMI and reducing the tenure saves much more interest. Reduce the EMI only if your monthly budget is tight." }],
  },
  {
    slug: "compound-interest-calculator",
    title: "Compound interest calculator",
    description: "Future value of a one-time investment with yearly, quarterly or monthly compounding.",
    intro: "See how a lump-sum investment grows with compounding — and how long it takes to double.",
    keywords: ["compound interest calculator", "lumpsum calculator"],
    faqs: [{ q: "What is the rule of 72?", a: "Divide 72 by the yearly return to estimate how many years it takes to double your money. At 12% a year, money doubles in about 6 years." }],
  },
  {
    slug: "retirement-calculator",
    title: "Retirement calculator",
    description: "How big a retirement corpus you need and the monthly SIP to get there.",
    intro: "Plan retirement with inflation: find the corpus you need and the monthly investment that gets you there.",
    keywords: ["retirement calculator", "retirement corpus"],
    faqs: [{ q: "How much do I need to retire?", a: "It depends on your expenses at retirement (today's expenses grown by inflation), how long retirement lasts and the return after retiring. A common rough guide is 25–30 times your yearly expenses at retirement." }],
  },
  {
    slug: "emergency-fund-calculator",
    title: "Emergency fund calculator",
    description: "Your ideal emergency fund and how many months it will take to build it.",
    intro: "Find the right safety net for your expenses and EMIs, and a realistic date to have it ready.",
    keywords: ["emergency fund calculator"],
    faqs: [{ q: "How many months should an emergency fund cover?", a: "Six months of essential expenses plus EMIs is a good default. Choose 9–12 months if your income is irregular or you are the only earner." }],
  },
  {
    slug: "net-worth-calculator",
    title: "Net worth calculator",
    description: "Add up what you own and what you owe to see your real net worth.",
    intro: "Your net worth is the clearest single number for financial progress. Calculate it in a minute.",
    keywords: ["net worth calculator"],
    faqs: [{ q: "What counts as an asset?", a: "Bank balances, investments (stocks, mutual funds, FDs), retirement accounts (PF, PPF, NPS), gold and property at today's market value." }],
  },
  {
    slug: "currency-converter",
    title: "Currency converter",
    description: "Live exchange rates for 45+ currencies — USD, EUR, GBP, AED, SAR, SGD and more to INR.",
    intro: "Convert between world currencies at live mid-market rates.",
    keywords: ["currency converter", "usd to inr", "dollar to rupee"],
    faqs: [{ q: "Why is my bank's rate different?", a: "Banks and card networks add a markup (usually 1–3%) to the mid-market rate shown here." }],
  },
];

export const NEW_TOOLS = TOOLS.filter((t) => !t.legacy);
export const toolBySlug = (slug: string) => TOOLS.find((t) => t.slug === slug);
