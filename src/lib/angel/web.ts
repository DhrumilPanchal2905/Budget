// Angel AI — questions that are NOT about the user's own money ("google karo …", live prices, general knowledge).
// Angel first tries its own data and knowledge; only these go to the web. Answers are quoted from the sources and
// always come with links.
import { normalize } from "./text";
import { L } from "./i18n";
import type { Lang } from "./parse";
import type { Card } from "./types";
import { googleLink, webSearch, type WebAnswer } from "../web-search";

/** "google karo", "search karo", "internet pe dekho", "गूगल करो", "ઇન્ટરનેટ પર શોધો" … */
const WEB_CMD = /\b(google|googal|gugal|search|internet|online|web|net pe|net par|browse|look up|lookup|find out)\b|गूगल|सर्च|इंटरनेट|ऑनलाइन|ખોજ|ગૂગલ|સર્ચ|ઇન્ટરનેટ|ઓનલાઇન|શોધો|खोजो|ढूंढो/;
/** Prices / rates that change every day — the answer must come from the web, never from memory. */
const LIVE_THING =
  /\b(gold|sona|sone|silver|chandi|petrol|diesel|cng|lpg|cylinder|bitcoin|btc|ethereum|crypto|share|shares|stock|stocks|nav|fd|home loan|car loan|personal loan|ppf|epf|sukanya|nsc|onion|tomato)\b|सोना|सोने|चांदी|पेट्रोल|डीजल|शेयर|सिलेंडर|સોનું|સોના|ચાંદી|પેટ્રોલ|ડીઝલ|શેર|સિલિન્ડર/;
const PRICE_WORD = /\b(rate|rates|price|prices|bhav|bhaav|kimat|keemat|cost|value|today|todays|aaj|aajka|current|latest|live)\b|भाव|कीमत|रेट|आज|ભાવ|કિંમત|રેટ|આજ/;
/** Always-live topics (no price word needed). */
const LIVE_TOPIC =
  /\b(sensex|nifty|bank nifty|repo rate|reverse repo|inflation rate|cpi inflation|gdp|news|khabar|samachar|headlines?|weather|mausam|union budget|budget 20\d\d|tax slabs?|income tax slabs?|new regime|old regime|ipo|rbi policy|gst council|stock market|share market)\b|सेंसेक्स|निफ्टी|खबर|समाचार|मौसम|रेपो रेट|टैक्स स्लैब|શેરબજાર|સેન્સેક્સ|નિફ્ટી|સમાચાર|હવામાન|રેપો રેટ|ટેક્સ સ્લેબ/;
const PERSONAL = /\b(my|mera|meri|mere|mujhe|maine|maru|mari|mara|maro|mane|hamara|hamari)\b|मेरा|मेरी|मेरे|मुझे|मैंने|મારું|મારી|મારા|મારો|મને|મેં/;
const QUESTION = /\?|\b(kisne|kisko|kiska|kiski|kise|kone|kona|what|who|whom|whose|when|where|which|why|how|is|are|does|do|can|kya|kaun|kon|kab|kahan|kaha|kyu|kyun|kyon|kaise|kitna|kitne|kitni|konsa|kaunsa|shu|su|kon|kyare|kya|kem|kevi|ketlu|ketla|ketli|tell|explain|meaning|matlab|define|batao|bataiye|samjhao)\b|किसने|किसको|किसका|कोणे|કોણે|क्या|कौन|कब|कहां|कहाँ|क्यों|कैसे|कितना|कितने|मतलब|બતાવો|શું|કોણ|ક્યારે|ક્યાં|કેમ|કેવી|કેટલું|કેટલા|અર્થ/;

export function isWebCommand(raw: string): boolean {
  const s = normalize(raw);
  return WEB_CMD.test(s) && !/\b(search|find|dhundo|khojo)\b.*\b(expense|kharcha|entry|income|goal|transaction)\b/.test(s);
}

/** A live-data question about the world (not about the user's own entries). */
export function isLiveQuestion(raw: string): boolean {
  const s = normalize(raw);
  if (LIVE_TOPIC.test(s)) return !PERSONAL.test(s) || /\b(rate|slab|news|market)\b/.test(s);
  if (!LIVE_THING.test(s) || !PRICE_WORD.test(s)) return false;
  // "mera petrol ka kharcha", "aaj petrol pe kitna gaya" → own data. A price word like bhav/rate keeps it live.
  if (/\b(kharcha|kharch|spent|spend|expense|kharchi|kharach)\b|खर्च|ખર્ચ/.test(s) && !/\b(rate|rates|price|prices|bhav|bhaav|kimat|keemat)\b|भाव|कीमत|ભાવ|કિંમત/.test(s)) return false;
  return true;
}

/** An explicit price word (bhav / rate / price / kimat) — "petrol ka bhav" is a price question for sure. */
export function hasPriceWord(raw: string): boolean {
  return /\b(rate|rates|price|prices|bhav|bhaav|kimat|keemat|nav)\b|भाव|कीमत|रेट|ભાવ|કિંમત|રેટ/.test(normalize(raw));
}

export function looksLikeQuestion(raw: string): boolean {
  const s = normalize(raw);
  return QUESTION.test(s) || raw.includes("?");
}

export interface WebReply {
  text: string;
  speak: string;
  cards: Card[];
  found: boolean;
}

const LEAD: Record<Lang, { found: string; live: string; none: string; src: string }> = {
  en: { found: "Here's what I found on the web:", live: "Latest from the web:", none: "I couldn't find a clear answer on the web. You can open the full Google results below.", src: "Source" },
  hi: { found: "वेब पर मुझे ये मिला:", live: "वेब से ताज़ा जानकारी:", none: "वेब पर साफ़ जवाब नहीं मिला। नीचे Google के पूरे नतीजे खोल सकते हैं।", src: "स्रोत" },
  gu: { found: "વેબ પર મને આ મળ્યું:", live: "વેબ પરથી તાજી માહિતી:", none: "વેબ પર સ્પષ્ટ જવાબ મળ્યો નહીં. નીચે Google ના પૂરા પરિણામ ખોલી શકો.", src: "સ્ત્રોત" },
  hn: { found: "Web pe mujhe ye mila:", live: "Web se latest jaankari:", none: "Web pe clear answer nahi mila. Neeche Google ke poore results khol sakte hain.", src: "Source" },
};

export function linksCard(ans: WebAnswer | null, query: string, lang: Lang): Card {
  const items = (ans?.results ?? []).slice(0, 3).map((r) => ({ title: r.title, url: r.url, snippet: r.snippet.slice(0, 160), source: r.source }));
  const g = googleLink(query);
  items.push({ title: g.title, url: g.url, snippet: "", source: g.source });
  return { type: "links", title: L(lang, { en: "Sources", hi: "स्रोत", gu: "સ્ત્રોત", hn: "Sources" }), items };
}

/** Looks the question up on the web and builds Angel's reply. */
export async function webReply(raw: string, lang: Lang, opts: { live?: boolean } = {}): Promise<WebReply> {
  const ans = await webSearch(raw, lang, opts);
  const t = LEAD[lang];
  const q = ans?.query ?? raw;
  if (!ans || (!ans.answer && !ans.results.length)) {
    return { text: t.none, speak: t.none, cards: [linksCard(null, q, lang)], found: false };
  }
  const body = ans.answer ?? ans.results[0].snippet;
  const via = ans.results[0]?.source ? `${t.src}: ${ans.results[0].source}${ans.provider && !ans.results[0].source.includes(ans.provider.toLowerCase()) ? ` · ${ans.provider}` : ""}` : `${t.src}: ${ans.provider}`;
  const text = `${opts.live ? t.live : t.found}\n${body}\n(${via})`;
  const speak = `${opts.live ? t.live : t.found} ${body.split(/(?<=[.!?।])\s/).slice(0, 2).join(" ")}`;
  return { text, speak, cards: [linksCard(ans, q, lang)], found: true };
}
