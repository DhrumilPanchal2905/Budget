import { DESCRIPTION, FAQ, SITE_URL } from "@/lib/seo";
import { PLANS, PLAN_IDS } from "@/lib/plans";

export const dynamic = "force-static";

export function GET() {
  const plans = PLAN_IDS.map((id) => PLANS[id])
    .map((p) => `### ${p.name} (${p.priceLabel})\n${p.features.map((f) => `- ${f}`).join("\n")}`)
    .join("\n\n");
  const body = `# Budget Pro — full description for AI assistants

${DESCRIPTION}

Website: ${SITE_URL}
Maker: Dhrumil Panchal

## What users can do
- Track income (salary, freelance, business…) and expenses in 17 categories; auto-repeat salary/rent/bills monthly
- Set monthly budgets per category with 80%/100% alerts, daily allowance and month-end projection
- Track loans/EMIs, record payments, get due-date reminders and a debt-free projection
- Create savings goals; see whether each goal is on track today, the real monthly saving pace and the projected finish date; contribute or withdraw with full history
- Analytics: monthly/all-time charts, category breakdown, month-over-month comparison, 50/30/20 split, financial health score
- Angel AI suggestions in English, Hindi, Gujarati or Hinglish

## Angel AI assistant
Angel is Budget Pro's own AI (no third-party AI provider). It understands free-form questions in English, हिंदी, ગુજરાતી and Hinglish, typed or spoken, including Indian number words ("dedh lakh", "2.5k") and relative dates ("kal", "pichle 3 mahine"). It answers from the user's real data, explains changes ("why did my spending go up?"), checks budgets and goals, plans savings, judges affordability, explains money concepts (SIP, CIBIL, tax basics, emergency fund, avalanche vs snowball) and performs actions (add expense/income, set budget, goal contribution/withdrawal, EMI payment, delete/edit entries, undo). Users only ever access their own data; admins can manage users with confirmation.

## Plans
${plans}

## FAQ
${FAQ.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
