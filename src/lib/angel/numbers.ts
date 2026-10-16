// Angel AI — amount extraction for English / Hindi / Gujarati (digits, words, lakh/crore, "5k", "dedh lakh").
import { phonetic } from "./text";

const UNITS: Record<string, number> = {};
const add = (n: number, words: string[]) => words.forEach((w) => (UNITS[phonetic(w)] = n));

add(0, ["zero", "shunya", "शून्य", "શૂન્ય"]);
add(1, ["one", "ek", "एक", "એક"]);
add(2, ["two", "do", "be", "दो", "બે"]);
add(3, ["three", "teen", "tin", "tran", "तीन", "ત્રણ"]);
add(4, ["four", "char", "chaar", "चार", "ચાર"]);
add(5, ["five", "paanch", "panch", "पांच", "पाँच", "પાંચ"]);
add(6, ["six", "chhe", "chhah", "chha", "छह", "छः", "છ"]);
add(7, ["seven", "saat", "sat", "सात", "સાત"]);
add(8, ["eight", "aath", "ath", "आठ", "આઠ"]);
add(9, ["nine", "nau", "nav", "नौ", "નવ"]);
add(10, ["ten", "das", "दस", "દસ"]);
add(11, ["eleven", "gyarah", "agiyar", "ग्यारह", "અગિયાર"]);
add(12, ["twelve", "barah", "bar", "बारह", "બાર"]);
add(13, ["thirteen", "terah", "ter", "तेरह", "તેર"]);
add(14, ["fourteen", "chaudah", "chaud", "चौदह", "ચૌદ"]);
add(15, ["fifteen", "pandrah", "pandar", "पंद्रह", "પંદર"]);
add(16, ["sixteen", "solah", "sol", "सोलह", "સોળ"]);
add(17, ["seventeen", "satrah", "sattar", "सत्रह", "સત્તર"]);
add(18, ["eighteen", "atharah", "adhar", "अठारह", "અઢાર"]);
add(19, ["nineteen", "unnis", "ognis", "उन्नीस", "ઓગણીસ"]);
add(20, ["twenty", "bees", "bis", "vis", "बीस", "વીસ"]);
add(25, ["twenty five", "pachchis", "pachees", "pachis", "पच्चीस", "પચ્ચીસ"]);
add(30, ["thirty", "tees", "tis", "tris", "तीस", "ત્રીસ"]);
add(40, ["forty", "chalis", "chaalis", "चालीस", "ચાળીસ", "ચાલીસ"]);
add(50, ["fifty", "pachas", "pachaas", "पचास", "પચાસ"]);
add(60, ["sixty", "saath", "साठ", "સાઠ"]);
add(70, ["seventy", "sattar", "sittar", "सत्तर", "સિત્તેર"]);
add(75, ["pachattar", "पचहत्तर", "પંચોતેર"]);
add(80, ["eighty", "assi", "ensi", "अस्सी", "એંસી"]);
add(90, ["ninety", "nabbe", "nevu", "नब्बे", "નેવું"]);

const MULT: Record<string, number> = {};
const addM = (n: number, words: string[]) => words.forEach((w) => (MULT[phonetic(w)] = n));
addM(100, ["hundred", "sau", "so", "सौ", "સો"]);
addM(1000, ["thousand", "hazar", "hazaar", "hajar", "hajaar", "k", "हजार", "हज़ार", "હજાર"]);
addM(100000, ["lakh", "lac", "lakhs", "lacs", "laakh", "लाख", "લાખ"]);
addM(10000000, ["crore", "crores", "cr", "karod", "karor", "करोड़", "करोड", "કરોડ"]);

// fractional prefixes: dedh (1.5), dhai (2.5), saade X (X+0.5), sava X (X+0.25), paune X (X-0.25)
const FRACTION: Record<string, number> = {};
[["dedh", "derh", "dodh", "doodh", "डेढ़", "डेढ", "દોઢ"]].flat().forEach((w) => (FRACTION[phonetic(w)] = 1.5));
[["dhai", "adhai", "adhi", "dhaai", "ढाई", "અઢી"]].flat().forEach((w) => (FRACTION[phonetic(w)] = 2.5));
const SAADE = new Set(["sade", "sadhe", "साढ़े", "साढे", "સાડા"].map(phonetic));
const SAVA = new Set(["sava", "sawa", "सवा", "સવા"].map(phonetic));
const PAUNE = new Set(["paune", "pone", "पौने", "પોણા"].map(phonetic));

const SUFFIX = /^(\d+(?:\.\d+)?)(k|l|lac|lakh|cr|crore|rs|₹|hazar|hajar)?$/;

export interface AmountHit {
  value: number; // rupees (may have 2 decimals)
  start: number; // token index
  end: number; // token index (inclusive)
  currency: boolean; // explicit ₹ / rs / rupaye nearby
}

const CURRENCY_WORDS = new Set(["₹", "rs", "inr", "rupees", "rupee", "rupaye", "rupay", "rupiya", "rupiye", "rupaiya", "रुपये", "रुपए", "रुपया", "रूपये", "રૂપિયા", "રૂપિયો", "રૂ"].map(phonetic));

function tokenNumber(tok: string): { n: number; mult?: number } | null {
  const t = tok.replace(/^₹/, "");
  const m = SUFFIX.exec(t);
  if (m) {
    const base = Number(m[1]);
    const suf = m[2];
    const mult = suf === "k" || suf === "hazar" || suf === "hajar" ? 1000 : suf === "l" || suf === "lac" || suf === "lakh" ? 100000 : suf === "cr" || suf === "crore" ? 10000000 : 1;
    return { n: base * mult };
  }
  const p = phonetic(tok);
  if (p in UNITS) return { n: UNITS[p] };
  return null;
}

/**
 * Finds every amount in the token list. Tokens listed in `skip` (dates, "3 months", years) are ignored.
 * "do hazaar paanch sau" → 2500, "1.5 lakh" → 150000, "saade teen hazar" → 3500, "5k" → 5000.
 */
export function extractAmounts(tokens: string[], skip: Set<number> = new Set()): AmountHit[] {
  const hits: AmountHit[] = [];
  const isDigitTok = (t: string | undefined) => !!t && /^₹?\d/.test(t);
  let i = 0;
  while (i < tokens.length) {
    if (skip.has(i)) {
      i++;
      continue;
    }
    let start = i;
    let total = 0;
    let current = 0;
    let used = false;
    let hadMultiplier = false;
    let hadDigits = false;
    let pendingAdd = 0; // saade / sava / paune
    let prevKind: "none" | "digit" | "word" | "mult" = "none";
    while (i < tokens.length && !skip.has(i)) {
      const tok = tokens[i];
      const p = phonetic(tok);
      if (p in FRACTION) {
        current += FRACTION[p];
        used = true;
        hadMultiplier = hadMultiplier || false;
        prevKind = "word";
        i++;
        continue;
      }
      if (SAADE.has(p) || SAVA.has(p) || PAUNE.has(p)) {
        pendingAdd = SAADE.has(p) ? 0.5 : SAVA.has(p) ? 0.25 : -0.25;
        if (!used) start = i;
        i++;
        continue;
      }
      const num = tokenNumber(tok);
      if (num) {
        const digit = isDigitTok(tok);
        if (digit && prevKind === "digit") break; // "500 300" → two amounts
        if (digit && prevKind === "word" && !hadMultiplier) {
          // "kar do 500" → the word number ("do") is not part of the amount
          total = 0;
          current = 0;
          start = i;
        }
        current += num.n + pendingAdd;
        if (digit && /[a-z]$/.test(tok) && !/\d(rs|₹)$/.test(tok)) hadMultiplier = true; // 5k, 2lakh
        pendingAdd = 0;
        used = true;
        hadDigits = hadDigits || digit;
        prevKind = digit ? "digit" : "word";
        i++;
        continue;
      }
      if (p in MULT && used) {
        const m = MULT[p];
        if (m === 100 && p === "so" && prevKind === "digit") break; // English "so"
        if (m === 100) current = (current || 1) * 100;
        else {
          total += (current || 1) * m;
          current = 0;
        }
        hadMultiplier = true;
        prevKind = "mult";
        i++;
        continue;
      }
      break;
    }
    if (used) {
      const value = Math.round((total + current) * 100) / 100;
      const prev = tokens[start - 1];
      const next = tokens[i];
      const currency =
        tokens[start].startsWith("₹") || (prev !== undefined && CURRENCY_WORDS.has(phonetic(prev))) || (next !== undefined && CURRENCY_WORDS.has(phonetic(next)));
      // a lone small word-number ("ek", "do", "be") is not an amount
      const meaningful = hadDigits || hadMultiplier || currency || value >= 100;
      if (value > 0 && meaningful) hits.push({ value, start, end: i - 1, currency });
    } else {
      i++;
    }
  }
  return hits;
}

/** Spoken-number check used by the date parser ("3 tarikh"). */
export function smallNumber(tok: string): number | null {
  const n = tokenNumber(tok);
  return n && Number.isInteger(n.n) && n.n >= 0 && n.n <= 100 ? n.n : null;
}
