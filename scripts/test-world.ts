// Angel "world" answers + calculators + plan pricing — offline tests (no database / network needed).
// Run:  npx tsx scripts/test-world.ts
import { parse, QUERY_INTENTS } from "../src/lib/angel/parse";
import { calculate, emi, fdMaturity, looksLikeCalc, rdMaturity, sipFuture } from "../src/lib/angel/calc";
import { hasPriceWord, isLiveQuestion, isWebCommand, looksLikeQuestion } from "../src/lib/angel/web";
import { cleanQuery } from "../src/lib/web-search";
import { quote } from "../src/lib/billing-quote";
import { effectivePlanId } from "../src/lib/plans";
import { incomeTax } from "../src/lib/tax-india";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`✗ ${name} ${info}`);
  }
};
const TODAY = "2026-10-19";
const WRITE = ["add_expense", "add_income", "goal_contribute", "goal_withdraw", "pay_emi", "create_goal", "create_debt", "delete_last", "delete_entry", "edit_last", "set_budget"];

/** Same decision as engine.worldAnswer(), without calling the network. */
function route(t: string): string {
  const p = parse(t, TODAY);
  if (looksLikeCalc(t)) return "calc";
  if (WRITE.includes(p.intent) && p.amount) return "personal";
  const web = isWebCommand(t);
  const live = isLiveQuestion(t) && !(p.intent !== "unknown" && p.intent !== "kb" && QUERY_INTENTS.includes(p.intent) && (p.expenseCategory || p.hits.self) && !hasPriceWord(t));
  if (!web && !live) return p.intent === "unknown" && looksLikeQuestion(t) ? "web" : "personal";
  if (web && !live && p.intent !== "unknown" && p.intent !== "kb" && QUERY_INTENTS.includes(p.intent) && (p.hits.self || p.hits.expense || p.hits.income || p.hits.recent || p.hits.balance)) return "personal";
  return "web";
}

const ROUTES: [string, string][] = [
  ["aaj sone ka bhav kya hai", "web"], ["gold rate today", "web"], ["petrol price in ahmedabad today", "web"], ["sensex kitna hai abhi", "web"], ["aaj ki taza khabar", "web"], ["repo rate kitna hai", "web"],
  ["google karo india ka pm kaun hai", "web"], ["search for best credit cards in india", "web"], ["internet pe dekho iphone 17 price", "web"], ["who is the governor of rbi", "web"], ["taj mahal kisne banaya", "web"],
  ["aaj petrol 500", "personal"], ["petrol pe kitna kharcha hua", "personal"], ["petrol pe aaj kitna gaya", "personal"], ["mera balance kitna hai", "personal"], ["500 ka petrol add karo", "personal"],
  ["meri emi kab hai", "personal"], ["mera petrol ka kharcha batao", "personal"], ["swiggy ka kharcha search karo", "personal"], ["tum kaun ho", "personal"],
  ["5 lakh loan 9% 5 saal emi", "calc"], ["100 dollar kitne rupaye", "calc"], ["5000 pe 18% gst", "calc"],
];
for (const [t, want] of ROUTES) check(`route "${t}"`, route(t) === want, `→ ${route(t)} (want ${want})`);

// calculators
check("emi 5L 9% 60m", Math.round(emi(500000, 9, 60)) === 10379, String(Math.round(emi(500000, 9, 60))));
check("sip 5000 12% 120m", Math.round(sipFuture(5000, 12, 120)) === 1161695, String(Math.round(sipFuture(5000, 12, 120))));
check("fd 1L 7% 36m", Math.round(fdMaturity(100000, 7, 36)) === 123144, String(Math.round(fdMaturity(100000, 7, 36))));

check("rd 2000 6.5% 24m", Math.round(rdMaturity(2000, 6.5, 24)) === 51370, String(Math.round(rdMaturity(2000, 6.5, 24))));

// tax FY 2026-27
const t = (salary: number, regime: "new" | "old", deductions = 0) => incomeTax({ regime, salary, other: 0, deductions, age: "below60" }).total;
check("tax 12.75L new = 0", t(1275000, "new") === 0);
check("tax 13L new marginal relief = 26000", t(1300000, "new") === 26000, String(t(1300000, "new")));
check("tax 15L new = 97500", t(1500000, "new") === 97500, String(t(1500000, "new")));
check("tax 5.5L old = 0", t(550000, "old") === 0);

// web query clean-up
check("cleanQuery hinglish", cleanQuery("google karo india ka pm kaun hai") === "india pm who", cleanQuery("google karo india ka pm kaun hai"));

// plan pricing
const now = Date.UTC(2026, 9, 19);
const D = 86400000;
const q1 = quote({ plan: "free", role: "user", planExpiresAt: null }, "pro", now);
check("new pro 30 days ₹100", q1.mode === "new" && q1.amountPaise === 10000 && q1.periodEnd.getTime() === now + 30 * D);
const q2 = quote({ plan: "pro", role: "user", planExpiresAt: new Date(now + 10 * D), planSource: "paid" }, "pro", now);
check("renew adds after expiry", q2.mode === "renew" && q2.periodEnd.getTime() === now + 40 * D);
const q3 = quote({ plan: "plus", role: "user", planExpiresAt: new Date(now + 20 * D), planSource: "paid" }, "unlimited", now);
check("upgrade credits days by value", q3.mode === "upgrade" && q3.creditDays === Math.floor((20 * 50) / 500), `credit ${q3.creditDays}`);
let threw = false;
try {
  quote({ plan: "unlimited", role: "user", planExpiresAt: new Date(now + 5 * D), planSource: "paid" }, "plus", now);
} catch {
  threw = true;
}
check("no downgrade during active period", threw);
threw = false;
try {
  quote({ plan: "pro", role: "admin" }, "pro", now);
} catch {
  threw = true;
}
check("admins can't buy", threw);
check("expired paid plan → free", effectivePlanId({ plan: "pro", role: "user", planExpiresAt: new Date(now - D) }, now) === "free");
check("admin-given plan never expires", effectivePlanId({ plan: "pro", role: "user", planExpiresAt: null }, now) === "pro");
const q4 = quote({ plan: "pro", role: "user", planExpiresAt: new Date(now - D), planSource: "paid" }, "pro", now);
check("expired plan → buy again starts now", q4.mode === "new" && q4.periodEnd.getTime() === now + 30 * D);

async function main() {
// a silly tenure must not hang the server (guest input)
const t0 = Date.now();
const huge = await calculate("1000 rd 7% 99999999999999 years", "en");
check("huge tenure is rejected fast", Date.now() - t0 < 200 && (huge === null || huge.kind === "need"), `${huge?.kind} in ${Date.now() - t0}ms`);
const big = await calculate("1000 rd 7% " + "9".repeat(400) + " months", "en");
check("400-digit tenure is rejected", big === null || big.kind === "need", String(big?.kind));

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
}
void main();
