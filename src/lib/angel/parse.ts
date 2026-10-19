// Angel AI — understanding a message: language, intent and entities (amounts, dates, categories, people).
// Pure TypeScript, no network, no third-party AI. Fully unit-testable.
import { EXPENSE_CATEGORY_WORDS, INCOME_CATEGORY_WORDS, LEX, PLAN_WORDS, STOPWORDS, type LexKey } from "./lexicon";
import { levenshtein, mapLoanwords, normalize, phonetic, scriptOf, tokenize } from "./text";
import { extractAmounts, type AmountHit } from "./numbers";
import { parseDates, type DateInfo, type Period } from "./dates";
import { train, predict, type Prediction } from "./brain/classifier";
import { CORPUS, KB_ANCHORS, KB_CORPUS } from "./brain/corpus";
import { transliterate } from "./text";

export type Lang = "en" | "hi" | "gu" | "hn"; // hn = Hinglish (Hindi written in English letters)

export type Intent =
  | "greet" | "thanks" | "identity" | "help" | "stop" | "yes" | "no"
  | "balance" | "expense" | "income" | "savings" | "compare" | "top_categories" | "largest" | "recent" | "debts" | "goals"
  | "health" | "insights" | "forecast" | "average" | "advice" | "afford"
  | "add_expense" | "add_income" | "goal_contribute" | "pay_emi" | "create_goal" | "create_debt" | "delete_last" | "undo"
  | "platform_summary" | "list_users" | "user_info" | "create_user" | "change_plan"
  | "overview" | "profile" | "top_users" | "users_query" | "ack"
  // reasoning, budgets, knowledge
  | "explain_change" | "budget_status" | "set_budget" | "rule_503020" | "emergency_fund" | "subscriptions" | "kb"
  // more actions
  | "goal_withdraw" | "delete_entry" | "edit_last"
  // admin
  | "visitors" | "delete_user" | "disable_user" | "enable_user" | "reset_password" | "delete_account"
  | "unknown";

export const QUERY_INTENTS: Intent[] = ["balance", "expense", "income", "savings", "compare", "top_categories", "largest", "recent", "debts", "goals", "health", "insights", "forecast", "average", "advice", "afford", "platform_summary", "user_info", "overview", "profile", "top_users", "users_query", "explain_change", "budget_status", "rule_503020", "emergency_fund", "subscriptions", "visitors"];

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
const GU_MARKERS = new Set(["che", "chhe", "maru", "mara", "mari", "maro", "ketlu", "ketla", "ketli", "shu", "nu", "ma", "karvu", "mane", "tame", "kem", "aavyu", "avyu", "hatu", "thayu", "sudhi", "chhella", "aaje", "kevi", "rite", "kharchya", "kharchyu", "pagar", "kyare", "badha", "badhu", "karo", "aapo", "batavo", "joie", "joiye", "chhu", "chu", "hu", "tamaru", "taru", "malyo", "mali", "bachavva", "bachavu", "gaya", "varshe", "mahina", "athvadiye", "kai", "karvanu", "che?", "saku", "shaku", "sakish", "lau", "laish", "nathi", "tamne", "amne", "kevu", "haji", "pachhi", "kyan", "kale", "aapjo", "karjo", "batavjo", "lidhu", "lidhi", "kidhu", "umero", "nakho", "rakho", "thase", "thashe", "bachse", "joie", "ketlo", "kem", "shema", "mate"].map(phonetic));
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
  /** the rule engine's decision (before the learned model was consulted) */
  ruleIntent: Intent;
  /** what the learned model thinks (ranked) */
  ml: Prediction;
  /** knowledge topic when intent === "kb" */
  kbTopic: string | null;
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
  const original = normalize(raw.slice(0, 1000));
  const lang = detectLang(original); // language from what was really said / typed
  const norm = mapLoanwords(original); // then "एक्सपेंस" → "expense" etc. so voice is understood like typing
  const email = EMAIL_RE.exec(norm)?.[0] ?? null;
  const percent = PERCENT_RE.exec(norm);
  const tokens = tokenize(norm);
  const ptoks = tokens.map(phonetic);

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
  const ruleIntent = classify({ has, hits, amount, isQuestion, tokens, exp: exp?.cat ?? null, inc: inc?.cat ?? null, email, planId, contentWords, norm });

  // ---- the learned model: understands phrasings the rules have never seen ----
  const marks = slotMarks(tokens, ptoks, amounts, dates.used);
  const ml = predict(getModel(), featuresOf(tokens, ptoks, marks));
  // "me / main / mai" are also Hindi for "in" — only clear first-person words count as "about me".
  const selfStrong = (hits.self ?? []).some((i) => !/^(me|main|mai|hu)$/.test(tokens[i])) || tokens.some((t, i) => i !== (hits.self ?? [])[0] && /^(my|mine|mera|mere|meri|mujhe|maine|maru|mari|mara|maro|mane|मेरा|मेरे|मेरी|मुझे|मैंने|મારું|મારા|મારી|મારો|મને|મેં)$/.test(t));
  const { intent, kbTopic } = decide(ruleIntent, ml, { amount, has, tokens, contentWords, exp: exp?.cat ?? null, inc: inc?.cat ?? null, selfStrong });

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
    ruleIntent,
    ml,
    kbTopic,
  };
}

// ======================= learned model (brain/) =======================
const CAT_TABLES = () => [...EXP_CATS, ...INC_CATS];

/** Marks tokens that are "slots": amounts, dates, categories, emails → generic features. */
function slotMarks(tokens: string[], ptoks: string[], amounts: AmountHit[], dateUsed: Set<number>): Map<number, string> {
  const marks = new Map<number, string>();
  for (const a of amounts) for (let i = a.start; i <= a.end; i++) marks.set(i, "#num");
  for (const i of dateUsed) if (!marks.has(i)) marks.set(i, "#date");
  for (const [, c] of CAT_TABLES()) {
    const at = matchAt(ptoks, c, false);
    if (at) for (const i of at) if (!marks.has(i)) marks.set(i, "#cat");
  }
  tokens.forEach((t, i) => {
    if (t.includes("@")) marks.set(i, "#email");
    else if (/^\d+(\.\d+)?%?$/.test(t) && !marks.has(i)) marks.set(i, "#num");
  });
  return marks;
}

const NATIVE = /[\u0900-\u097f\u0a80-\u0aff]/;

function featuresOf(tokens: string[], ptoks: string[], marks: Map<number, string>): Map<string, number> {
  const f = new Map<string, number>();
  const add = (k: string, w = 1) => f.set(k, (f.get(k) ?? 0) + w);
  const units: string[] = [];
  tokens.forEach((t, i) => {
    if (t === "zzname") return; // a person's name in the training data
    const m = marks.get(i);
    if (m) {
      units.push(m);
      if (m === "#cat") {
        // generic slot (so "set food budget" ≈ "set petrol budget") + the word's own meaning ("sip" ≠ "petrol")
        add(m, 0.5);
        add(`w:${ptoks[i]}`);
      } else add(m);
      return;
    }
    const p = ptoks[i];
    add(`w:${p}`);
    units.push(p);
    if (NATIVE.test(t)) {
      // Hindi / Gujarati script → also the romanised form, so it matches Hinglish / Gujlish examples.
      const tr = phonetic(transliterate(t).replace(/[^a-z]/g, ""));
      if (tr.length >= 2) {
        add(`t:${tr}`);
        add(`w:${tr}`, 0.6);
      }
    } else if (p.length >= 5) {
      for (let k = 0; k + 4 <= p.length; k++) add(`c:${p.slice(k, k + 4)}`);
    }
  });
  for (let i = 0; i + 1 < units.length; i++) add(`b:${units[i]}_${units[i + 1]}`);
  return f;
}

let MODEL: ReturnType<typeof train> | null = null;
const TRAIN_DAY = "2026-01-15";

function getModel() {
  if (MODEL) return MODEL;
  const examples: { intent: string; features: Map<string, number> }[] = [];
  const all = { ...CORPUS, ...KB_CORPUS };
  for (const [intent, sentences] of Object.entries(all)) {
    for (const s of sentences) {
      const tokens = tokenize(mapLoanwords(normalize(s.replace(/\{n\}/g, " zzname "))));
      const ptoks = tokens.map(phonetic);
      const dates = parseDates(tokens, TRAIN_DAY);
      const skip = new Set(dates.used);
      const amounts = extractAmounts(tokens, skip);
      examples.push({ intent, features: featuresOf(tokens, ptoks, slotMarks(tokens, ptoks, amounts, dates.used)) });
    }
  }
  MODEL = train(examples);
  return MODEL;
}

/** Rule intents that are only "best guesses" — the learned model may overrule them when it is confident. */
const WEAK_RULES = new Set<Intent>(["unknown", "overview", "expense", "income", "balance", "profile", "top_categories", "advice", "platform_summary", "savings", "delete_last", "help", "health", "insights"]);
/** Intents the model may NOT invent on its own (they need specific evidence such as an amount). */
const NEEDS_AMOUNT = new Set<string>(["add_expense", "add_income", "goal_contribute", "goal_withdraw", "create_debt", "set_budget", "edit_last", "afford"]);

/** second-person words ("you", "tum", "aap", "તમે" …) */
const YOU_RE = /^(you|your|tum|tumhe|tumko|tumhara|tumhari|aap|aapko|aapka|aapki|tu|tera|teri|tame|tamne|tamaru|taru|tane|तुम|तुम्हें|तुम्हारा|आप|आपको|आपका|तू|तेरा|તમે|તમને|તમારું|તું|તારું)$/;

function decide(
  rule: Intent,
  mlIn: Prediction,
  x: { amount: number | null; has: (k: LexKey) => boolean; tokens: string[]; contentWords: string[]; exp: string | null; inc: string | null; selfStrong: boolean },
): { intent: Intent; kbTopic: string | null } {
  // Knowledge topics only count when the question mentions their subject ("petrol kya hai" ≠ SIP).
  const toks = x.tokens.map((t) => phonetic(t));
  const anchored = (intent: string) => {
    if (!intent.startsWith("kb:")) return true;
    const anchors = (KB_ANCHORS[intent.slice(3)] ?? []).map(phonetic);
    return anchors.some((a) => toks.includes(a) || toks.some((t) => a.length >= 4 && t.startsWith(a)));
  };
  const ranked = mlIn.ranked.filter((r) => anchored(r.intent));
  const ml = { intent: ranked[0]?.intent ?? "unknown", score: ranked[0]?.score ?? 0, margin: (ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0) };
  const mlIntent = ml.intent;
  const isKb = mlIntent.startsWith("kb:");
  const allowedByEvidence = !NEEDS_AMOUNT.has(mlIntent) || !!x.amount;
  // 1. Rules found nothing → trust the model if it is reasonably sure (but never on numbers alone, e.g. "1").
  if (rule === "unknown") {
    if (!x.tokens.some((t) => /\p{L}/u.test(t))) return { intent: "unknown", kbTopic: null };
    // "taj mahal kisne banaya" looks like "who made you" — but it's about something else (→ web search)
    if (mlIntent === "identity" && x.contentWords.some((w) => !YOU_RE.test(w))) return { intent: "unknown", kbTopic: null };
    if (isKb && ml.score >= 0.3) return { intent: "kb", kbTopic: mlIntent.slice(3) };
    if (!isKb && allowedByEvidence && ml.score >= 0.3 && mlIntent !== "unknown") return { intent: mlIntent as Intent, kbTopic: null };
    return { intent: "unknown", kbTopic: null };
  }
  // 2. General-knowledge questions ("SIP kya hai", "what is compound interest") — no personal data words.
  if (isKb && ml.score >= 0.35 && ml.margin >= 0.08 && x.has("knowWord") && !x.selfStrong && !x.amount) return { intent: "kb", kbTopic: mlIntent.slice(3) };
  if (isKb && ml.score >= 0.6 && ml.margin >= 0.15 && !x.selfStrong && !x.amount) return { intent: "kb", kbTopic: mlIntent.slice(3) };
  // 3. A weak rule guess vs a confident, clearly different model answer → the model wins.
  //    But when the user literally named the topic ("savings", "kharcha", "income", "balance"), the model may only
  //    REFINE the question type (why / compare / budget / forecast…), never swap it for another basic topic.
  const BASIC = new Set<string>(["expense", "income", "balance", "savings"]);
  const namedTopic = BASIC.has(rule) && (x.has(rule as LexKey) || (rule === "expense" && !!x.exp) || (rule === "income" && !!x.inc));
  if (namedTopic && BASIC.has(mlIntent)) return { intent: rule, kbTopic: null };
  if (WEAK_RULES.has(rule) && !isKb && mlIntent !== rule && allowedByEvidence && ml.score >= 0.55 && ml.margin >= 0.12) {
    return { intent: mlIntent as Intent, kbTopic: null };
  }
  return { intent: rule, kbTopic: null };
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
  norm: string;
}

function classify(x: ClassifyInput): Intent {
  const { has, amount, isQuestion, tokens } = x;
  if (!tokens.length) return "unknown";
  const short = tokens.length <= 4;
  const joined = ` ${tokens.join(" ")} `;

  // conversation control
  const topic = (["balance", "expense", "income", "savings", "debt", "goal", "deleteVerb", "addVerb", "users", "plan", "recent", "health", "insight", "identity", "overview", "profile", "adminWord", "budgetWord", "visitorWord"] as LexKey[]).some(has);
  const adminVerb = has("blockWord") || has("unblockWord") || has("passwordWord");
  if (has("stop") && short && !amount && !topic && !adminVerb) return "stop";
  if (has("undo") && !amount && tokens.length <= 7 && !adminVerb && !has("deleteVerb")) return "undo";
  if (has("yes") && short && !amount && !has("question") && !topic && !adminVerb) return "yes";
  if (has("no") && short && !amount && !has("question") && !topic && !adminVerb) return "no";

  // ---------- admin: user management ----------
  const userWord = tokens.some((t) => /^(user|users|member|yujar|यूज़र|यूजर|સભ્ય|યુઝર|યૂઝર|सदस्य)$/.test(t)) || (has("users") && !!x.email);
  const accountWord = tokens.some((t) => /^(account|accounts|acount|अकाउंट|એકાઉન્ટ|khata|खाता|ખાતું)$/.test(t));
  const personish = !!x.email || x.contentWords.length > 0;
  if (has("passwordWord") && (has("resetWord") || has("changeVerb")) && !amount) return "reset_password";
  if (has("unblockWord") && personish && !amount && !isQuestion) return "enable_user";
  if (has("blockWord") && personish && !amount && !isQuestion) return "disable_user";
  // "delete my account" → guidance (never done by chat); "delete ravi's account" → admin action
  if (has("deleteVerb") && accountWord && (has("self") || !personish) && !x.email) return "delete_account";
  if (has("deleteVerb") && (userWord || accountWord || !!x.email) && personish && !has("income") && !x.exp && !amount) return "delete_user";

  // ---------- actions ----------
  const wantsAdd = has("addVerb");
  const admin = userWord && (has("createVerb") || wantsAdd) && !isQuestion && !amount;
  if (admin && (x.email || x.contentWords.length)) return "create_user";
  if (x.planId && (has("changeVerb") || has("plan")) && x.contentWords.length && !(isQuestion && !has("changeVerb"))) return "change_plan";

  // budgets: "food ka budget 5000 rakh do" / "am i over budget"
  if (has("budgetWord") && amount && !has("afford") && !(has("advice") && !has("setCue"))) return "set_budget";
  if (has("budgetWord") && !amount && (has("budgetCue") || /\b(over|cross)\b/.test(joined))) return "budget_status";

  // edit / delete specific entries
  const entryish = has("expense") || has("income") || has("recent") || !!x.exp || !!x.inc || tokens.some((t) => /^(entry|entries|एंट्री|એન્ટ્રી|wali|wala|vali|vala|wale|vadi|valu)$/.test(t));
  if (has("lastWord") && entryish && amount && (has("editVerb") || has("changeVerb"))) return "edit_last";
  if (has("deleteVerb") && !isQuestion) {
    if (has("lastWord") || (!x.exp && !x.inc && !amount && !x.contentWords.length)) return "delete_last";
    return "delete_entry";
  }

  if (has("debt")) {
    if ((has("payWords") || has("spentPast")) && !isQuestion && !has("takeLoan")) return "pay_emi";
    if ((has("createVerb") || has("takeLoan") || wantsAdd) && amount && !isQuestion) return "create_debt";
  }
  if (has("goal")) {
    if (has("withdrawWord") && amount && !isQuestion) return "goal_withdraw";
    if (has("createVerb") && !isQuestion) return "create_goal";
    if ((wantsAdd || has("savings") || has("spentPast")) && amount && !isQuestion && !has("advice")) return "goal_contribute";
  }
  // "papa ne 2000 diye" (someone gave ME money) vs "maine 2000 diye" (I paid)
  const gaveMe = /(^| )(?!maine |mene |maine |मैंने |મેં )\S+ (ne|ने|એ|e) (.* )?(diye|diya|dia|दिए|दिया|दिये|આપ્યા|apya|aapya|bheje|bheja|भेजे|મોકલ્યા)( |$)/.test(joined);
  if (amount && !isQuestion && !has("advice") && !has("afford")) {
    const incomeish = has("income") || !!x.inc;
    if (incomeish && (wantsAdd || has("received"))) return "add_income";
    if (has("received") && !x.exp && !has("expense")) return "add_income";
    if (gaveMe && (!x.exp || x.exp === "Family") && !has("self")) return "add_income";
    if (wantsAdd || has("spentPast") || has("payWords") || (has("expense") && !has("savings"))) return "add_expense";
    // quick log: "petrol 500", "500 ka doodh", "dhobi 200"
    if (x.exp && tokens.length <= 5) return "add_expense";
    if (tokens.length <= 3 && x.contentWords.length >= 1 && !isQuestion && !has("users")) return "add_expense";
  }

  // ---------- small talk ----------
  // "kisne banaya" alone = who made YOU; "taj mahal kisne banaya" is about something else (→ web)
  const youWord = tokens.some((t) => YOU_RE.test(t));
  if (has("identity") && (youWord || x.contentWords.length === 0 || /\b(who are you|what are you|your name)\b/.test(joined))) return "identity";
  if (has("help") && !amount && !has("savings") && !has("advice")) return "help";
  if (has("greet") && short && !has("self") && !amount && !has("why")) return "greet";
  if (has("ack") && short && !amount && !topic) return "ack";

  // ---------- reasoning ----------
  const moneyTopicEarly = has("expense") || has("income") || has("savings") || has("balance") || has("debt") || has("goal") || !!x.exp || !!x.inc;
  if (has("why") && (moneyTopicEarly || has("changeWord")) && !amount) return "explain_change";
  if (/ 50 30 20 /.test(joined) || has("needsWants")) return has("knowWord") && !has("self") ? "kb" : "rule_503020";
  if (has("emergencyWord") && !amount) return "emergency_fund";
  if (has("recurringWord") && !amount && !wantsAdd) return "subscriptions";

  // ---------- people / users (admin) ----------
  const anyUserWord = userWord || has("users");
  if (has("visitorWord") && !moneyTopicEarly) return "visitors";
  if ((has("most") || has("largest")) && (has("whoWord") || tokens.some((t) => /^(users|यूज़र्स|यूजर्स|યુઝર્સ)$/.test(t)))) return "top_users";
  if (!moneyTopicEarly && ((anyUserWord && (!!x.planId || has("userFilter") || has("adminWord"))) || (has("adminWord") && (has("question") || has("whoWord"))))) return "users_query";
  if (has("profile") && !wantsAdd && !amount && !has("advice") && !has("balance") && !has("debt") && !has("goal")) return "profile";
  if (has("plan") && (has("question") || has("self")) && !has("savings") && !has("expense") && !amount && !has("changeVerb")) return "profile";

  // ---------- admin queries ----------
  const moneyTopic = has("expense") || has("income") || has("savings") || has("most") || !!x.exp || !!x.inc;
  // "mere kitne users hain", "how many users do I have", "મારા કેટલા યુઝર્સ છે", "users count" → the admin's users
  if ((has("platform") && !moneyTopic) || (has("users") && !moneyTopic && !has("balance")) || /(kitne|ketla|how many|कितने|કેટલા) (log|lok|people|लोग|લોકો)/.test(tokens.join(" "))) {
    if (has("users") && (has("recent") || tokens.some((t) => /^(list|names?|naam|નામ|नाम|kaun|कौन|કોણ|which)$/.test(t)))) return "list_users";
    return "platform_summary";
  }

  // ---------- money questions ----------
  if (has("afford") && amount) return "afford";
  if (has("suggestionWord") && !amount && !has("savings")) return "insights";
  if (has("advice") && (has("savings") || has("expense") || amount || has("goal") || (has("debt") && !!amount) || has("income") || has("overview"))) return "advice";
  if (has("savings") && amount && !wantsAdd) return "advice";
  if (has("overview") && !has("debt") && !has("goal")) return "overview";
  if (has("forecast")) return "forecast";
  if (has("compare")) return "compare";
  if (has("category")) return "top_categories";
  if (has("largest")) return "largest";
  if (has("most")) return "top_categories";
  if (has("average")) return "average";
  if (has("recent")) return "recent";
  if (has("debt")) return "debts";
  if (has("goal")) return "goals";
  if (has("health")) return "health";
  if (has("insight")) return "insights";
  // "kitna paisa udd gaya" (spent) / "kitna bacha paya" (saved) also contain balance words — the verb decides,
  // unless the user literally said "balance".
  const literalBalance = /(^| )(balance|belens|balans|बैलेंस|બેલેન્સ)( |$)/.test(joined);
  if (has("balance") && !literalBalance && has("savings")) return "savings";
  if (has("balance") && !literalBalance && has("expense")) return "expense";
  // "kitne paise aaye" (money came in) is income, not balance
  if (has("balance") && !literalBalance && has("income") && !has("self")) return "income";
  if (has("balance")) return "balance";
  if (has("savings")) return "savings";
  if (has("expense") || x.exp) return "expense";
  if (has("income") || x.inc) return "income";
  // "aaj kitna gaya", "kitna laga" → spending
  if (has("question") && / (gaya|gaye|gayi|gya|laga|lage|lagta|jata|jaata|gayo|gaya\?) /.test(joined) && !has("self")) return "expense";
  if (has("advice")) return "advice";
  if (has("plan") && x.contentWords.length) return "user_info";
  if (has("greet")) return "greet";
  if (has("thanks")) return "thanks";
  if (has("help")) return "help";
  return "unknown";
}
