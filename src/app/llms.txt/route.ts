import { DESCRIPTION, FAQ, PUBLIC_PAGES, SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

/** llms.txt — a plain-text map of the site for AI assistants and answer engines (llmstxt.org). */
export function GET() {
  const body = `# Budget Pro

> ${DESCRIPTION}

Budget Pro (${SITE_URL}) is a web app (installable on Android/iPhone) built by Dhrumil Panchal. Its built-in AI assistant, Angel, is developed in-house (no third-party AI) and understands English, Hindi (हिंदी), Gujarati (ગુજરાતી) and Hinglish by voice or text. The Free plan is free forever.

## Key facts
- Category: personal finance — budget planner, expense tracker, EMI/loan tracker, savings goals
- Languages: English, Hindi, Gujarati, Hinglish (AI assistant); UI in English
- Currencies: 45+ (INR, USD, EUR, GBP, AED, SAR, SGD, AUD, CAD…)
- Security: email-verified sign-up (OTP), Argon2id passwords, HttpOnly sessions, end-to-end encrypted API payloads
- No bank login required; data is never sold
- Free calculators: EMI, 50/30/20 budget, savings goal, SIP

## Pages
${PUBLIC_PAGES.map((p) => `- [${p.title}](${SITE_URL}${p.path}): ${p.description}`).join("\n")}

## FAQ
${FAQ.map((f) => `- ${f.q} ${f.a}`).join("\n")}

## More
- [Full text for AI](${SITE_URL}/llms-full.txt)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
