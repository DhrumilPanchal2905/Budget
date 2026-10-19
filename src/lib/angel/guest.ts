// Angel AI for visitors who are NOT signed in (public pages). No database access at all: Angel answers money
// questions from its own knowledge, does calculations (EMI, SIP, FD, GST, currency …) and looks general questions
// up on the web. Anything about "my balance / my expenses" or adding entries needs a free account.
import { parse, QUERY_INTENTS, type Intent, type Lang } from "./parse";
import { KB } from "./brain/knowledge";
import { L, forSpeech, greetingByHour, type T4 } from "./i18n";
import { pickBestGuess, worldAnswer, type EngineReply } from "./engine";
import { looksLikeQuestion, webReply } from "./web";
import { ymd } from "./dates";
import { APP_TIMEZONE } from "../env";
import type { AngelLangPref, Card } from "./types";

export interface GuestResult {
  reply: EngineReply;
  web: boolean;
}

const q = (en: string, hi: string, gu: string, hn: string): T4 => ({ en, hi, gu, hn });

const START: T4[] = [
  q("5 lakh loan at 9% for 5 years — EMI?", "5 लाख लोन 9% 5 साल EMI?", "5 લાખ લોન 9% 5 વર્ષ EMI?", "5 lakh loan 9% 5 saal EMI?"),
  q("How do I make a budget?", "बजट कैसे बनाएं?", "બજેટ કેવી રીતે બનાવવું?", "Budget kaise banaye?"),
  q("₹5,000 SIP for 10 years at 12%", "₹5,000 SIP 10 साल 12%", "₹5,000 SIP 10 વર્ષ 12%", "₹5,000 SIP 10 saal 12%"),
];
const MORE: T4[] = [
  q("What is the 50/30/20 rule?", "50/30/20 नियम क्या है?", "50/30/20 નિયમ શું છે?", "50/30/20 rule kya hai?"),
  q("How to improve my credit score?", "क्रेडिट स्कोर कैसे बढ़ाएं?", "ક્રેડિટ સ્કોર કેવી રીતે વધારવો?", "Credit score kaise badhaye?"),
  q("100 dollars in rupees", "100 डॉलर कितने रुपये", "100 ડોલર કેટલા રૂપિયા", "100 dollar kitne rupaye"),
];
const sugs = (lang: Lang, list: T4[]) => list.map((x) => x[lang]).slice(0, 3);

function reply(lang: Lang, text: string, extra: Partial<EngineReply> = {}): EngineReply {
  return { text, lang, ...extra, speak: forSpeech(extra.speak ?? text) };
}

function signInCard(lang: Lang, why: T4): Card {
  return {
    type: "cta",
    title: L(lang, { en: "Free account = answers from YOUR money", hi: "फ्री अकाउंट = आपके अपने पैसों से जवाब", gu: "ફ્રી એકાઉન્ટ = તમારા પોતાના પૈસા પરથી જવાબ", hn: "Free account = aapke apne paison se jawab" }),
    text: L(lang, why),
    actions: [
      { label: L(lang, { en: "Create free account", hi: "फ्री अकाउंट बनाएं", gu: "ફ્રી એકાઉન્ટ બનાવો", hn: "Free account banaye" }), href: "/register", primary: true },
      { label: L(lang, { en: "Sign in", hi: "साइन इन", gu: "સાઇન ઇન", hn: "Sign in" }), href: "/login" },
    ],
  };
}

const PERSONAL_WHY = q(
  "Sign in and I'll answer from your real income, expenses, EMIs, budgets and goals — and add entries when you say “500 petrol”. It's free.",
  "साइन इन करें — फिर मैं आपकी असली आमदनी, खर्च, EMI, बजट और गोल से जवाब दूंगी, और “500 पेट्रोल” बोलने पर एंट्री भी जोड़ दूंगी। ये फ्री है।",
  "સાઇન ઇન કરો — પછી હું તમારી સાચી આવક, ખર્ચ, EMI, બજેટ અને ગોલ પરથી જવાબ આપીશ, અને “500 પેટ્રોલ” બોલો તો એન્ટ્રી પણ ઉમેરીશ. આ ફ્રી છે.",
  "Sign in kijiye — phir main aapki asli income, kharcha, EMI, budget aur goals se jawab dungi, aur “500 petrol” bolne pe entry bhi add kar dungi. Ye free hai.",
);

const ACTIONS: Intent[] = ["add_expense", "add_income", "goal_contribute", "goal_withdraw", "pay_emi", "create_goal", "create_debt", "delete_last", "delete_entry", "edit_last", "set_budget", "undo"];
const ADMIN: Intent[] = ["platform_summary", "list_users", "user_info", "create_user", "change_plan", "top_users", "users_query", "visitors", "delete_user", "disable_user", "enable_user", "reset_password", "delete_account"];

function istHour(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()));
}

/** Topic for generic advice questions a guest asks ("paise kaise bachaun?" → saving habits). */
const ADVICE_TOPIC: Partial<Record<Intent, string>> = { advice: "saving_habits", afford: "saving_habits", rule_503020: "rule503020", emergency_fund: "saving_habits", budget_status: "budgeting", health: "saving_habits", insights: "saving_habits", subscriptions: "saving_habits", forecast: "budgeting" };

export async function guestRespond(input: { text: string; langPref: AngelLangPref; alts?: string[] }): Promise<GuestResult> {
  const today = ymd(new Date());
  let text = input.text;
  let p = parse(text, today);
  // voice: use the browser guess that makes the most sense
  if (input.alts?.length) {
    const best = pickBestGuess(text, input.alts, today);
    if (best !== text) {
      text = best;
      p = parse(best, today);
    }
  }
  const lang: Lang = input.langPref !== "auto" ? input.langPref : p.lang;
  const intent = p.intent;

  // world questions first: calculators, currency, live prices, "google karo"
  const world = await worldAnswer(text, p, lang, "INR");
  if (world) return { reply: { ...world.reply, suggestions: world.reply.suggestions ?? sugs(lang, MORE) }, web: world.web };

  if (intent === "greet")
    return { reply: reply(lang, `${greetingByHour(lang, istHour(), "")} ` + L(lang, q("I'm Angel, Budget Pro's money assistant. Ask me about budgeting, saving, loans or any calculation — in English, हिंदी or ગુજરાતી.", "मैं एंजल हूं, Budget Pro की मनी असिस्टेंट। बजट, बचत, लोन या कोई भी हिसाब पूछिए — हिंदी, English या ગુજરાતી में।", "હું એન્જલ છું, Budget Pro ની મની આસિસ્ટન્ટ. બજેટ, બચત, લોન કે કોઈ પણ ગણતરી પૂછો — ગુજરાતી, हिंदी કે English માં.", "Main Angel hoon, Budget Pro ki money assistant. Budget, bachat, loan ya koi bhi hisaab poochiye — Hindi, English ya Gujarati mein.")).trim(), { suggestions: sugs(lang, START) }), web: false };
  if (intent === "identity" || intent === "help")
    return {
      reply: reply(lang, L(lang, q(
        "I'm Angel — Budget Pro's own AI. Without signing in I can: explain money topics (budgeting, SIP, credit score, tax basics), calculate EMI / SIP / FD / RD / GST / inflation, convert currencies, and look things up on the web. With a free account I also answer from your own income, expenses, budgets and goals, and add entries by voice or chat.",
        "मैं एंजल हूं — Budget Pro की अपनी AI। बिना साइन इन के मैं: पैसों से जुड़े विषय समझा सकती हूं (बजट, SIP, क्रेडिट स्कोर, टैक्स), EMI / SIP / FD / RD / GST / महंगाई का हिसाब कर सकती हूं, करेंसी बदल सकती हूं और वेब पर ढूंढ सकती हूं। फ्री अकाउंट से आपकी अपनी आमदनी, खर्च, बजट और गोल से जवाब दूंगी और बोलकर एंट्री भी जोड़ूंगी।",
        "હું એન્જલ છું — Budget Pro ની પોતાની AI. સાઇન ઇન વગર હું: પૈસાના વિષયો સમજાવી શકું (બજેટ, SIP, ક્રેડિટ સ્કોર, ટેક્સ), EMI / SIP / FD / RD / GST / મોંઘવારીની ગણતરી કરી શકું, ચલણ બદલી શકું અને વેબ પર શોધી શકું. ફ્રી એકાઉન્ટથી તમારી પોતાની આવક, ખર્ચ, બજેટ અને ગોલ પરથી જવાબ આપીશ અને બોલીને એન્ટ્રી પણ ઉમેરીશ.",
        "Main Angel hoon — Budget Pro ki apni AI. Bina sign in ke main: paison ke topics samjha sakti hoon (budget, SIP, credit score, tax), EMI / SIP / FD / RD / GST / inflation ka hisaab kar sakti hoon, currency convert kar sakti hoon aur web pe dhoondh sakti hoon. Free account se aapki apni income, kharcha, budget aur goals se jawab dungi aur bolkar entries bhi add karungi.",
      )), { cards: [signInCard(lang, PERSONAL_WHY)], suggestions: sugs(lang, START) }),
      web: false,
    };
  if (intent === "thanks" || intent === "ack" || intent === "yes" || intent === "no")
    return { reply: reply(lang, L(lang, q("Happy to help! 😊 Anything else?", "खुशी हुई! 😊 और कुछ?", "આનંદ થયો! 😊 બીજું કંઈ?", "Khushi hui! 😊 Aur kuch?")), { suggestions: sugs(lang, MORE) }), web: false };
  if (intent === "stop") return { reply: reply(lang, L(lang, q("Bye! Come back anytime.", "अलविदा! कभी भी वापस आइए।", "આવજો! ક્યારેય પણ પાછા આવજો.", "Bye! Kabhi bhi wapas aaiye."))), web: false };

  // money knowledge
  const topic = intent === "kb" ? p.kbTopic : ADVICE_TOPIC[intent];
  if (topic && KB[topic] && !(p.hits.self && intent !== "kb")) {
    const e = KB[topic];
    const body = L(lang, e.answer);
    return { reply: reply(lang, body, { speak: body.split(/(?<=[.।])\s/).slice(0, 2).join(" "), suggestions: sugs(lang, MORE) }), web: false };
  }

  // personal data / actions → need an account
  if (ACTIONS.includes(intent) || QUERY_INTENTS.includes(intent) || ADMIN.includes(intent)) {
    const isAdmin = ADMIN.includes(intent);
    const msg = isAdmin
      ? q("That's only available to signed-in administrators.", "ये सिर्फ़ साइन-इन एडमिन के लिए है।", "આ ફક્ત સાઇન-ઇન એડમિન માટે છે.", "Ye sirf signed-in admin ke liye hai.")
      : ACTIONS.includes(intent)
        ? q("To save entries I need you signed in — then just say it and I'll add it.", "एंट्री सेव करने के लिए साइन इन ज़रूरी है — फिर बस बोलिए, मैं जोड़ दूंगी।", "એન્ટ્રી સેવ કરવા સાઇન ઇન જરૂરી છે — પછી ફક્ત બોલો, હું ઉમેરી દઈશ.", "Entry save karne ke liye sign in zaroori hai — phir bas boliye, main add kar dungi.")
        : q("That's about your own money — sign in and I'll answer from your real data.", "ये आपके अपने पैसों का सवाल है — साइन इन करें, मैं आपके असली डेटा से जवाब दूंगी।", "આ તમારા પોતાના પૈસાનો સવાલ છે — સાઇન ઇન કરો, હું તમારા સાચા ડેટા પરથી જવાબ આપીશ.", "Ye aapke apne paison ka sawaal hai — sign in kijiye, main aapke asli data se jawab dungi.");
    return { reply: reply(lang, L(lang, msg), { cards: isAdmin ? [] : [signInCard(lang, PERSONAL_WHY)], suggestions: sugs(lang, START) }), web: false };
  }

  // anything else that looks like a question → web
  if (looksLikeQuestion(text) || p.contentWords.length >= 2) {
    const w = await webReply(text, lang);
    if (w.found) return { reply: reply(lang, w.text, { speak: w.speak, cards: w.cards, suggestions: sugs(lang, MORE) }), web: true };
  }
  return {
    reply: reply(lang, L(lang, q(
      "I didn't quite get that. Ask me about budgeting or saving, or a calculation like “5 lakh loan 9% 5 years EMI”.",
      "ये मैं ठीक से समझ नहीं पाई। बजट, बचत या कोई हिसाब पूछिए, जैसे “5 लाख लोन 9% 5 साल EMI”।",
      "આ હું બરાબર સમજી નહીં. બજેટ, બચત કે કોઈ ગણતરી પૂછો, જેમ કે “5 લાખ લોન 9% 5 વર્ષ EMI”.",
      "Ye main theek se samajh nahi paayi. Budget, bachat ya koi hisaab poochiye, jaise “5 lakh loan 9% 5 saal EMI”.",
    )), { suggestions: sugs(lang, START) }),
    web: false,
  };
}
