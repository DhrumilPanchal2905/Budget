// Angel AI — text utilities (pure, no dependencies; safe for server + client).
// Normalises English, Hindi (Devanagari), Gujarati script and romanised Hindi/Gujarati so that
// one lexicon can match all of them.

export type Script = "latin" | "deva" | "gujr";

const DEVA_DIGITS = "०१२३४५६७८९";
const GUJR_DIGITS = "૦૧૨૩૪૫૬૭૮૯";

/** Lowercase, unify digits, drop nukta / chandrabindu variants, normalise punctuation. */
export function normalize(input: string): string {
  let s = input.normalize("NFC").toLowerCase();
  s = s.replace(/[०-९]/g, (d) => String(DEVA_DIGITS.indexOf(d)));
  s = s.replace(/[૦-૯]/g, (d) => String(GUJR_DIGITS.indexOf(d)));
  s = s
    .replace(/़/g, "") // Devanagari nukta (ज़ → ज)
    .replace(/઼/g, "") // Gujarati nukta
    .replace(/ँ/g, "ं") // chandrabindu → anusvara
    .replace(/ઁ/g, "ં")
    .replace(/[​-‍﻿]/g, ""); // zero-width joiners
  // spoken email forms: "ravi at the rate gmail dot com"
  s = s.replace(/\s+at\s+the\s+rate\s+(of\s+)?/g, "@").replace(/\s+(at the rate|एट द रेट)\s+/g, "@");
  s = s.replace(/(@[a-z0-9-]+)\s+dot\s+([a-z]{2,})/g, "$1.$2");
  // currency + separators
  s = s.replace(/₹\s*/g, " ₹").replace(/\brs\.?\s*(?=\d)/g, " ₹").replace(/(\d)\s*\/-/g, "$1");
  // keep letters (all scripts), digits, @ . % ₹ and spaces
  s = s.replace(/[“”"'`’‘]/g, "").replace(/[!?,;:()[\]{}|\\/<>~^*_=+#&]/g, " ");
  s = s.replace(/(\d),(?=\d)/g, "$1"); // 1,20,000 → 120000
  s = s.replace(/(^|\s)\.+|\.+(\s|$)/g, " "); // stray dots (not decimals / emails)
  s = s.replace(/[।॥]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

// English words as Hindi/Gujarati speech recognition WRITES them ("एक्सपेंस", "મંથ") → the English word.
// Voice in hi-IN / gu-IN types English loanwords in native script, so this makes voice as accurate as typing.
const LOAN: Record<string, string> = {};
const loan = (en: string, ...native: string[]) => native.forEach((n) => (LOAN[n] = en));
loan("expense", "एक्सपेंस", "एक्सपेन्स", "एक्सपेंसेस", "एक्सपेंसिस", "एक्सपेंसेज", "એક્સપેન્સ", "એક્સપેન્સીસ", "એક્સપેન્સિસ");
loan("total", "टोटल", "ટોટલ");
loan("month", "मंथ", "मन्थ", "मंथ्स", "મંથ", "મન્થ");
loan("week", "वीक", "વીક");
loan("year", "ईयर", "इयर", "यर", "યર", "ઈયર", "ઇયર");
loan("this", "दिस", "ધીસ", "ધિસ");
loan("last", "लास्ट", "લાસ્ટ");
loan("previous", "प्रीवियस", "પ્રિવિયસ");
loan("today", "टुडे", "ટુડે");
loan("yesterday", "यस्टरडे", "યસ્ટરડે");
loan("credited", "क्रेडिट", "क्रेडिटेड", "ક્રેડિટ");
loan("debited", "डेबिट", "ડેબિટ");
loan("summary", "समरी", "સમરી");
loan("overview", "ओवरव्यू", "ઓવરવ્યૂ");
loan("compare", "कंपेयर", "कम्पेयर", "कंपेर", "कम्पेर", "કમ્પેર", "કંપેર", "કમ્પેયર");
loan("average", "एवरेज", "ऐवरेज", "એવરેજ");
loan("daily", "डेली", "ડેલી");
loan("top", "टॉप", "टोप", "ટોપ", "ટૉપ");
loan("spender", "स्पेंडर", "સ્પેન્ડર");
loan("afford", "अफोर्ड", "अफ़ोर्ड", "અફોર્ડ");
loan("salary", "सेलरी", "सैलेरी", "સેલેરી");
loan("food", "फूड", "ફૂડ");
loan("grocery", "ग्रोसरी", "ग्रॉसरी", "ग्रोसरीज", "ગ્રોસરી");
loan("fuel", "फ्यूल", "ફ્યુલ");
loan("travel", "ट्रैवल", "ટ્રાવેલ");
loan("rent", "रेंट", "રેન્ટ");
loan("list", "लिस्ट", "લિસ્ટ");
loan("remove", "रिमूव", "રિમૂવ");
loan("undo", "अन्डू", "अंडू");
loan("save", "सेव", "સેવ");
loan("spent", "स्पेंट", "સ્પેન્ટ");
loan("check", "चेक", "ચેક");
loan("show", "शो", "શો");
loan("users", "यूजर्स", "यूज़र्स", "युजर्स", "યુઝર્સ", "યૂઝર્સ");
loan("user", "युजर", "યૂઝર");
loan("emi", "ईएमआई", "इएमआई", "ઈએમઆઈ", "ઇએમઆઇ");
loan("income", "इनकम", "ઇન્કમ", "ઈન્કમ");
loan("balance", "बैलेंस", "बेलेंस", "બેલેન્સ");
loan("budget", "बजट", "બજેટ");
loan("details", "डिटेल्स", "डिटेल", "ડિટેલ્સ", "ડિટેલ");
loan("insights", "इनसाइट्स", "ઇનસાઇટ્સ");
const GU_TAIL = /(નો|ની|નું|ના|માં|મા|થી|ને)$/;

/** Replaces native-script English loanwords with the English word ("इस मंथ का टोटल एक्सपेंस" → "इस month का total expense"). */
export function mapLoanwords(norm: string): string {
  return norm
    .split(" ")
    .map((t) => LOAN[t] ?? (GU_TAIL.test(t) && LOAN[t.replace(GU_TAIL, "")] ? LOAN[t.replace(GU_TAIL, "")] : t))
    .join(" ");
}

export function scriptOf(s: string): Script {
  let deva = 0;
  let gujr = 0;
  let latin = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0900 && c <= 0x097f) deva++;
    else if (c >= 0x0a80 && c <= 0x0aff) gujr++;
    else if ((c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a)) latin++;
  }
  if (gujr > 0 && gujr >= deva) return "gujr";
  if (deva > 0) return "deva";
  void latin;
  return "latin";
}

/**
 * Phonetic key for ROMAN words so spelling variants collapse:
 * kharcha/kharchaa/kharcha → "karca", bachat/bachhat → "bacat", zyada/jyada → "jyada".
 */
export function phonetic(word: string): string {
  if (!/^[a-z0-9.@%₹]+$/.test(word)) return word; // non-latin: unchanged
  let w = word;
  w = w.replace(/aa+/g, "a").replace(/ee+|ii+/g, "i").replace(/oo+|uu+/g, "u");
  w = w.replace(/w/g, "v").replace(/z/g, "j").replace(/ph/g, "f").replace(/q/g, "k");
  w = w.replace(/([kgcjtdpbs])h/g, "$1");
  w = w.replace(/([a-z])\1+/g, "$1");
  return w;
}

export function tokenize(norm: string): string[] {
  return norm.split(" ").filter(Boolean);
}

export function levenshtein(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
    cur = [];
  }
  return prev[b.length];
}

// ---------- Transliteration (Devanagari / Gujarati → Latin), used to match spoken names ----------
const DEVA_MAP: Record<string, string> = {
  अ: "a", आ: "aa", इ: "i", ई: "ee", उ: "u", ऊ: "oo", ऋ: "ri", ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऑ: "o",
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n", च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n",
  ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n", त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "ph", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", व: "v", श: "sh", ष: "sh", स: "s", ह: "h",
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o",
  "ं": "n", "ः": "h", "्": "",
};
const GUJR_MAP: Record<string, string> = {
  અ: "a", આ: "aa", ઇ: "i", ઈ: "ee", ઉ: "u", ઊ: "oo", ઋ: "ri", એ: "e", ઐ: "ai", ઓ: "o", ઔ: "au", ઍ: "e", ઑ: "o",
  ક: "k", ખ: "kh", ગ: "g", ઘ: "gh", ઙ: "n", ચ: "ch", છ: "chh", જ: "j", ઝ: "jh", ઞ: "n",
  ટ: "t", ઠ: "th", ડ: "d", ઢ: "dh", ણ: "n", ત: "t", થ: "th", દ: "d", ધ: "dh", ન: "n",
  પ: "p", ફ: "ph", બ: "b", ભ: "bh", મ: "m", ય: "y", ર: "r", લ: "l", ળ: "l", વ: "v", શ: "sh", ષ: "sh", સ: "s", હ: "h",
  "ા": "aa", "િ": "i", "ી": "ee", "ુ": "u", "ૂ": "oo", "ૃ": "ri", "ે": "e", "ૈ": "ai", "ો": "o", "ૌ": "au", "ૅ": "e", "ૉ": "o",
  "ં": "n", "ઃ": "h", "્": "",
};
const MATRAS = new Set(["ा", "ि", "ी", "ु", "ू", "ृ", "े", "ै", "ो", "ौ", "ॉ", "ं", "ः", "्", "ા", "િ", "ી", "ુ", "ૂ", "ૃ", "ે", "ૈ", "ો", "ૌ", "ૅ", "ૉ", "ં", "ઃ", "્"]);
const isConsonant = (ch: string) => /[क-हક-હ]/.test(ch);

export function transliterate(word: string): string {
  const chars = [...word];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const m = DEVA_MAP[ch] ?? GUJR_MAP[ch];
    if (m === undefined) {
      out += ch;
      continue;
    }
    out += m;
    // inherent "a" after a consonant unless followed by a matra/virama; dropped at word end (schwa deletion)
    if (isConsonant(ch)) {
      const next = chars[i + 1];
      if (next && !MATRAS.has(next)) out += "a";
    }
  }
  return out;
}

/** Comparable key for any-script names: "Dhrumil" / "ધ્રુમિલ" / "ध्रुमिल" → "drumil". */
export function nameKey(word: string): string {
  const latin = /[ऀ-ॿ઀-૿]/.test(word) ? transliterate(word) : word.toLowerCase();
  return phonetic(latin.replace(/[^a-z]/g, "")).replace(/a$/, "");
}
