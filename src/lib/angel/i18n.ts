// Angel AI — language helpers for replies (English, हिंदी, ગુજરાતી, Hinglish).
import type { Lang } from "./parse";
import type { Period } from "./dates";
import { currencyLocale } from "../currencies";

export type T4 = Record<Lang, string>;
export const L = (lang: Lang, t: T4) => t[lang];

/** "₹1,23,456" (Indian grouping) — or the user's currency. */
export function money(major: number, currency = "INR"): string {
  const locale = currencyLocale(currency);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: Number.isInteger(major) ? 0 : 2, minimumFractionDigits: 0 }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

export const pctStr = (n: number) => `${Math.round(n * 10) / 10}%`;

const MONTH_NAMES: Record<Lang, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  hn: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  hi: ["जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
  gu: ["જાન્યુઆરી", "ફેબ્રુઆરી", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઓગસ્ટ", "સપ્ટેમ્બર", "ઓક્ટોબર", "નવેમ્બર", "ડિસેમ્બર"],
};

export function monthName(lang: Lang, m: number, y?: number) {
  return `${MONTH_NAMES[lang][m]}${y ? ` ${y}` : ""}`;
}

export function dateLabel(lang: Lang, ymdStr: string): string {
  const d = new Date(`${ymdStr}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTH_NAMES[lang][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "this month" / "इस महीने" / "આ મહિને" / "is mahine" */
export function periodLabel(lang: Lang, p: Period | null): string {
  if (!p) return L(lang, { en: "this month", hi: "इस महीने", gu: "આ મહિને", hn: "is mahine" });
  const n = p.n ?? 0;
  const y = p.start.getUTCFullYear();
  switch (p.kind) {
    case "today":
      return L(lang, { en: "today", hi: "आज", gu: "આજે", hn: "aaj" });
    case "yesterday":
      return L(lang, { en: "yesterday", hi: "कल", gu: "ગઈકાલે", hn: "kal" });
    case "week":
      return L(lang, { en: "this week", hi: "इस हफ्ते", gu: "આ અઠવાડિયે", hn: "is hafte" });
    case "lastWeek":
      return L(lang, { en: "last week", hi: "पिछले हफ्ते", gu: "ગયા અઠવાડિયે", hn: "pichle hafte" });
    case "month":
      return L(lang, { en: "this month", hi: "इस महीने", gu: "આ મહિને", hn: "is mahine" });
    case "lastMonth":
      return L(lang, { en: "last month", hi: "पिछले महीने", gu: "ગયા મહિને", hn: "pichle mahine" });
    case "year":
      return L(lang, { en: "this year", hi: "इस साल", gu: "આ વર્ષે", hn: "is saal" });
    case "lastYear":
      return L(lang, { en: `in ${y}`, hi: `${y} में`, gu: `${y}માં`, hn: `${y} mein` });
    case "lastNMonths":
      return L(lang, { en: `in the last ${n} months`, hi: `पिछले ${n} महीनों में`, gu: `છેલ્લા ${n} મહિનામાં`, hn: `pichle ${n} mahino mein` });
    case "lastNDays":
      return L(lang, { en: `in the last ${n} days`, hi: `पिछले ${n} दिनों में`, gu: `છેલ્લા ${n} દિવસમાં`, hn: `pichle ${n} dino mein` });
    case "namedMonth":
      return L(lang, {
        en: `in ${monthName("en", p.start.getUTCMonth(), y)}`,
        hi: `${monthName("hi", p.start.getUTCMonth(), y)} में`,
        gu: `${monthName("gu", p.start.getUTCMonth(), y)}માં`,
        hn: `${monthName("hn", p.start.getUTCMonth(), y)} mein`,
      });
    case "all":
      return L(lang, { en: "so far", hi: "अब तक", gu: "અત્યાર સુધી", hn: "ab tak" });
  }
}

const CAT: Record<string, { hi: string; gu: string; hn: string }> = {
  "Food & Dining": { hi: "खाना-पीना", gu: "ખાણી-પીણી", hn: "Food & Dining" },
  Groceries: { hi: "किराना", gu: "કરિયાણું", hn: "Groceries" },
  Rent: { hi: "किराया", gu: "ભાડું", hn: "Rent" },
  Utilities: { hi: "बिल (बिजली/पानी/गैस)", gu: "બિલ (લાઇટ/પાણી/ગેસ)", hn: "Bills (Utilities)" },
  Transport: { hi: "आना-जाना", gu: "વાહનવ્યવહાર", hn: "Transport" },
  Fuel: { hi: "पेट्रोल/ईंधन", gu: "પેટ્રોલ/ઇંધણ", hn: "Fuel" },
  Shopping: { hi: "शॉपिंग", gu: "શોપિંગ", hn: "Shopping" },
  Health: { hi: "स्वास्थ्य", gu: "આરોગ્ય", hn: "Health" },
  Education: { hi: "पढ़ाई", gu: "શિક્ષણ", hn: "Education" },
  Entertainment: { hi: "मनोरंजन", gu: "મનોરંજન", hn: "Entertainment" },
  Travel: { hi: "यात्रा", gu: "પ્રવાસ", hn: "Travel" },
  Insurance: { hi: "बीमा", gu: "વીમો", hn: "Insurance" },
  Subscriptions: { hi: "सब्सक्रिप्शन", gu: "સબ્સ્ક્રિપ્શન", hn: "Subscriptions" },
  "EMI / Debt": { hi: "EMI / कर्ज", gu: "EMI / લોન", hn: "EMI / Debt" },
  Investments: { hi: "निवेश", gu: "રોકાણ", hn: "Investments" },
  Family: { hi: "परिवार", gu: "પરિવાર", hn: "Family" },
  Other: { hi: "अन्य", gu: "અન્ય", hn: "Other" },
  Salary: { hi: "सैलरी", gu: "પગાર", hn: "Salary" },
  Freelance: { hi: "फ्रीलांस", gu: "ફ્રીલાન્સ", hn: "Freelance" },
  Business: { hi: "बिज़नेस", gu: "બિઝનેસ", hn: "Business" },
  Investment: { hi: "निवेश से आय", gu: "રોકાણની આવક", hn: "Investment" },
  Rental: { hi: "किराये की आय", gu: "ભાડાની આવક", hn: "Rental" },
  Bonus: { hi: "बोनस", gu: "બોનસ", hn: "Bonus" },
  Gift: { hi: "उपहार", gu: "ભેટ", hn: "Gift" },
  Refund: { hi: "रिफंड", gu: "રિફંડ", hn: "Refund" },
};

export function catLabel(lang: Lang, cat: string): string {
  if (lang === "en") return cat;
  return CAT[cat]?.[lang] ?? cat;
}

/** Subject forms so sentences stay grammatical for "you" and for another user (admin view). */
export interface Who {
  self: boolean;
  name: string;
  /** "You" / "Ravi" */
  en: string;
  /** "Your" / "Ravi's" */
  enPoss: string;
  /** "आपने" / "Ravi ने" */
  hiNe: string;
  /** "आपका" / "Ravi का" */
  hiKa: string;
  /** "આપે/તમે" / "Ravi એ" */
  guE: string;
  /** "તમારું" / "Ravi નું" */
  guNu: string;
  /** "Aapne" / "Ravi ne" */
  hnNe: string;
  /** "Aapka" / "Ravi ka" */
  hnKa: string;
}

export function who(self: boolean, name: string): Who {
  if (self) return { self, name, en: "You", enPoss: "Your", hiNe: "आपने", hiKa: "आपका", guE: "તમે", guNu: "તમારું", hnNe: "Aapne", hnKa: "Aapka" };
  return { self, name, en: name, enPoss: `${name}'s`, hiNe: `${name} ने`, hiKa: `${name} का`, guE: `${name}એ`, guNu: `${name}નું`, hnNe: `${name} ne`, hnKa: `${name} ka` };
}

export function greetingByHour(lang: Lang, hour: number, firstName: string): string {
  const part = hour < 12 ? 0 : hour < 17 ? 1 : 2;
  const en = ["Good morning", "Good afternoon", "Good evening"][part];
  const hi = ["सुप्रभात", "नमस्ते", "शुभ संध्या"][part];
  const gu = ["સુપ્રભાત", "નમસ્તે", "શુભ સાંજ"][part];
  const hn = ["Good morning", "Namaste", "Good evening"][part];
  const n = firstName.trim() ? `, ${firstName.trim()}` : "";
  return L(lang, { en: `${en}${n}!`, hi: `${hi}${n}!`, gu: `${gu}${n}!`, hn: `${hn}${n}!` });
}

export function signedMoney(major: number, currency: string) {
  return `${major < 0 ? "−" : ""}${money(Math.abs(major), currency)}`;
}

/** Strips list markers / emoji for text-to-speech. */
export function forSpeech(text: string): string {
  return text
    .replace(/[•▪︎→←✓✔️🎯🎉💡⚠️📉📈💰🙏😊👋]/gu, " ")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
}
