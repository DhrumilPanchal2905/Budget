// Angel AI — money calculators understood from plain speech/text, in English, हिंदी, ગુજરાતી and Hinglish:
//   "5 lakh loan 9% 5 saal ki EMI", "5000 ki SIP 12% 10 years", "1 lakh FD 7% 3 saal", "2000 RD 6.5% 2 years",
//   "1 lakh 12% pe 10 saal mein kitna banega", "5000 pe 18% GST", "18% of 2500", "100 dollar kitne rupaye",
//   "10 saal baad 1 lakh ki value (inflation 6%)".
// Pure maths (plus one free exchange-rate API for currency) — the same formulas as the free tools pages.
import { normalize, tokenize } from "./text";
import { extractAmounts } from "./numbers";
import { L, money, type T4 } from "./i18n";
import type { Lang } from "./parse";
import type { Card } from "./types";

export interface CalcAnswer {
  kind: "emi" | "sip" | "fd" | "rd" | "lumpsum" | "gst" | "percent" | "inflation" | "fx" | "need";
  text: string;
  speak: string;
  cards?: Card[];
  /** where a number came from (exchange rates) */
  source?: { title: string; url: string };
}

const PCT = /(\d+(?:\.\d+)?)\s*(?:%|percent|per cent|pratishat|takka|taka|टका|प्रतिशत|ટકા)/;
const YEARS = /(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yr|saal|sal|varsh|varas|varsh|वर्ष|वर्षों|साल|सालों|વર્ષ|વરસ)(?![a-z])/;
const MONTHS = /(\d+(?:\.\d+)?)\s*(?:months?|mahine|mahina|mahino|maheene|महीने|महीना|महीनों|માસ|મહિના|મહિને)(?![a-z])/;

const has = (s: string, re: RegExp) => re.test(s);
const R = (n: number) => Math.round(n);

/** Tenure in months — sane values only (1 month … 50 years), so a silly number can't hang the server. */
function tenureMonths(s: string): { months: number; match: string } | null {
  const y = YEARS.exec(s);
  const m = y ? null : MONTHS.exec(s);
  const months = y ? Math.round(Number(y[1]) * 12) : m ? Math.round(Number(m[1])) : NaN;
  if (!Number.isFinite(months) || months < 1 || months > 600) return null;
  return { months, match: (y ?? m)![0] };
}

/** The principal: the biggest amount that is not the rate or the tenure. */
function principalOf(s: string, strip: string[]): number | null {
  let rest = s;
  for (const x of strip) if (x) rest = rest.replace(x, " ");
  const hits = extractAmounts(tokenize(rest));
  if (!hits.length) return null;
  return hits.reduce((a, b) => (b.value > a.value ? b : a)).value;
}

const yrs = (lang: Lang, months: number) => {
  const y = months / 12;
  const n = Number.isInteger(y) ? y : Math.round(y * 10) / 10;
  if (months % 12 !== 0 && months < 24) return L(lang, { en: `${months} months`, hi: `${months} महीने`, gu: `${months} મહિના`, hn: `${months} mahine` });
  return L(lang, { en: `${n} year${n === 1 ? "" : "s"}`, hi: `${n} साल`, gu: `${n} વર્ષ`, hn: `${n} saal` });
};

function stats(items: { label: string; value: string; tone?: "pos" | "neg" | "neutral" }[]): Card {
  return { type: "stats", items };
}

// ---------------- formulas (exported for tests and the tools pages) ----------------
export function emi(p: number, annualPct: number, months: number): number {
  const r = annualPct / 12 / 100;
  if (r === 0) return p / months;
  const f = Math.pow(1 + r, months);
  return (p * r * f) / (f - 1);
}
export function sipFuture(monthly: number, annualPct: number, months: number): number {
  const i = annualPct / 12 / 100;
  if (i === 0) return monthly * months;
  return monthly * ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
}
export function fdMaturity(p: number, annualPct: number, months: number): number {
  return p * Math.pow(1 + annualPct / 400, (4 * months) / 12); // quarterly compounding (Indian banks)
}
export function rdMaturity(monthly: number, annualPct: number, months: number): number {
  // Σ P·(1+r/400)^(k/3) for k = 1…n — each instalment compounds quarterly for the months it stays (closed form)
  const q = Math.pow(1 + annualPct / 400, 1 / 3);
  if (q === 1) return monthly * months;
  return (monthly * q * (Math.pow(q, months) - 1)) / (q - 1);
}
export function lumpsum(p: number, annualPct: number, months: number): number {
  return p * Math.pow(1 + annualPct / 100, months / 12);
}

// ---------------- currency ----------------
const cw = (latin: string, native = ""): RegExp => new RegExp(`\\b(?:${latin})\\b${native ? `|${native}` : ""}`);
const CURRENCY_WORDS: [RegExp, string][] = [
  [cw("usd|us dollars?|dollars?|dolar|daler", "डॉलर|डालर|ડોલર|ડૉલર|\\$"), "USD"],
  [cw("eur|euros?", "यूरो|युरो|યુરો|€"), "EUR"],
  [cw("gbp|pounds?|pound sterling", "पाउंड|पौंड|પાઉન્ડ|£"), "GBP"],
  [cw("aed|dirhams?", "दिरहम|દિરહામ"), "AED"],
  [cw("sar|riyals?", "रियाल|રિયાલ"), "SAR"],
  [cw("jpy|yen", "येन|યેન|¥"), "JPY"],
  [cw("cad|canadian dollars?"), "CAD"],
  [cw("aud|australian dollars?"), "AUD"],
  [cw("sgd|singapore dollars?"), "SGD"],
  [cw("cny|yuan|rmb"), "CNY"],
  [cw("chf|swiss francs?"), "CHF"],
  [cw("npr|nepali rupees?"), "NPR"],
  [cw("inr|rupees?|rupaye|rupay|rupiya|rupiye|rupaiya|rs", "रुपये|रुपए|रुपया|રૂપિયા|રૂપિયો|₹"), "INR"],
];

const fxCache = new Map<string, { at: number; rates: Record<string, number> }>();
async function rates(base: string): Promise<Record<string, number> | null> {
  const hit = fxCache.get(base);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.rates;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const d = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (d.result !== "success" || !d.rates) return null;
    fxCache.set(base, { at: Date.now(), rates: d.rates });
    return d.rates;
  } catch {
    return null;
  }
}

function currenciesIn(s: string): string[] {
  const found: { code: string; at: number }[] = [];
  for (const [re, code] of CURRENCY_WORDS) {
    const m = re.exec(s);
    if (m && !found.some((f) => f.code === code)) found.push({ code, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.code);
}

const FX_HINT = /\b(rate|bhav|bhaav|price|convert|conversion|exchange|to|in|me|mein|ma|kitne|kitna|ketla|ketlo|equals?|=)\b|कितने|कितना|में|કેટલા|કેટલો|માં|भाव|ભાવ/;

async function fx(s: string, lang: Lang, homeCurrency: string): Promise<CalcAnswer | null> {
  const codes = currenciesIn(s);
  if (!codes.length || !FX_HINT.test(s)) return null;
  // only a currency word alone ("rupees") is not a conversion
  if (codes.length === 1 && codes[0] === (homeCurrency || "INR")) return null;
  const from = codes[0];
  const to = codes.length > 1 ? codes[1] : from === (homeCurrency || "INR") ? "USD" : homeCurrency || "INR";
  if (from === to) return null;
  const amount = principalOf(s, []) ?? Number(/(\d+(?:\.\d+)?)/.exec(s)?.[1] ?? 1);
  const r = await rates(from);
  if (!r || !r[to]) {
    return { kind: "fx", text: L(lang, { en: "I couldn't reach the live exchange rates right now. Please try again in a minute.", hi: "अभी लाइव एक्सचेंज रेट नहीं मिल पाए। थोड़ी देर में फिर कोशिश कीजिए।", gu: "હમણાં લાઇવ એક્સચેન્જ રેટ મળ્યા નહીં. થોડી વાર પછી ફરી પ્રયાસ કરો.", hn: "Abhi live exchange rate nahi mil paaye. Thodi der mein phir try kijiye." }), speak: "" };
  }
  const value = amount * r[to];
  const fmt = (n: number, c: string) => {
    try {
      return new Intl.NumberFormat(c === "INR" ? "en-IN" : "en-US", { style: "currency", currency: c, maximumFractionDigits: n < 10 ? 4 : 2 }).format(n);
    } catch {
      return `${n.toFixed(2)} ${c}`;
    }
  };
  const a = fmt(amount, from);
  const b = fmt(value, to);
  const one = fmt(r[to], to);
  const text = L(lang, {
    en: `${a} = ${b} (1 ${from} = ${one}, live market rate). Banks and cards usually charge 1–3% more.`,
    hi: `${a} = ${b} (1 ${from} = ${one}, लाइव मार्केट रेट)। बैंक और कार्ड आमतौर पर 1–3% ज़्यादा लेते हैं।`,
    gu: `${a} = ${b} (1 ${from} = ${one}, લાઇવ માર્કેટ રેટ). બેંક અને કાર્ડ સામાન્ય રીતે 1–3% વધુ લે છે.`,
    hn: `${a} = ${b} (1 ${from} = ${one}, live market rate). Bank aur card aam taur pe 1–3% zyada lete hain.`,
  });
  return { kind: "fx", text, speak: `${a} = ${b}`, source: { title: "Rates by ExchangeRate-API", url: "https://www.exchangerate-api.com" } };
}

// ---------------- main ----------------
const KW = {
  emi: /\b(emi|emis|installments?|instalments?|kist|kisht|hapta)\b|ईएमआई|किस्त|ઈએમઆઈ|હપ્તો|હપ્તા/,
  loan: /\b(loan|lone|karz|karza|rin)\b|लोन|कर्ज|ऋण|લોન|કરજ/,
  sip: /\b(sip|sips|mutual funds?|mf)\b|एसआईपी|એસઆઈપી|म्यूचुअल|મ્યુચ્યુઅલ/,
  fd: /\b(fd|fds|fixed deposits?)\b|एफडी|फिक्स्ड|એફડી|ફિક્સ્ડ/,
  rd: /\b(rd|recurring deposits?)\b|आरडी|આરડી/,
  grow: /\b(compound|compounding|return|returns|grow|grows|banega|banenge|ban jayega|ban jaayega|honge|hoga|thase|thashe|maturity|invest|investment|nivesh)\b|बनेगा|बनेंगे|होंगे|रिटर्न|निवेश|થશે|બનશે|રોકાણ|રિટર્ન/,
  gst: /\b(gst|tax)\b|जीएसटी|જીએસટી/,
  inflation: /\b(inflation|mehngai|mehangai|mongvari)\b|महंगाई|मुद्रास्फीति|મોંઘવારી|ફુગાવો/,
  calcWord: /\b(calculate|calculator|calc|nikalo|nikal|ganna|hisab|kitni|kitna|kitne|ketlo|ketla|ketli|how much|what is|batao)\b|कितनी|कितना|निकालो|गणना|કેટલી|કેટલો|ગણતરી/,
  self: /\b(my|mera|meri|mere|maru|mari|mara|maro|mujhe)\b|मेरा|मेरी|मेरे|મારું|મારી|મારા|મારો/,
};

/**
 * Tries to answer a calculator question. Returns null when the message isn't one (so Angel answers normally).
 * `homeCurrency` is the user's currency (INR for guests).
 */
export async function calculate(raw: string, lang: Lang, homeCurrency = "INR"): Promise<CalcAnswer | null> {
  const s = normalize(raw);
  const cur = homeCurrency || "INR";
  const m = (n: number) => money(R(n), cur);
  const pct = PCT.exec(s);
  const rate = pct ? Number(pct[1]) : null;
  const ten = tenureMonths(s);
  const strip = [pct?.[0] ?? "", ten?.match ?? ""];
  const P = principalOf(s, strip);

  // GST / percent first (no tenure)
  if (has(s, KW.gst) && P && !ten) {
    const g = rate ?? 18;
    const inclusive = /\b(inclusive|incl|including|included|sahit|samet|ke saath|ke sath|with gst)\b|सहित|સહિત/.test(s);
    const base = inclusive ? (P * 100) / (100 + g) : P;
    const tax = (base * g) / 100;
    const total = base + tax;
    const text = inclusive
      ? L(lang, { en: `${m(P)} including ${g}% GST = ${m(base)} price + ${m(tax)} GST (CGST ${m(tax / 2)} + SGST ${m(tax / 2)}).`, hi: `${m(P)} (${g}% GST सहित) = ${m(base)} कीमत + ${m(tax)} GST (CGST ${m(tax / 2)} + SGST ${m(tax / 2)})।`, gu: `${m(P)} (${g}% GST સહિત) = ${m(base)} કિંમત + ${m(tax)} GST (CGST ${m(tax / 2)} + SGST ${m(tax / 2)}).`, hn: `${m(P)} (${g}% GST ke saath) = ${m(base)} price + ${m(tax)} GST (CGST ${m(tax / 2)} + SGST ${m(tax / 2)}).` })
      : L(lang, { en: `${m(P)} + ${g}% GST (${m(tax)}) = ${m(total)}. Split: CGST ${m(tax / 2)} + SGST ${m(tax / 2)} (or IGST ${m(tax)} for another state).`, hi: `${m(P)} + ${g}% GST (${m(tax)}) = ${m(total)}। बंटवारा: CGST ${m(tax / 2)} + SGST ${m(tax / 2)} (दूसरे राज्य के लिए IGST ${m(tax)})।`, gu: `${m(P)} + ${g}% GST (${m(tax)}) = ${m(total)}. વહેંચણી: CGST ${m(tax / 2)} + SGST ${m(tax / 2)} (બીજા રાજ્ય માટે IGST ${m(tax)}).`, hn: `${m(P)} + ${g}% GST (${m(tax)}) = ${m(total)}. Split: CGST ${m(tax / 2)} + SGST ${m(tax / 2)} (dusre state ke liye IGST ${m(tax)}).` });
    return { kind: "gst", text, speak: text.split(/[.।]/)[0], cards: [stats([{ label: "Price", value: m(base) }, { label: `GST ${g}%`, value: m(tax) }, { label: "Total", value: m(inclusive ? P : total), tone: "neutral" }])] };
  }

  const pctOf = /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:of|ka|ki|ke|nu|na|નું|का)\s*₹?\s*(\d+(?:\.\d+)?)/.exec(s) ?? /₹?\s*(\d+(?:\.\d+)?)\s*(?:ka|ki|ke|nu|na|का|નું|ના)\s*(\d+(?:\.\d+)?)\s*(?:%|percent|pratishat|takka|ટકા|प्रतिशत)/.exec(s);
  if (pctOf && !ten && !has(s, KW.emi) && !has(s, KW.sip) && !has(s, KW.fd)) {
    const first = PCT.test(pctOf[0].slice(0, pctOf[0].indexOf(pctOf[1]) + pctOf[1].length + 2));
    const p = first ? Number(pctOf[1]) : Number(pctOf[2]);
    const base = first ? Number(pctOf[2]) : Number(pctOf[1]);
    const v = (base * p) / 100;
    const text = L(lang, { en: `${p}% of ${base.toLocaleString("en-IN")} = ${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}.`, hi: `${base.toLocaleString("en-IN")} का ${p}% = ${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}।`, gu: `${base.toLocaleString("en-IN")} ના ${p}% = ${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}.`, hn: `${base.toLocaleString("en-IN")} ka ${p}% = ${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}.` });
    return { kind: "percent", text, speak: text };
  }

  const fxAns = await fx(s, lang, cur);
  if (fxAns) return fxAns;

  if (!P) return null;
  const isEmi = has(s, KW.emi) || (has(s, KW.loan) && rate !== null && ten !== null);
  const isSip = has(s, KW.sip);
  const isFd = has(s, KW.fd);
  const isRd = has(s, KW.rd);
  const isInfl = has(s, KW.inflation);
  const isGrow = has(s, KW.grow) && rate !== null && ten !== null;
  // "meri EMI kab hai" etc. are about the user's own data, not a calculation
  if (!(isEmi || isSip || isFd || isRd || isInfl || isGrow)) return null;
  if (isEmi && has(s, KW.self) && !rate && !ten) return null;

  const need = (what: T4): CalcAnswer => ({ kind: "need", text: what[lang], speak: what[lang] });

  if (isEmi) {
    if (rate === null || !ten)
      return need({ en: `To work out the EMI on ${m(P)} I also need the interest rate and the tenure — e.g. “${P} loan 9% 5 years EMI”.`, hi: `${m(P)} की EMI निकालने के लिए ब्याज दर और समय भी बताइए — जैसे “${P} लोन 9% 5 साल EMI”।`, gu: `${m(P)} ની EMI માટે વ્યાજ દર અને સમય પણ જણાવો — જેમ કે “${P} લોન 9% 5 વર્ષ EMI”.`, hn: `${m(P)} ki EMI nikalne ke liye interest rate aur time bhi bataiye — jaise “${P} loan 9% 5 saal EMI”.` });
    const e = emi(P, rate, ten.months);
    const total = e * ten.months;
    const interest = total - P;
    const text = L(lang, {
      en: `EMI on ${m(P)} at ${rate}% for ${yrs(lang, ten.months)}: ${m(e)} a month. Total interest ${m(interest)}; you repay ${m(total)} in all. Paying even one extra EMI a year cuts the interest noticeably.`,
      hi: `${m(P)} पर ${rate}% ब्याज, ${yrs(lang, ten.months)} के लिए EMI: ${m(e)} हर महीने। कुल ब्याज ${m(interest)}; कुल चुकाना ${m(total)}। साल में एक EMI ज़्यादा भरने से ब्याज काफ़ी घटता है।`,
      gu: `${m(P)} પર ${rate}% વ્યાજ, ${yrs(lang, ten.months)} માટે EMI: દર મહિને ${m(e)}. કુલ વ્યાજ ${m(interest)}; કુલ ચૂકવણી ${m(total)}. વર્ષમાં એક EMI વધારે ભરવાથી વ્યાજ ઘણું ઘટે છે.`,
      hn: `${m(P)} pe ${rate}% interest, ${yrs(lang, ten.months)} ke liye EMI: ${m(e)} har mahine. Total interest ${m(interest)}; total repay ${m(total)}. Saal mein ek EMI extra bharne se interest kaafi ghatta hai.`,
    });
    return { kind: "emi", text, speak: text.split(/(?<=[.।])\s/).slice(0, 2).join(" "), cards: [stats([{ label: "Monthly EMI", value: m(e), tone: "neutral" }, { label: "Total interest", value: m(interest), tone: "neg" }, { label: "Total payable", value: m(total) }])] };
  }

  if (isSip) {
    if (!ten) return need({ en: `For how long? e.g. “${P} SIP for 10 years at 12%”.`, hi: `कितने समय के लिए? जैसे “${P} SIP 10 साल 12%”।`, gu: `કેટલા સમય માટે? જેમ કે “${P} SIP 10 વર્ષ 12%”.`, hn: `Kitne time ke liye? Jaise “${P} SIP 10 saal 12%”.` });
    const r = rate ?? 12;
    const fv = sipFuture(P, r, ten.months);
    const inv = P * ten.months;
    const text = L(lang, {
      en: `${m(P)}/month SIP for ${yrs(lang, ten.months)} at ${r}%${rate === null ? " (assumed)" : ""} a year grows to about ${m(fv)}. You invest ${m(inv)}; estimated gain ${m(fv - inv)}. Market returns aren't guaranteed.`,
      hi: `${m(P)}/महीना SIP, ${yrs(lang, ten.months)}, ${r}%${rate === null ? " (मान लिया)" : ""} सालाना पर लगभग ${m(fv)} बनेगा। आपका निवेश ${m(inv)}; अनुमानित फ़ायदा ${m(fv - inv)}। मार्केट रिटर्न की गारंटी नहीं होती।`,
      gu: `${m(P)}/મહિનો SIP, ${yrs(lang, ten.months)}, ${r}%${rate === null ? " (ધારેલું)" : ""} વાર્ષિક પર આશરે ${m(fv)} થશે. તમારું રોકાણ ${m(inv)}; અંદાજિત ફાયદો ${m(fv - inv)}. માર્કેટ રિટર્નની ગેરંટી નથી.`,
      hn: `${m(P)}/month SIP, ${yrs(lang, ten.months)}, ${r}%${rate === null ? " (assume kiya)" : ""} yearly pe lagbhag ${m(fv)} banega. Aapka investment ${m(inv)}; estimated gain ${m(fv - inv)}. Market returns guaranteed nahi hote.`,
    });
    return { kind: "sip", text, speak: text.split(/(?<=[.।])\s/)[0], cards: [stats([{ label: "Invested", value: m(inv) }, { label: "Est. gain", value: m(fv - inv), tone: "pos" }, { label: "Value", value: m(fv), tone: "neutral" }])] };
  }

  if (isFd || isRd) {
    if (rate === null || !ten)
      return need({ en: `Tell me the interest rate and the time too — e.g. “${P} ${isRd ? "RD" : "FD"} 7% 3 years”.`, hi: `ब्याज दर और समय भी बताइए — जैसे “${P} ${isRd ? "RD" : "FD"} 7% 3 साल”।`, gu: `વ્યાજ દર અને સમય પણ જણાવો — જેમ કે “${P} ${isRd ? "RD" : "FD"} 7% 3 વર્ષ”.`, hn: `Interest rate aur time bhi bataiye — jaise “${P} ${isRd ? "RD" : "FD"} 7% 3 saal”.` });
    const mat = isRd ? rdMaturity(P, rate, ten.months) : fdMaturity(P, rate, ten.months);
    const inv = isRd ? P * ten.months : P;
    const kind = isRd ? "RD" : "FD";
    const text = L(lang, {
      en: `${kind} of ${m(P)}${isRd ? "/month" : ""} at ${rate}% for ${yrs(lang, ten.months)} (quarterly compounding): maturity ≈ ${m(mat)}, interest ≈ ${m(mat - inv)}. Interest is taxable at your slab; TDS applies above the yearly limit.`,
      hi: `${m(P)}${isRd ? "/महीना" : ""} का ${kind}, ${rate}% पर ${yrs(lang, ten.months)} (तिमाही ब्याज): मैच्योरिटी ≈ ${m(mat)}, ब्याज ≈ ${m(mat - inv)}। ब्याज आपके टैक्स स्लैब पर टैक्सेबल है।`,
      gu: `${m(P)}${isRd ? "/મહિનો" : ""} ની ${kind}, ${rate}% પર ${yrs(lang, ten.months)} (ત્રિમાસિક વ્યાજ): મેચ્યોરિટી ≈ ${m(mat)}, વ્યાજ ≈ ${m(mat - inv)}. વ્યાજ તમારા ટેક્સ સ્લેબ પ્રમાણે ટેક્સેબલ છે.`,
      hn: `${m(P)}${isRd ? "/month" : ""} ka ${kind}, ${rate}% pe ${yrs(lang, ten.months)} (quarterly compounding): maturity ≈ ${m(mat)}, interest ≈ ${m(mat - inv)}. Interest aapke tax slab pe taxable hai.`,
    });
    return { kind: isRd ? "rd" : "fd", text, speak: text.split(/(?<=[.।])\s/)[0], cards: [stats([{ label: "Deposited", value: m(inv) }, { label: "Interest", value: m(mat - inv), tone: "pos" }, { label: "Maturity", value: m(mat), tone: "neutral" }])] };
  }

  if (isInfl) {
    if (!ten) return need({ en: `After how many years? e.g. “value of ${P} after 10 years, inflation 6%”.`, hi: `कितने साल बाद? जैसे “${P} की 10 साल बाद वैल्यू, महंगाई 6%”।`, gu: `કેટલા વર્ષ પછી? જેમ કે “${P} ની 10 વર્ષ પછી કિંમત, મોંઘવારી 6%”.`, hn: `Kitne saal baad? Jaise “${P} ki 10 saal baad value, inflation 6%”.` });
    const r = rate ?? 6;
    const future = lumpsum(P, r, ten.months);
    const power = P / Math.pow(1 + r / 100, ten.months / 12);
    const text = L(lang, {
      en: `At ${r}% inflation${rate === null ? " (assumed)" : ""}, what costs ${m(P)} today will cost about ${m(future)} in ${yrs(lang, ten.months)}. And ${m(P)} kept as cash will buy only what ${m(power)} buys today.`,
      hi: `${r}% महंगाई${rate === null ? " (मान ली)" : ""} पर, जो आज ${m(P)} का है वो ${yrs(lang, ten.months)} बाद लगभग ${m(future)} का होगा। और ${m(P)} कैश में रखे तो उतना ही खरीद पाएंगे जितना आज ${m(power)} में।`,
      gu: `${r}% મોંઘવારી${rate === null ? " (ધારેલી)" : ""} પર, જે આજે ${m(P)} નું છે તે ${yrs(lang, ten.months)} પછી આશરે ${m(future)} નું થશે. અને ${m(P)} રોકડમાં રાખો તો આજના ${m(power)} જેટલું જ ખરીદી શકશો.`,
      hn: `${r}% inflation${rate === null ? " (assume ki)" : ""} pe, jo aaj ${m(P)} ka hai wo ${yrs(lang, ten.months)} baad lagbhag ${m(future)} ka hoga. Aur ${m(P)} cash mein rakha to utna hi khareed paoge jitna aaj ${m(power)} mein.`,
    });
    return { kind: "inflation", text, speak: text.split(/(?<=[.।])\s/)[0] };
  }

  // lump sum growth
  const fv = lumpsum(P, rate!, ten!.months);
  const text = L(lang, {
    en: `${m(P)} invested at ${rate}% a year for ${yrs(lang, ten!.months)} grows to about ${m(fv)} (gain ${m(fv - P)}, compounded yearly).`,
    hi: `${m(P)} को ${rate}% सालाना पर ${yrs(lang, ten!.months)} लगाने पर लगभग ${m(fv)} बनेगा (फ़ायदा ${m(fv - P)}, सालाना चक्रवृद्धि)।`,
    gu: `${m(P)} ને ${rate}% વાર્ષિક પર ${yrs(lang, ten!.months)} રોકો તો આશરે ${m(fv)} થશે (ફાયદો ${m(fv - P)}, વાર્ષિક ચક્રવૃદ્ધિ).`,
    hn: `${m(P)} ko ${rate}% yearly pe ${yrs(lang, ten!.months)} lagane pe lagbhag ${m(fv)} banega (gain ${m(fv - P)}, yearly compounding).`,
  });
  return { kind: "lumpsum", text, speak: text, cards: [stats([{ label: "Invested", value: m(P) }, { label: "Gain", value: m(fv - P), tone: "pos" }, { label: "Value", value: m(fv), tone: "neutral" }])] };
}

/** Quick check without doing the maths (used to decide whether to try calculate()). */
export function looksLikeCalc(raw: string): boolean {
  const s = normalize(raw);
  if (!/\d/.test(s)) return false;
  return KW.emi.test(s) || KW.sip.test(s) || KW.fd.test(s) || KW.rd.test(s) || KW.gst.test(s) || KW.inflation.test(s) || PCT.test(s) || currenciesIn(s).some((c) => c !== "INR") || (KW.grow.test(s) && PCT.test(s));
}
