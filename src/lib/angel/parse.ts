// Angel AI — understanding a message: language, intent and entities (amounts, dates, categories, people).
// Pure TypeScript, no network, no third-party AI. Fully unit-testable.
import { EXPENSE_CATEGORY_WORDS, INCOME_CATEGORY_WORDS, LEX, PLAN_WORDS, STOPWORDS, type LexKey } from "./lexicon";
import { levenshtein, normalize, phonetic, scriptOf, tokenize } from "./text";
import { extractAmounts, type AmountHit } from "./numbers";
import { parseDates, type DateInfo, type Period } from "./dates";

export type Lang = "en" | "hi" | "gu" | "hn"; // hn = Hinglish (Hindi written in English letters)

export type Intent =
  | "greet" | "thanks" | "identity" | "help" | "stop" | "yes" | "no"
  | "balance" | "expense" | "income" | "savings" | "compare" | "top_categories" | "largest" | "recent" | "debts" | "goals"
  | "health" | "insights" | "forecast" | "average" | "advice" | "afford"
  | "add_expense" | "add_income" | "goal_contribute" | "pay_emi" | "create_goal" | "create_debt" | "delete_last" | "undo"
  | "platform_summary" | "list_users" | "user_info" | "create_user" | "change_plan"
  | "overview" | "profile" | "top_users" | "users_query" | "ack"
  | "unknown";

export const QUERY_INTENTS: Intent[] = ["balance", "expense", "income", "savings", "compare", "top_categories", "largest", "recent", "debts", "goals", "health", "insights", "forecast", "average", "advice", "afford", "platform_summary", "user_info", "overview", "profile", "top_users", "users_query"];

// ---------------- matcher ----------------
interface Compiled {
  exact: Set<string>;
  prefix: string[];
  phrases: string[][];
  fuzzy: string[];
}

const isLatin = (s: string) => /^[a-z0-9.@%₹]+$/.test(s);
const longEnough = (s: string) => (isLatin(s) ? s.length >= 4 : [...s].length >= 3);

function compile(entries: readonly string[]): Compiled {
  const c: Compiled = { exact: new Set(), prefix: [], phrases: [], fuzzy: [] };
  for (const raw of entries) {
    const strict = raw.startsWith("=");
    const words = tokenize(normalize(raw.replace(/^=/, ""))).map(phonetic);
    if (!words.length) continue;
    if (words.length > 1) c.phrases.push(words);
    else {
      c.exact.add(words[0]);
      if (!strict && longEnough(words[0])) c.prefix.push(words[0]);
      if (!strict && isLatin(words[0]) && words[0].length >= 7) c.fuzzy.push(words[0]); // typo tolerance: "expence", "balence"
    }
  }
  return c;
}

const COMPILED = Object.fromEntries(Object.entries(LEX).map(([k, v]) => [k, compile(v)])) as Record<LexKey, Compiled>;
const EXP_CATS = EXPENSE_CATEGORY_WORDS.map(([cat, words]) => [cat, compile(words)] as const);
const INC_CATS = INCOME_CATEGORY_WORDS.map(([cat, words]) => [cat, compile(words)] as const);
const PLAN_C = Object.entries(PLAN_WORDS).map(([id, words]) => [id, compile(words)] as const);

/** Returns token indexes covered by the first match, or null. */
function matchAt(ptoks: string[], c: Compiled, fuzzy = true): number[] | null {
  for (const ph of c.phrases) {
    outer: for (let i = 0; i + ph.length <= ptoks.length; i++) {
      for (let j = 0; j < ph.length; j++) {
        const t = ptoks[i + j];
        const isLast = j === ph.length - 1;
        if (t !== ph[j] && !(isLast && longEnough(ph[j]) && t.startsWith(ph[j]))) continue outer;
      }
      return Array.from({ length: ph.length }, (_, k) => i + k);
    }
  }
  for (let i = 0; i < ptoks.length; i++) {
    const t = ptoks[i];
    if (c.exact.has(t)) return [i];
    for (const pre of c.prefix) if (t.startsWith(pre)) return [i];
  }
  if (fuzzy) {
    for (let i = 0; i < ptoks.length; i++) {
      const t = ptoks[i];
      if (!isLatin(t) || t.length < 7) continue;
      for (const e of c.fuzzy) if (levenshtein(t, e, 1) <= 1 || (t.length > e.length && levenshtein(t.slice(0, e.length), e, 1) <= 1 && t.length - e.length <= 2)) return [i];
    }
  }
  return null;
}

// ---------------- language ----------------
const HN_MARKERS = new Set(["hai", "hain", "mera", "mere", "meri", "kitna", "kitne", "kitni", "kya", "ka", "ke", "ki", "mein", "kaise", "karo", "kar", "batao", "mujhe", "aur", "tha", "thi", "pichle", "abhi", "kal", "aaj", "se", "ko", "kab", "nahi", "bhi", "hua", "gaya", "diye", "kharcha", "kharch", "bachat", "paise", "mahine", "chahiye", "karna", "karu", "kaun", "kyu", "dalo", "daalo", "ho", "liye", "wala", "tum", "aap", "maine", "hum", "ye", "yeh", "kaha", "kahan", "sabse", "zyada", "jyada", "saal", "rupaye", "mila", "mili", "aayi", "bata", "dikhao", "kitnaa", "hu", "hoon", "pe", "par", "uska", "uske", "abhi"].map(phonetic));
const GU_MARKERS = new Set(["che", "chhe", "maru", "mara", "mari", "maro", "ketlu", "ketla", "ketli", "shu", "nu", "ma", "karvu", "mane", "tame", "kem", "aavyu", "avyu", "hatu", "thayu", "sudhi", "chhella", "aaje", "kevi", "rite", "kharchya", "kharchyu", "pagar", "kyare", "badha", "badhu", "karo", "aapo", "batavo", "joie", "joiye", "chhu", "chu", "hu", "tamaru", "taru", "malyo", "mali", "bachavva", "bachavu", "gaya", "varshe", "mahina", "athvadiye", "kai", "karvanu", "che?"].map(phonetic));
const EN_MARKERS = new Set(["the", "what", "how", "my", "is", "much", "did", "spend", "spent", "show", "tell", "me", "this", "last", "month", "can", "should", "do", "i", "you", "your", "are", "was", "money", "have", "add", "please", "for", "on", "of", "and", "many", "where", "which", "when", "who", "save", "want", "need", "to", "in", "a"].map(phonetic));

export function detectLang(norm: string): Lang {
  const s = scriptOf(norm);
  if (s === "gujr") return "gu";
  if (s === "deva") return "hi";
  const toks = tokenize(norm).map(phonetic);
  let hn = 0;
  let gu = 0;
  let en = 0;
  for (const t of toks) {
    if (HN_MARKERS.has(t)) hn++;
    if (GU_MARKERS.has(t)) gu++;
    if (EN_MARKERS.has(t)) en++;
  }
  if (hn === 0 && gu === 0) return "en";
  if (gu > hn) return "gu";
  if (en > hn * 2 && en >= 3) return "en";
  return "hn";
}

// ---------------- parse ----------------
export interface Parsed {
  raw: string;
  norm: string;
  tokens: string[];
  lang: Lang;
  intent: Intent;
  hits: Partial<Record<LexKey, number[]>>;
  amounts: AmountHit[];
  amount: number | null;
  interest: number | null;
  dates: DateInfo;
  period: Period | null;
  expenseCategory: string | null;
  incomeCategory: string | null;
  categoryWord: string | null;
  planId: "free" | "plus" | "pro" | "unlimited" | null;
  email: string | null;
  /** words that are not part of the vocabulary — possible names (people, goals, loans) */
  contentWords: string[];
  isQuestion: boolean;
}

function titleCase(s: string) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** The token that triggered a category, prettified for an expense title ("petrol" → "Petrol"). */
function categoryOf(ptoks: string[], tokens: string[], table: (readonly [string, Compiled])[]): { cat: string; word: string } | null {
  for (const [cat, c] of table) {
    const at = matchAt(ptoks, c, false);
    if (at) return { cat, word: at.map((i) => tokens[i]).join(" ") };
  }
  return null;
}

const LEXICAL_CACHE = new Map<string, boolean>();
function isLexical(ptok: string): boolean {
  const cached = LEXICAL_CACHE.get(ptok);
  if (cached !== undefined) return cached;
  let r = false;
  const groups: Compiled[] = [...Object.values(COMPILED), ...EXP_CATS.map((x) => x[1]), ...INC_CATS.map((x) => x[1]), ...PLAN_C.map((x) => x[1])];
  for (const c of groups) {
    if (c.exact.has(ptok) || c.prefix.some((p) => ptok.startsWith(p)) || c.phrases.some((ph) => ph.includes(ptok))) {
      r = true;
      break;
    }
  }
  LEXICAL_CACHE.set(ptok, r);
  return r;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/;
const PERCENT_RE = /(\d+(?:\.\d+)?)\s*(%|percent|pratishat|takka|ટકા|प्रतिशत)/;

export function parse(raw: string, todayStr: string): Parsed {
  const norm = normalize(raw.slice(0, 1000));
  const email = EMAIL_RE.exec(norm)?.[0] ?? null;
  const percent = PERCENT_RE.exec(norm);
  const tokens = tokenize(norm);
  const ptoks = tokens.map(phonetic);
  const lang = detectLang(norm);

  const hits: Partial<Record<LexKey, number[]>> = {};
  for (const key of Object.keys(COMPILED) as LexKey[]) {
    const at = matchAt(ptoks, COMPILED[key]);
    if (at) hits[key] = at;
  }
  const has = (k: LexKey) => hits[k] !== undefined;

  const dates = parseDates(tokens, todayStr);
  const skip = new Set(dates.used);
  tokens.forEach((t, i) => {
    if (t.includes("@") || (percent && (t === percent[1] || t === `${percent[1]}%`))) skip.add(i);
  });
  const amounts = extractAmounts(tokens, skip);
  const amount = amounts.length ? amounts.reduce((a, b) => (b.currency && !a.currency ? b : a)).value : null;

  const exp = categoryOf(ptoks, tokens, EXP_CATS);
  const inc = categoryOf(ptoks, tokens, INC_CATS);
  let planId: Parsed["planId"] = null;
  for (const [id, c] of PLAN_C) if (matchAt(ptoks, c, false)) planId = id as Parsed["planId"];

  const contentWords: string[] = [];
  tokens.forEach((t, i) => {
    const p = ptoks[i];
    if (skip.has(i) || STOPWORDS.has(t) || STOPWORDS.has(p) || /\d/.test(t) || t.includes("@") || t.length < 2) return;
    if (isLexical(p)) return;
    if (amounts.some((a) => i >= a.start && i <= a.end)) return;
    contentWords.push(t);
  });

  const isQuestion = raw.includes("?") || has("question") || has("compare");
  const intent = classify({ has, hits, amount, isQuestion, tokens, exp: exp?.cat ?? null, inc: inc?.cat ?? null, email, planId, contentWords });

  return {
    raw,
    norm,
    tokens,
    lang,
    intent,
    hits,
    amounts,
    amount,
    interest: percent ? Number(percent[1]) : null,
    dates,
    period: dates.period,
    expenseCategory: exp?.cat ?? null,
    incomeCategory: inc?.cat ?? null,
    categoryWord: exp ? titleCase(exp.word) : inc ? titleCase(inc.word) : null,
    planId,
    email,
    contentWords,
    isQuestion,
  };
}

interface ClassifyInput {
  has: (k: LexKey) => boolean;
  hits: Partial<Record<LexKey, number[]>>;
  amount: number | null;
  isQuestion: boolean;
  tokens: string[];
  exp: string | null;
  inc: string | null;
  email: string | null;
  planId: string | null;
  contentWords: string[];
}

function classify(x: ClassifyInput): Intent {
  const { has, amount, isQuestion, tokens } = x;
  if (!tokens.length) return "unknown";
  const short = tokens.length <= 4;

  // conversation control
  const topic = (["balance", "expense", "income", "savings", "debt", "goal", "deleteVerb", "addVerb", "users", "plan", "recent", "health", "insight", "identity", "overview", "profile", "adminWord"] as LexKey[]).some(has);
  if (has("stop") && short && !amount && !topic) return "stop";
  if (has("undo") && !amount && tokens.length <= 7) return "undo";
  if (has("yes") && short && !amount && !has("question") && !topic) return "yes";
  if (has("no") && short && !amount && !has("question") && !topic) return "no";

  // ---------- actions ----------
  const wantsAdd = has("addVerb");
  const userWord = tokens.some((t) => /^(user|users|member|yujar|यूज़र|यूजर|સભ્ય|યુઝર|યૂઝર|सदस्य)$/.test(t)) || (has("users") && !!x.email);
  const admin = userWord && (has("createVerb") || wantsAdd) && !isQuestion && !amount;
  if (admin && (x.email || x.contentWords.length)) return "create_user";
  if (x.planId && (has("changeVerb") || has("plan")) && x.contentWords.length && !(isQuestion && !has("changeVerb"))) return "change_plan";

  if (has("deleteVerb") && !isQuestion) return "delete_last";

  if (has("debt")) {
    if ((has("payWords") || has("spentPast")) && !isQuestion && !has("takeLoan")) return "pay_emi";
    if ((has("createVerb") || has("takeLoan") || wantsAdd) && amount && !isQuestion) return "create_debt";
  }
  if (has("goal")) {
    if (has("createVerb") && !isQuestion) return "create_goal";
    if ((wantsAdd || has("savings") || has("spentPast")) && amount && !isQuestion && !has("advice")) return "goal_contribute";
  }
  if (amount && !isQuestion && !has("advice") && !has("afford")) {
    const incomeish = has("income") || !!x.inc;
    if (incomeish && (wantsAdd || has("received"))) return "add_income";
    if (has("received") && !x.exp && !has("expense")) return "add_income";
    if (wantsAdd || has("spentPast") || (has("expense") && !has("savings"))) return "add_expense";
    // quick log: "petrol 500", "500 ka doodh"
    if (x.exp && tokens.length <= 5) return "add_expense";
  }

  // ---------- small talk ----------
  if (has("identity")) return "identity";
  if (has("help") && !amount && !has("savings") && !has("advice")) return "help";
  if (has("greet") && short && !has("self") && !amount) return "greet";
  if (has("ack") && short && !amount && !topic) return "ack";

  // ---------- people / users (admin) ----------
  const moneyTopicEarly = has("expense") || has("income") || has("savings") || has("balance") || has("debt") || has("goal") || !!x.exp || !!x.inc;
  const anyUserWord = userWord || has("users");
  if ((has("most") || has("largest")) && (has("whoWord") || tokens.some((t) => /^(users|यूज़र्स|यूजर्स|યુઝર્સ)$/.test(t)))) return "top_users";
  if (!moneyTopicEarly && ((anyUserWord && (!!x.planId || has("userFilter") || has("adminWord"))) || (has("adminWord") && (has("question") || has("whoWord"))))) return "users_query";
  if (has("profile") && !wantsAdd && !amount && !has("advice")) return "profile";
  if (has("plan") && (has("question") || has("self")) && !has("savings") && !has("expense") && !amount && !has("changeVerb")) return "profile";

  // ---------- admin queries ----------
  const moneyTopic = has("expense") || has("income") || has("savings") || has("most") || !!x.exp || !!x.inc;
  if ((has("platform") && !moneyTopic) || (has("users") && isQuestion && !has("self") && !moneyTopic)) {
    if (has("users") && (has("recent") || tokens.some((t) => /^(list|names?|naam|નામ|नाम|kaun|कौन|કોણ|which)$/.test(t)))) return "list_users";
    return "platform_summary";
  }

  // ---------- money questions ----------
  if (has("afford") && amount) return "afford";
  if (has("advice") && (has("savings") || has("expense") || amount || has("goal") || has("debt") || has("income") || has("overview"))) return "advice";
  if (has("savings") && amount && !wantsAdd) return "advice";
  if (has("overview") && !has("debt") && !has("goal")) return "overview";
  if (has("forecast")) return "forecast";
  if (has("compare")) return "compare";
  if (has("largest")) return "largest";
  if (has("most") || has("category")) return "top_categories";
  if (has("average")) return "average";
  if (has("recent")) return "recent";
  if (has("debt")) return "debts";
  if (has("goal")) return "goals";
  if (has("health")) return "health";
  if (has("insight")) return "insights";
  if (has("balance")) return "balance";
  if (has("savings")) return "savings";
  if (has("expense") || x.exp) return "expense";
  if (has("income") || x.inc) return "income";
  if (has("advice")) return "advice";
  if (has("plan") && x.contentWords.length) return "user_info";
  if (has("greet")) return "greet";
  if (has("thanks")) return "thanks";
  if (has("help")) return "help";
  return "unknown";
}
