// Angel AI — the brain. Understands a message (parse.ts), decides WHOSE data it is about (self / a user / the
// whole platform), reads the database (tools.ts), thinks (advisor.ts) and answers in the user's language.
// Actions (add expense, add income, goal contribution, EMI payment, new goal/loan, delete, create user, change plan)
// reuse the SAME server functions as the app — so plan limits, validation, audit log, realtime refresh and
// notifications all apply exactly as if the user clicked the buttons.
import { AngelMessage, Budget, Debt, Expense, Goal, GoalContribution, Income, Session, User, isObjectId, oid, type UserDoc } from "../models";
import type { Permission } from "../permissions";
import { DEFAULT_USER_PERMISSIONS, isAdminPermission } from "../permissions";
import { contributeGoal, createRecord, deleteRecord, getUsage, goalInsight, goalPaces, payDebt, requiredPerms, updateRecord } from "../finance";
import { budgetReport, checkBudgetAlerts, TOTAL } from "../budgets";
import { deleteUserCompletely, assertNotLastAdmin, assertCanManage } from "../users";
import { needsWantsOf } from "../finance-rules";
import { KB } from "./brain/knowledge";
import { getDashboard, todayUTC } from "../analytics";
import { generateInsights } from "../insights";
import { audit } from "../audit";
import { notifyUser } from "../notify";
import { publish, userChannel } from "../realtime";
import { randomBytes } from "crypto";
import { hashPassword } from "../auth";
import { getPlan, planForUser } from "../plans";
import { toMinor, fromMinor } from "../money";
import { APP_TIMEZONE } from "../env";
import { ApiError } from "../errors";
import { parse, QUERY_INTENTS, type Intent, type Lang, type Parsed } from "./parse";
import { addMonths, parseYmd, thisMonth, ymd, type Period } from "./dates";
import { L, catLabel, dateLabel, forSpeech, greetingByHour, money, monthName, pctStr, periodLabel, signedMoney, who as whoOf, type T4, type Who } from "./i18n";
import { checkAfford, planSavings, type AdvisorInput } from "./advisor";
import { nameKey, levenshtein, phonetic } from "./text";
import * as T from "./tools";
import type { ActionKind, ActionStatus, ActionView, AngelLangPref, Card } from "./types";

// ======================= types =======================
export interface StoredAction {
  kind: ActionKind;
  status: ActionStatus;
  summary: string;
  ownerId: string;
  needsConfirm?: boolean;
  canUndo?: boolean;
  payload: Record<string, unknown>;
  undo?: Record<string, unknown>;
}

type SerialPeriod = { kind: Period["kind"]; start: string; end: string; n?: number; monthKey?: string };

interface Pending {
  kind: "confirm" | "slot";
  action: { kind: ActionKind; ownerId: string; payload: Record<string, unknown> };
  slot?: "amount" | "goal" | "debt" | "email" | "user" | "emi" | "entry" | "category";
  options?: { id: string; label: string }[];
  messageId?: string;
  /** when the question was asked (ms) — unanswered confirmations expire after 10 minutes */
  at?: number;
}

export const PENDING_TTL_MS = 10 * 60 * 1000;

/**
 * Atomically moves an Angel message's action from one status to another. Only ONE caller can win, so a
 * double-click, two tabs, or the Yes button + saying "haan" can never run (or undo) the same action twice.
 */
export async function claimAction(messageId: string, userId: unknown, from: string, to: string) {
  if (!isObjectId(messageId)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return AngelMessage.findOneAndUpdate({ _id: oid(messageId), userId, role: "angel", "action.status": from }, { $set: { "action.status": to } }, { new: true }) as any;
}

export interface AngelContext {
  lang?: Lang;
  lastIntent?: Intent;
  lastPeriod?: SerialPeriod | null;
  lastCategory?: string | null;
  lastUserId?: string | null;
  lastUserName?: string | null;
  pending?: Pending | null;
}

export interface EngineReply {
  text: string;
  speak: string;
  lang: Lang;
  cards?: Card[];
  action?: StoredAction | null;
  suggestions?: string[];
  /** shown once in the response, NEVER stored (e.g. a temporary password) */
  ephemeral?: Card[];
}

export interface EngineInput {
  actor: UserDoc;
  perms: Permission[];
  ip: string;
  text: string;
  ctx: AngelContext;
  langPref: AngelLangPref;
  source: "voice" | "text";
  /** other guesses from speech recognition — used when the main guess isn't understood */
  alts?: string[];
}

export interface EngineResult {
  reply: EngineReply;
  ctx: AngelContext;
  /** the user asked to undo the last action (the route finds it in the chat history) */
  undo?: boolean;
  /** when a speech alternative was understood better than the main guess, the text that was used */
  usedText?: string;
  /** an earlier Angel message whose action changed (confirmed / cancelled by voice) */
  updateMessage?: { id: string; action: StoredAction };
}

export function actionView(a: StoredAction | null | undefined): ActionView | null {
  if (!a) return null;
  return { kind: a.kind, status: a.status, summary: a.summary, needsConfirm: a.needsConfirm && a.status === "pending", canUndo: a.canUndo && a.status === "done" };
}

// ======================= helpers =======================
const serial = (p: Period | null): SerialPeriod | null => (p ? { kind: p.kind, start: p.start.toISOString(), end: p.end.toISOString(), n: p.n, monthKey: p.monthKey } : null);
const unserial = (p: SerialPeriod | null | undefined): Period | null => (p ? { kind: p.kind, start: new Date(p.start), end: new Date(p.end), n: p.n, monthKey: p.monthKey } : null);

const titleCase = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
/** Capitalises only the first letter ("is mahine" → "Is mahine"). */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function istHour(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()));
}

const SUGGEST: Record<string, T4[]> = {
  start: [
    { en: "What's my balance?", hi: "मेरा बैलेंस कितना है?", gu: "મારું બેલેન્સ કેટલું છે?", hn: "Mera balance kitna hai?" },
    { en: "How much did I spend this month?", hi: "इस महीने कितना खर्च हुआ?", gu: "આ મહિને કેટલો ખર્ચ થયો?", hn: "Is mahine kitna kharcha hua?" },
    { en: "How can I save ₹10,000 a month?", hi: "हर महीने ₹10,000 कैसे बचाऊं?", gu: "દર મહિને ₹10,000 કેવી રીતે બચાવું?", hn: "Har mahine ₹10,000 kaise bachaun?" },
  ],
  money: [
    { en: "Where did most of my money go?", hi: "सबसे ज़्यादा खर्च कहां हुआ?", gu: "સૌથી વધુ ખર્ચ ક્યાં થયો?", hn: "Sabse zyada kharcha kahan hua?" },
    { en: "Compare with last month", hi: "पिछले महीने से तुलना करो", gu: "ગયા મહિના સાથે સરખામણી કરો", hn: "Pichle mahine se compare karo" },
    { en: "Why did my spending go up?", hi: "खर्च क्यों बढ़ा?", gu: "ખર્ચ કેમ વધ્યો?", hn: "Kharcha kyu badha?" },
    { en: "Am I over budget?", hi: "क्या बजट पार हुआ?", gu: "બજેટ પાર થયું?", hn: "Budget cross hua kya?" },
  ],
  action: [
    { en: "Undo", hi: "वापस लो (Undo)", gu: "પાછું કરો (Undo)", hn: "Undo karo" },
    { en: "What's my balance now?", hi: "अब बैलेंस कितना है?", gu: "હવે બેલેન્સ કેટલું છે?", hn: "Ab balance kitna hai?" },
  ],
  advice: [
    { en: "Can I afford a ₹50,000 phone?", hi: "क्या मैं ₹50,000 का फोन ले सकता हूं?", gu: "શું હું ₹50,000 નો ફોન લઈ શકું?", hn: "Kya main ₹50,000 ka phone le sakta hun?" },
    { en: "Are my goals on track?", hi: "मेरे गोल सही चल रहे हैं?", gu: "મારા ગોલ બરાબર ચાલે છે?", hn: "Mere goals on track hain?" },
    { en: "Give me suggestions", hi: "मुझे सुझाव दो", gu: "મને સૂચનો આપો", hn: "Mujhe suggestions do" },
  ],
  admin: [
    { en: "How many users are there?", hi: "कितने यूज़र हैं?", gu: "કેટલા યુઝર છે?", hn: "Kitne users hain?" },
    { en: "How many visitors today?", hi: "आज कितने विज़िटर आए?", gu: "આજે કેટલા વિઝિટર આવ્યા?", hn: "Aaj kitne visitors aaye?" },
    { en: "Total spending of all users this month", hi: "इस महीने सबका कुल खर्च", gu: "આ મહિને બધાનો કુલ ખર્ચ", hn: "Is mahine sabka total kharcha" },
  ],
};
const sug = (lang: Lang, ...keys: string[]) => keys.flatMap((k) => SUGGEST[k] ?? []).map((t) => t[lang]).slice(0, 3);

function reply(lang: Lang, text: string, extra: Partial<EngineReply> = {}): EngineReply {
  return { text, speak: forSpeech(extra.speak ?? text), lang, ...extra, ...(extra.speak ? { speak: forSpeech(extra.speak) } : {}) };
}

function deny(lang: Lang, what: "admin" | "perm" | "others"): EngineReply {
  return reply(
    lang,
    what === "others"
      ? L(lang, {
          en: "Other people's data (including the admin's) is private — I can only show and change your own. Ask me anything about your money 🙂",
          hi: "दूसरे यूज़र्स (एडमिन भी) का डेटा प्राइवेट है — मैं सिर्फ़ आपका अपना डेटा दिखा और बदल सकती हूं। अपने पैसों के बारे में कुछ भी पूछिए 🙂",
          gu: "બીજા યુઝર્સ (એડમિન પણ) નો ડેટા ખાનગી છે — હું ફક્ત તમારો પોતાનો ડેટા બતાવી અને બદલી શકું છું. તમારા પૈસા વિશે કંઈ પણ પૂછો 🙂",
          hn: "Dusre users (admin bhi) ka data private hai — main sirf aapka apna data dikha aur badal sakti hoon. Apne paison ke baare mein kuch bhi poochiye 🙂",
        })
      : what === "admin"
        ? L(lang, {
            en: "That needs admin access, which your account doesn't have.",
            hi: "इसके लिए एडमिन अनुमति चाहिए, जो आपके अकाउंट में नहीं है।",
            gu: "આ માટે એડમિન પરવાનગી જોઈએ, જે તમારા એકાઉન્ટમાં નથી.",
            hn: "Iske liye admin permission chahiye, jo aapke account mein nahi hai.",
          })
        : L(lang, {
            en: "Your account doesn't have permission for that.",
            hi: "आपके अकाउंट को इसकी अनुमति नहीं है।",
            gu: "તમારા એકાઉન્ટને આની પરવાનગી નથી.",
            hn: "Aapke account ko iski permission nahi hai.",
          }),
  );
}

// ======================= who is this about? =======================
interface Target {
  scope: "self" | "user" | "platform";
  owner: UserDoc;
  who: Who;
  note?: string;
}

const GU_SUFFIX = /(નું|ના|ની|નો|ને|એ|માં)$/;
const ROMAN_SUFFIX = /(nu|na|ni|no|ne)$/;

function candidateKeys(words: string[]): { word: string; key: string; index: number }[] {
  const out: { word: string; key: string; index: number }[] = [];
  words.forEach((w, index) => {
    const variants = new Set([w]);
    if (GU_SUFFIX.test(w)) variants.add(w.replace(GU_SUFFIX, ""));
    if (/^[a-z]+$/.test(w) && w.length >= 5 && ROMAN_SUFFIX.test(w)) variants.add(w.replace(ROMAN_SUFFIX, ""));
    for (const v of variants) {
      const key = nameKey(v);
      if (key.length >= 3) out.push({ word: v, key, index });
    }
  });
  return out;
}

/** Finds users mentioned by name/email in the message (admin only). Works for "ravi", "रवि", "રવિનું". */
async function findMentionedUsers(p: Parsed): Promise<{ users: T.UserLite[]; mentioned: string | null }> {
  if (p.email) {
    const u = await User.findOne({ email: p.email }).select("name email plan role status createdAt lastLoginAt").lean<T.UserLite & { _id: unknown }>();
    if (u) return { users: [{ ...u, _id: String(u._id) }], mentioned: p.email };
  }
  const cands = candidateKeys(p.contentWords);
  if (!cands.length) return { users: [], mentioned: null };
  const all = await T.allUsersLite();
  let best: { u: T.UserLite; score: number }[] = [];
  for (const u of all) {
    const parts = u.name.split(/\s+/).filter(Boolean).map(nameKey).filter((k) => k.length >= 2);
    const emailKey = nameKey(u.email.split("@")[0]);
    let score = 0;
    for (const c of cands) {
      if (parts[0] && c.key === parts[0]) score = Math.max(score, 2);
      else if (parts.includes(c.key)) score = Math.max(score, 1.5);
      else if (c.key === emailKey) score = Math.max(score, 1.5);
      else if (c.key.length >= 5 && parts.some((k) => k.length >= 5 && levenshtein(k, c.key, 1) <= 1)) score = Math.max(score, 1);
    }
    // full name ("ravi sharma") in order → strongest
    if (parts.length >= 2 && cands.some((c, i) => c.key === parts[0] && cands[i + 1]?.key === parts[1])) score = 3;
    if (score > 0) best.push({ u, score });
  }
  if (!best.length) return { users: [], mentioned: cands[0]?.word ?? null };
  const top = Math.max(...best.map((b) => b.score));
  best = best.filter((b) => b.score === top);
  return { users: best.map((b) => b.u).slice(0, 6), mentioned: cands[0]?.word ?? null };
}

const POSSESSIVE = new Set(["ka", "ke", "ki", "ko", "ne", "का", "के", "की", "को", "ने", "nu", "na", "ni", "no", "નું", "ના", "ની", "નો", "ને", "for", "of", "user"].map(phonetic));

async function loadUser(id: string): Promise<UserDoc | null> {
  if (!isObjectId(id)) return null;
  return User.findById(id).lean<UserDoc>();
}

type TargetResult = { ok: true; t: Target } | { ok: false; reply: EngineReply; options?: T.UserLite[] };

function possessiveWord(p: Parsed): string | null {
  for (const w of p.contentWords) {
    const i = p.tokens.indexOf(w);
    if (i < 0) continue;
    if (POSSESSIVE.has(phonetic(p.tokens[i + 1] ?? "")) || /(નું|ના|ની|નો|નુ)$/.test(w) || (POSSESSIVE.has(phonetic(p.tokens[i - 1] ?? "")) && /^(of|for|user)$/.test(p.tokens[i - 1] ?? ""))) return w;
  }
  return null;
}

const MONEY_INTENTS: Intent[] = ["balance", "expense", "income", "savings", "compare", "top_categories", "largest", "average", "overview", "forecast"];

async function resolveTarget(p: Parsed, inp: EngineInput, lang: Lang, wantsWrite: boolean, intent: Intent): Promise<TargetResult> {
  const { actor, perms, ctx } = inp;
  const isAdmin = actor.role === "admin";
  const selfT: Target = { scope: "self", owner: actor, who: whoOf(true, actor.name.split(" ")[0]) };
  if (!isAdmin) {
    // Normal users: only their own data. Asking about the admin / everyone / another user gets a clear, polite answer.
    if (p.hits.platform || p.hits.adminWord || (p.hits.users && !p.hits.self && intent !== "profile")) return { ok: false, reply: deny(lang, "others") };
    if (possessiveWord(p)) {
      const { users } = await findMentionedUsers(p);
      if (users.length && users.every((u) => u._id !== String(actor._id))) return { ok: false, reply: deny(lang, "others") };
    }
    return { ok: true, t: selfT };
  }
  // admin
  if (p.hits.platform && !wantsWrite) {
    if (!perms.includes("users.view")) return { ok: false, reply: deny(lang, "perm") };
    return { ok: true, t: { scope: "platform", owner: actor, who: whoOf(false, "All users") } };
  }
  let { users, mentioned } = await findMentionedUsers(p);
  // "uska balance" → the user from the previous question
  if (!users.length && p.hits.otherPronoun && ctx.lastUserId) {
    const u = await loadUser(ctx.lastUserId);
    if (u) users = [{ _id: String(u._id), name: u.name, email: u.email, plan: u.plan, role: u.role, status: u.status }];
  }
  if (users.length > 1) {
    const list = users.map((u, i) => `${i + 1}. ${u.name} (${u.email})`).join("\n");
    return {
      ok: false,
      options: users,
      reply: reply(
        lang,
        L(lang, {
          en: `I found more than one user. Which one?\n${list}`,
          hi: `एक से ज़्यादा यूज़र मिले। कौन से?\n${list}`,
          gu: `એકથી વધુ યુઝર મળ્યા. કયા?\n${list}`,
          hn: `Ek se zyada users mile. Kaun sa?\n${list}`,
        }),
      ),
    };
  }
  if (users.length === 1) {
    const u = users[0];
    if (u._id === String(actor._id)) return { ok: true, t: selfT };
    if (!perms.includes(wantsWrite ? "users.finance.manage" : "users.finance.view")) return { ok: false, reply: deny(lang, "perm") };
    const owner = await loadUser(u._id);
    if (!owner) return { ok: true, t: selfT };
    return { ok: true, t: { scope: "user", owner, who: whoOf(false, owner.name) } };
  }
  // "total users ki income", "sab users ka kharcha" → the whole platform
  if (!wantsWrite && p.hits.users && !p.hits.self && MONEY_INTENTS.includes(intent) && perms.includes("users.view")) {
    return { ok: true, t: { scope: "platform", owner: actor, who: whoOf(false, "All users") } };
  }
  // A name-like word used possessively ("xyz ka balance") that matches nobody → tell the admin.
  const idx = mentioned ? p.tokens.indexOf(mentioned) : -1;
  const possessive = idx >= 0 && (POSSESSIVE.has(phonetic(p.tokens[idx + 1] ?? "")) || POSSESSIVE.has(phonetic(p.tokens[idx - 1] ?? "")) || /(નું|ના|ની|નો)$/.test(mentioned ?? ""));
  if (mentioned && possessive) {
    selfT.note = L(lang, {
      en: `(No user named “${mentioned}” found — showing your own data.)`,
      hi: `(“${mentioned}” नाम का कोई यूज़र नहीं मिला — आपका डेटा दिखा रही हूं।)`,
      gu: `(“${mentioned}” નામનો કોઈ યુઝર મળ્યો નહીં — તમારો ડેટા બતાવું છું.)`,
      hn: `(“${mentioned}” naam ka koi user nahi mila — aapka data dikha rahi hoon.)`,
    });
  }
  return { ok: true, t: selfT };
}

// ======================= query answers =======================
function catBars(lang: Lang, rows: T.CatRow[], total: number, cur: string, title?: string): Card | null {
  if (!rows.length) return null;
  return {
    type: "bars",
    title,
    items: rows.slice(0, 6).map((r) => ({ label: catLabel(lang, r.category), value: total ? Math.round((r.total / total) * 1000) / 10 : 0, display: money(r.total, cur) })),
  };
}

async function answerBalance(lang: Lang, t: Target, cur: string, today: string): Promise<EngineReply> {
  const id = String(t.owner._id);
  const mp = thisMonth(today);
  const [life, month] = await Promise.all([T.lifetime(id), T.periodSums(id, mp.start, mp.end)]);
  const m = (n: number) => money(n, cur);
  const w = t.who;
  const bal = signedMoney(life.balance, cur);
  const text = L(lang, {
    en: `${w.enPoss} current balance is ${bal} (total income ${m(life.income)} − total spending ${m(life.expense)}).\nThis month: income ${m(month.income)}, spent ${m(month.expense)}, left ${signedMoney(month.income - month.expense, cur)}.`,
    hi: `${w.hiKa} मौजूदा बैलेंस ${bal} है (कुल आमदनी ${m(life.income)} − कुल खर्च ${m(life.expense)})।\nइस महीने: आमदनी ${m(month.income)}, खर्च ${m(month.expense)}, बचे ${signedMoney(month.income - month.expense, cur)}।`,
    gu: `${w.guNu} હાલનું બેલેન્સ ${bal} છે (કુલ આવક ${m(life.income)} − કુલ ખર્ચ ${m(life.expense)}).\nઆ મહિને: આવક ${m(month.income)}, ખર્ચ ${m(month.expense)}, બચ્યા ${signedMoney(month.income - month.expense, cur)}.`,
    hn: `${w.hnKa} current balance ${bal} hai (total income ${m(life.income)} − total kharcha ${m(life.expense)}).\nIs mahine: income ${m(month.income)}, kharcha ${m(month.expense)}, bache ${signedMoney(month.income - month.expense, cur)}.`,
  });
  const speak = L(lang, {
    en: `${w.enPoss} current balance is ${bal}. This month you have ${signedMoney(month.income - month.expense, cur)} left.`,
    hi: `${w.hiKa} मौजूदा बैलेंस ${bal} है। इस महीने ${signedMoney(month.income - month.expense, cur)} बचे हैं।`,
    gu: `${w.guNu} હાલનું બેલેન્સ ${bal} છે. આ મહિને ${signedMoney(month.income - month.expense, cur)} બચ્યા છે.`,
    hn: `${w.hnKa} current balance ${bal} hai. Is mahine ${signedMoney(month.income - month.expense, cur)} bache hain.`,
  });
  const cards: Card[] = [
    {
      type: "stats",
      items: [
        { label: L(lang, { en: "Balance", hi: "बैलेंस", gu: "બેલેન્સ", hn: "Balance" }), value: bal, tone: life.balance >= 0 ? "pos" : "neg" },
        { label: L(lang, { en: "This month in", hi: "इस महीने आमदनी", gu: "આ મહિને આવક", hn: "Is mahine income" }), value: m(month.income), tone: "pos" },
        { label: L(lang, { en: "This month out", hi: "इस महीने खर्च", gu: "આ મહિને ખર્ચ", hn: "Is mahine kharcha" }), value: m(month.expense), tone: "neg" },
      ],
    },
  ];
  return reply(lang, text, { speak, cards, suggestions: sug(lang, "money") });
}

async function answerFlow(kind: "expense" | "income" | "savings", lang: Lang, t: Target, cur: string, period: Period, category: string | null): Promise<EngineReply> {
  const id = t.scope === "platform" ? null : String(t.owner._id);
  const s = await T.periodSums(id, period.start, period.end, kind === "savings" ? null : category);
  const pl = periodLabel(lang, period);
  const m = (n: number) => money(n, cur);
  const w = t.who;
  const catTxt = category ? catLabel(lang, category) : "";

  if (kind === "savings") {
    const saved = s.income - s.expense;
    const rate = s.income ? pctStr((saved / s.income) * 100) : "—";
    const text = L(lang, {
      en: `${cap(pl)}: income ${m(s.income)}, spent ${m(s.expense)} → saved ${signedMoney(saved, cur)} (savings rate ${rate}).`,
      hi: `${pl}: आमदनी ${m(s.income)}, खर्च ${m(s.expense)} → बचत ${signedMoney(saved, cur)} (बचत दर ${rate})।`,
      gu: `${pl}: આવક ${m(s.income)}, ખર્ચ ${m(s.expense)} → બચત ${signedMoney(saved, cur)} (બચત દર ${rate}).`,
      hn: `${cap(pl)}: income ${m(s.income)}, kharcha ${m(s.expense)} → bachat ${signedMoney(saved, cur)} (savings rate ${rate}).`,
    });
    return reply(lang, text, { suggestions: sug(lang, "money", "advice") });
  }

  const total = kind === "expense" ? s.expense : s.income;
  const count = kind === "expense" ? s.expenseCount : s.incomeCount;
  const rows = kind === "expense" ? s.expenseByCategory : s.incomeByCategory;
  if (!count) {
    const text = L(lang, {
      en: `No ${catTxt ? `${catTxt} ` : ""}${kind === "expense" ? "expenses" : "income"} recorded ${pl}.`,
      hi: `${pl} ${catTxt ? `${catTxt} में ` : ""}कोई ${kind === "expense" ? "खर्च" : "आमदनी"} दर्ज नहीं है।`,
      gu: `${pl} ${catTxt ? `${catTxt}માં ` : ""}કોઈ ${kind === "expense" ? "ખર્ચ" : "આવક"} નોંધાયેલ નથી.`,
      hn: `${cap(pl)} ${catTxt ? `${catTxt} mein ` : ""}koi ${kind === "expense" ? "kharcha" : "income"} record nahi hai.`,
    });
    return reply(lang, text, { suggestions: sug(lang, "start") });
  }
  let text: string;
  if (t.scope === "platform") {
    text = L(lang, {
      en: `All users together ${kind === "expense" ? "spent" : "earned"} ${m(total)} ${pl}${catTxt ? ` on ${catTxt}` : ""} (${count} entries).`,
      hi: `सभी यूज़र्स ने मिलकर ${pl}${catTxt ? ` ${catTxt} पर` : ""} ${m(total)} ${kind === "expense" ? "खर्च किए" : "कमाए"} (${count} एंट्री)।`,
      gu: `બધા યુઝર્સે મળીને ${pl}${catTxt ? ` ${catTxt} પર` : ""} ${m(total)} ${kind === "expense" ? "ખર્ચ્યા" : "કમાયા"} (${count} એન્ટ્રી).`,
      hn: `Sabhi users ne milkar ${pl}${catTxt ? ` ${catTxt} pe` : ""} ${m(total)} ${kind === "expense" ? "kharch kiye" : "kamaye"} (${count} entries).`,
    });
  } else if (kind === "expense") {
    text = L(lang, {
      en: `${w.en} spent ${m(total)} ${pl}${catTxt ? ` on ${catTxt}` : ""} across ${count} entr${count > 1 ? "ies" : "y"}.`,
      hi: `${w.hiNe} ${pl}${catTxt ? ` ${catTxt} पर` : ""} ${m(total)} खर्च किए (${count} एंट्री)।`,
      gu: `${w.guE} ${pl}${catTxt ? ` ${catTxt} પર` : ""} ${m(total)} ખર્ચ્યા (${count} એન્ટ્રી).`,
      hn: `${w.hnNe} ${pl}${catTxt ? ` ${catTxt} pe` : ""} ${m(total)} kharch kiye (${count} entries).`,
    });
  } else {
    text = L(lang, {
      en: `${w.enPoss} income ${pl}${catTxt ? ` from ${catTxt}` : ""}: ${m(total)} (${count} entr${count > 1 ? "ies" : "y"}).`,
      hi: `${pl}${catTxt ? ` ${catTxt} से` : ""} ${w.self ? "आपकी" : `${w.name} की`} आमदनी: ${m(total)} (${count} एंट्री)।`,
      gu: `${pl}${catTxt ? ` ${catTxt}માંથી` : ""} ${w.self ? "તમારી" : `${w.name}ની`} આવક: ${m(total)} (${count} એન્ટ્રી).`,
      hn: `${cap(pl)}${catTxt ? ` ${catTxt} se` : ""} ${w.self ? "aapki" : `${w.name} ki`} income: ${m(total)} (${count} entries).`,
    });
  }
  const cards: Card[] = [];
  if (!category && rows.length > 1) {
    const top = rows[0];
    text += "\n" + L(lang, {
      en: `Biggest: ${catLabel(lang, top.category)} — ${m(top.total)} (${pctStr((top.total / total) * 100)}).`,
      hi: `सबसे ज़्यादा: ${catLabel(lang, top.category)} — ${m(top.total)} (${pctStr((top.total / total) * 100)})।`,
      gu: `સૌથી વધુ: ${catLabel(lang, top.category)} — ${m(top.total)} (${pctStr((top.total / total) * 100)}).`,
      hn: `Sabse zyada: ${catLabel(lang, top.category)} — ${m(top.total)} (${pctStr((top.total / total) * 100)}).`,
    });
    const bars = catBars(lang, rows, total, cur);
    if (bars) cards.push(bars);
  }
  return reply(lang, text, { cards, suggestions: sug(lang, "money") });
}

async function answerTop(lang: Lang, t: Target, cur: string, period: Period): Promise<EngineReply> {
  const id = t.scope === "platform" ? null : String(t.owner._id);
  const s = await T.periodSums(id, period.start, period.end);
  const pl = periodLabel(lang, period);
  if (!s.expenseCount) return answerFlow("expense", lang, t, cur, period, null);
  const top = s.expenseByCategory.slice(0, 3);
  const m = (n: number) => money(n, cur);
  const list = top.map((r, i) => `${i + 1}. ${catLabel(lang, r.category)} — ${m(r.total)} (${pctStr((r.total / s.expense) * 100)})`).join("\n");
  const text = L(lang, {
    en: `${cap(pl)}, most of the money went to:\n${list}`,
    hi: `${pl} सबसे ज़्यादा पैसा यहां गया:\n${list}`,
    gu: `${pl} સૌથી વધુ પૈસા અહીં ગયા:\n${list}`,
    hn: `${cap(pl)} sabse zyada paisa yahan gaya:\n${list}`,
  });
  const speak = L(lang, {
    en: `${cap(pl)}, most went to ${catLabel(lang, top[0].category)}: ${m(top[0].total)}.`,
    hi: `${pl} सबसे ज़्यादा ${catLabel(lang, top[0].category)} पर गया: ${m(top[0].total)}।`,
    gu: `${pl} સૌથી વધુ ${catLabel(lang, top[0].category)} પર ગયા: ${m(top[0].total)}.`,
    hn: `${cap(pl)} sabse zyada ${catLabel(lang, top[0].category)} pe gaya: ${m(top[0].total)}.`,
  });
  const bars = catBars(lang, s.expenseByCategory, s.expense, cur);
  return reply(lang, text, { speak, cards: bars ? [bars] : [], suggestions: sug(lang, "advice", "money") });
}

async function answerCompare(lang: Lang, t: Target, cur: string, period: Period): Promise<EngineReply> {
  const id = t.scope === "platform" ? null : String(t.owner._id);
  // previous equivalent window: previous month for month periods, else same length right before
  let prev: Period;
  if (period.kind === "month" || period.kind === "namedMonth" || period.kind === "lastMonth") {
    const s = period.start;
    prev = { kind: "namedMonth", start: new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - 1, 1)), end: s };
  } else {
    const len = period.end.getTime() - period.start.getTime();
    prev = { kind: "lastNDays", start: new Date(period.start.getTime() - len), end: period.start, n: Math.round(len / 86400000) };
  }
  const [a, b] = await Promise.all([T.periodSums(id, period.start, period.end), T.periodSums(id, prev.start, prev.end)]);
  const m = (n: number) => money(n, cur);
  const ch = (x: number, y: number) => (y ? `${x >= y ? "+" : "−"}${pctStr(Math.abs(((x - y) / y) * 100))}` : "—");
  const prevMap = new Map(b.expenseByCategory.map((r) => [r.category, r.total]));
  const movers = a.expenseByCategory
    .map((r) => ({ c: r.category, d: r.total - (prevMap.get(r.category) ?? 0) }))
    .filter((x) => Math.abs(x.d) >= 1)
    .sort((x, y) => y.d - x.d);
  const up = movers[0] && movers[0].d > 0 ? movers[0] : null;
  const isMonth = period.kind === "month" || period.kind === "namedMonth" || period.kind === "lastMonth";
  const mLabel = (x: Period) => monthName(lang, x.start.getUTCMonth(), x.start.getUTCFullYear());
  const pa = isMonth ? mLabel(period) : periodLabel(lang, period);
  const pb = isMonth ? mLabel(prev) : periodLabel(lang, prev);
  const lines = [
    L(lang, {
      en: `${cap(pa)} vs ${pb}:`,
      hi: `${pa} बनाम ${pb}:`,
      gu: `${pa} સામે ${pb}:`,
      hn: `${cap(pa)} vs ${pb}:`,
    }),
    `• ${L(lang, { en: "Income", hi: "आमदनी", gu: "આવક", hn: "Income" })}: ${m(a.income)} vs ${m(b.income)} (${ch(a.income, b.income)})`,
    `• ${L(lang, { en: "Spending", hi: "खर्च", gu: "ખર્ચ", hn: "Kharcha" })}: ${m(a.expense)} vs ${m(b.expense)} (${ch(a.expense, b.expense)})`,
    `• ${L(lang, { en: "Saved", hi: "बचत", gu: "બચત", hn: "Bachat" })}: ${signedMoney(a.income - a.expense, cur)} vs ${signedMoney(b.income - b.expense, cur)}`,
  ];
  if (up)
    lines.push(
      L(lang, {
        en: `Biggest jump: ${catLabel(lang, up.c)} (+${m(up.d)}).`,
        hi: `सबसे ज़्यादा बढ़ा: ${catLabel(lang, up.c)} (+${m(up.d)})।`,
        gu: `સૌથી વધુ વધ્યું: ${catLabel(lang, up.c)} (+${m(up.d)}).`,
        hn: `Sabse zyada badha: ${catLabel(lang, up.c)} (+${m(up.d)}).`,
      }),
    );
  return reply(lang, lines.join("\n"), { suggestions: sug(lang, "advice", "money") });
}

async function answerLargest(lang: Lang, t: Target, cur: string, period: Period): Promise<EngineReply> {
  const big = await T.largestExpense(String(t.owner._id), period.start, period.end);
  const pl = periodLabel(lang, period);
  if (!big) return answerFlow("expense", lang, t, cur, period, null);
  const text = L(lang, {
    en: `The biggest single expense ${pl}: “${big.title}” — ${money(big.amount, cur)} (${big.category}, ${dateLabel(lang, big.date)}).`,
    hi: `${pl} सबसे बड़ा खर्च: “${big.title}” — ${money(big.amount, cur)} (${catLabel(lang, big.category)}, ${dateLabel(lang, big.date)})।`,
    gu: `${pl} સૌથી મોટો ખર્ચ: “${big.title}” — ${money(big.amount, cur)} (${catLabel(lang, big.category)}, ${dateLabel(lang, big.date)}).`,
    hn: `${cap(pl)} sabse bada kharcha: “${big.title}” — ${money(big.amount, cur)} (${big.category}, ${dateLabel(lang, big.date)}).`,
  });
  return reply(lang, text, { suggestions: sug(lang, "money") });
}

async function answerRecent(lang: Lang, t: Target, cur: string): Promise<EngineReply> {
  const rows = await T.recentTransactions(String(t.owner._id), 6);
  if (!rows.length) return reply(lang, L(lang, { en: "No transactions yet.", hi: "अभी तक कोई लेनदेन नहीं है।", gu: "હજી સુધી કોઈ વ્યવહાર નથી.", hn: "Abhi tak koi transaction nahi hai." }));
  const card: Card = {
    type: "list",
    items: rows.map((r) => ({ title: r.title, subtitle: `${catLabel(lang, r.category)} · ${dateLabel(lang, r.date)}`, value: `${r.kind === "income" ? "+" : "−"}${money(r.amount, cur)}`, tone: r.kind === "income" ? "pos" : "neg" })),
  };
  const text = L(lang, {
    en: `Here are the latest ${rows.length} transactions. The last one: “${rows[0].title}” ${money(rows[0].amount, cur)}.`,
    hi: `ये रहे आखिरी ${rows.length} लेनदेन। सबसे ताज़ा: “${rows[0].title}” ${money(rows[0].amount, cur)}।`,
    gu: `આ રહ્યા છેલ્લા ${rows.length} વ્યવહાર. સૌથી તાજો: “${rows[0].title}” ${money(rows[0].amount, cur)}.`,
    hn: `Ye rahe aakhri ${rows.length} transactions. Sabse latest: “${rows[0].title}” ${money(rows[0].amount, cur)}.`,
  });
  return reply(lang, text, { cards: [card] });
}

async function answerDebts(lang: Lang, t: Target, cur: string, today: string): Promise<EngineReply> {
  const debts = await T.debtsOf(String(t.owner._id));
  if (!debts.length)
    return reply(lang, L(lang, { en: "No active loans or EMIs. 🎉", hi: "कोई चालू लोन या EMI नहीं है। 🎉", gu: "કોઈ ચાલુ લોન કે EMI નથી. 🎉", hn: "Koi active loan ya EMI nahi hai. 🎉" }));
  const m = (n: number) => money(n, cur);
  const remaining = debts.reduce((s, d) => s + d.remaining, 0);
  const emi = debts.filter((d) => d.status === "active").reduce((s, d) => s + d.emi, 0);
  const next = debts.filter((d) => d.status === "active").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const days = next ? Math.round((parseYmd(next.dueDate).getTime() - parseYmd(today).getTime()) / 86400000) : null;
  const dueTxt = next
    ? L(lang, {
        en: ` Next EMI: “${next.title}” ${m(next.emi)} on ${dateLabel(lang, next.dueDate)}${days !== null ? (days < 0 ? ` (${-days} days overdue!)` : days === 0 ? " (today)" : ` (in ${days} days)`) : ""}.`,
        hi: ` अगली EMI: “${next.title}” ${m(next.emi)}, ${dateLabel(lang, next.dueDate)}${days !== null ? (days < 0 ? ` (${-days} दिन लेट!)` : days === 0 ? " (आज)" : ` (${days} दिन में)`) : ""}।`,
        gu: ` આગલી EMI: “${next.title}” ${m(next.emi)}, ${dateLabel(lang, next.dueDate)}${days !== null ? (days < 0 ? ` (${-days} દિવસ મોડું!)` : days === 0 ? " (આજે)" : ` (${days} દિવસમાં)`) : ""}.`,
        hn: ` Agli EMI: “${next.title}” ${m(next.emi)}, ${dateLabel(lang, next.dueDate)}${days !== null ? (days < 0 ? ` (${-days} din late!)` : days === 0 ? " (aaj)" : ` (${days} din mein)`) : ""}.`,
      })
    : "";
  const text =
    L(lang, {
      en: `${debts.length} open loan(s): ${m(remaining)} still to repay, EMIs ${m(emi)}/month.`,
      hi: `${debts.length} चालू लोन: ${m(remaining)} चुकाना बाकी, EMI ${m(emi)}/महीना।`,
      gu: `${debts.length} ચાલુ લોન: ${m(remaining)} ચૂકવવાના બાકી, EMI ${m(emi)}/મહિનો.`,
      hn: `${debts.length} open loan: ${m(remaining)} chukana baaki, EMI ${m(emi)}/mahina.`,
    }) + dueTxt;
  const card: Card = {
    type: "list",
    items: debts.slice(0, 6).map((d) => ({
      title: d.title,
      subtitle: `EMI ${m(d.emi)} · ${dateLabel(lang, d.dueDate)}${d.interestRate ? ` · ${d.interestRate}%` : ""}${d.emi ? ` · ${Math.ceil(d.remaining / d.emi)} ${L(lang, { en: "months left", hi: "महीने बाकी", gu: "મહિના બાકી", hn: "mahine baaki" })}` : ""}`,
      value: m(d.remaining),
      tone: "neg",
    })),
  };
  return reply(lang, text, { cards: [card], suggestions: sug(lang, "advice") });
}

async function answerGoals(lang: Lang, t: Target, cur: string, today: string, words: string[] = []): Promise<EngineReply> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs: any[] = await Goal.find({ userId: t.owner._id, status: { $ne: "cancelled" } }).sort({ status: 1, targetDate: 1 }).limit(30).lean();
  if (!docs.length)
    return reply(
      lang,
      L(lang, {
        en: "No savings goals yet. Say for example “create a goal of 1 lakh for a bike by March”.",
        hi: "अभी कोई सेविंग गोल नहीं है। जैसे बोलिए: “बाइक के लिए मार्च तक 1 लाख का गोल बनाओ”।",
        gu: "હજી કોઈ બચત ગોલ નથી. જેમ કે બોલો: “બાઇક માટે માર્ચ સુધી 1 લાખનો ગોલ બનાવો”.",
        hn: "Abhi koi saving goal nahi hai. Jaise boliye: “bike ke liye March tak 1 lakh ka goal banao”.",
      }),
    );
  const paces = await goalPaces(docs.map((d) => d._id));
  const m = (n: number) => money(Math.round(n), cur);
  const rows = docs.map((d) => ({ id: String(d._id), name: d.name as string, target: fromMinor(d.targetAmount), current: fromMinor(d.currentAmount), targetDate: new Date(d.targetDate).toISOString().slice(0, 10), gi: goalInsight(d, paces.get(String(d._id)) ?? null) }));
  const ST: Record<string, T4> = {
    achieved: { en: "achieved ✓", hi: "पूरा ✓", gu: "પૂરું ✓", hn: "poora ✓" },
    ahead: { en: "ahead of schedule", hi: "समय से आगे", gu: "સમય કરતાં આગળ", hn: "time se aage" },
    on_track: { en: "on track", hi: "सही रास्ते पर", gu: "સાચા માર્ગે", hn: "on track" },
    behind: { en: "behind schedule", hi: "समय से पीछे", gu: "સમય કરતાં પાછળ", hn: "time se peeche" },
    overdue: { en: "deadline passed", hi: "तारीख निकल गई", gu: "તારીખ વીતી ગઈ", hn: "date nikal gayi" },
    not_started: { en: "not started", hi: "शुरू नहीं हुआ", gu: "શરૂ નથી થયું", hn: "shuru nahi hua" },
    paused: { en: "paused", hi: "रुका हुआ", gu: "અટકેલું", hn: "paused" },
    cancelled: { en: "cancelled", hi: "रद्द", gu: "રદ", hn: "cancelled" },
  };
  const focus = words.length ? matchByName(rows, (g) => g.name, words) : [];
  if (focus.length === 1) {
    const g = focus[0];
    const gi = g.gi;
    const pctNow = g.target ? Math.round((g.current / g.target) * 100) : 0;
    const text = L(lang, {
      en: `“${g.name}”: ${m(g.current)} of ${m(g.target)} (${pctNow}%) — ${L(lang, ST[gi.status])}.
${gi.status === "achieved" ? "🎉 Done!" : `To finish by ${dateLabel(lang, g.targetDate)} you need ${m(gi.requiredMonthly)}/month for ${Math.ceil(gi.monthsLeft) || 1} month(s). You've been adding about ${m(gi.monthlyPace)}/month${gi.projectedDate ? `, so at this pace you'll finish around ${dateLabel(lang, gi.projectedDate)}` : " — start contributing to see a finish date"}. By now you'd ideally be at ${gi.expectedProgress}%.`}`,
      hi: `“${g.name}”: ${m(g.target)} में से ${m(g.current)} (${pctNow}%) — ${L(lang, ST[gi.status])}।
${gi.status === "achieved" ? "🎉 पूरा हो गया!" : `${dateLabel(lang, g.targetDate)} तक पूरा करने के लिए ${Math.ceil(gi.monthsLeft) || 1} महीने तक हर महीने ${m(gi.requiredMonthly)} चाहिए। आप लगभग ${m(gi.monthlyPace)}/महीना डाल रहे हैं${gi.projectedDate ? `, इसी रफ़्तार से ${dateLabel(lang, gi.projectedDate)} के आसपास पूरा होगा` : " — पैसे डालना शुरू करें तो तारीख दिखेगी"}। अब तक आदर्श रूप से ${gi.expectedProgress}% होना चाहिए था।`}`,
      gu: `“${g.name}”: ${m(g.target)} માંથી ${m(g.current)} (${pctNow}%) — ${L(lang, ST[gi.status])}.
${gi.status === "achieved" ? "🎉 પૂરું થઈ ગયું!" : `${dateLabel(lang, g.targetDate)} સુધી પૂરું કરવા ${Math.ceil(gi.monthsLeft) || 1} મહિના સુધી દર મહિને ${m(gi.requiredMonthly)} જોઈએ. તમે આશરે ${m(gi.monthlyPace)}/મહિનો નાખો છો${gi.projectedDate ? `, આ ઝડપે ${dateLabel(lang, gi.projectedDate)} આસપાસ પૂરું થશે` : " — પૈસા નાખવાનું શરૂ કરો તો તારીખ દેખાશે"}. અત્યાર સુધીમાં આદર્શ રીતે ${gi.expectedProgress}% હોવું જોઈએ.`}`,
      hn: `“${g.name}”: ${m(g.target)} mein se ${m(g.current)} (${pctNow}%) — ${L(lang, ST[gi.status])}.
${gi.status === "achieved" ? "🎉 Poora ho gaya!" : `${dateLabel(lang, g.targetDate)} tak poora karne ke liye ${Math.ceil(gi.monthsLeft) || 1} mahine tak har mahine ${m(gi.requiredMonthly)} chahiye. Aap lagbhag ${m(gi.monthlyPace)}/mahina daal rahe hain${gi.projectedDate ? `, isi raftaar se ${dateLabel(lang, gi.projectedDate)} ke aas-paas poora hoga` : " — paise daalna shuru kijiye to date dikhegi"}. Ab tak ideally ${gi.expectedProgress}% hona chahiye tha.`}`,
    });
    return reply(lang, text, { suggestions: [L(lang, { en: `Put 2000 in ${g.name}`, hi: `${g.name} में 2000 डालो`, gu: `${g.name} માં 2000 નાખો`, hn: `${g.name} mein 2000 daalo` }), ...sug(lang, "advice")].slice(0, 3) });
  }
  const items = rows.slice(0, 8).map((g) => ({
    title: g.name,
    subtitle: `${m(g.current)} / ${m(g.target)} · ${L(lang, ST[g.gi.status])}${g.gi.status !== "achieved" && g.gi.requiredMonthly ? ` · ${m(g.gi.requiredMonthly)}${M3(lang)}` : ""}`,
    value: `${Math.min(100, Math.round((g.current / g.target) * 100))}%`,
    tone: (g.gi.status === "achieved" || g.gi.status === "ahead" || g.gi.status === "on_track" ? "pos" : g.gi.status === "behind" || g.gi.status === "overdue" ? "neg" : "neutral") as "pos" | "neg" | "neutral",
  }));
  const saved = rows.reduce((x, g) => x + g.current, 0);
  const target = rows.reduce((x, g) => x + g.target, 0);
  const behind = rows.filter((g) => g.gi.status === "behind" || g.gi.status === "overdue" || g.gi.status === "not_started");
  const needAll = rows.filter((g) => g.gi.status !== "achieved").reduce((x, g) => x + g.gi.requiredMonthly, 0);
  const text = L(lang, {
    en: `${rows.length} goal(s): ${m(saved)} saved of ${m(target)} (${pctStr((saved / target) * 100)}). To hit every deadline you need about ${m(needAll)}/month in total.${behind.length ? ` Behind: ${behind.map((g) => g.name).join(", ")}.` : " Everything is on track 👍"}`,
    hi: `${rows.length} गोल: ${m(target)} में से ${m(saved)} जमा (${pctStr((saved / target) * 100)})। सारी तारीखें पूरी करने के लिए कुल लगभग ${m(needAll)}/महीना चाहिए।${behind.length ? ` पीछे चल रहे: ${behind.map((g) => g.name).join(", ")}।` : " सब सही रास्ते पर 👍"}`,
    gu: `${rows.length} ગોલ: ${m(target)} માંથી ${m(saved)} જમા (${pctStr((saved / target) * 100)}). બધી તારીખો પૂરી કરવા કુલ આશરે ${m(needAll)}/મહિનો જોઈએ.${behind.length ? ` પાછળ: ${behind.map((g) => g.name).join(", ")}.` : " બધું સાચા માર્ગે 👍"}`,
    hn: `${rows.length} goal: ${m(target)} mein se ${m(saved)} jama (${pctStr((saved / target) * 100)}). Saari dates poori karne ke liye total lagbhag ${m(needAll)}/mahina chahiye.${behind.length ? ` Peeche: ${behind.map((g) => g.name).join(", ")}.` : " Sab on track 👍"}`,
  });
  return reply(lang, text, { cards: [{ type: "list", items }], suggestions: sug(lang, "advice") });
}

async function answerHealth(lang: Lang, t: Target): Promise<EngineReply> {
  const d = await getDashboard(String(t.owner._id));
  const h = d.health;
  if (h.score === null) return reply(lang, L(lang, { en: "Not enough data for a health score yet.", hi: "हेल्थ स्कोर के लिए अभी डेटा कम है।", gu: "હેલ્થ સ્કોર માટે હજી ડેટા ઓછો છે.", hn: "Health score ke liye abhi data kam hai." }));
  const label =
    h.score >= 70
      ? L(lang, { en: "healthy", hi: "अच्छी", gu: "સારી", hn: "healthy" })
      : h.score >= 45
        ? L(lang, { en: "fair", hi: "ठीक-ठाक", gu: "ઠીક-ઠાક", hn: "theek-thaak" })
        : L(lang, { en: "needs attention", hi: "ध्यान देने लायक", gu: "ધ્યાન આપવા જેવી", hn: "dhyan dene layak" });
  const text = L(lang, {
    en: `Financial health score: ${h.score}/100 — ${label}.\nSavings rate ${h.savingsRate ?? "—"}%, EMI-to-income ${h.emiRatio ?? "—"}%, spending ratio ${h.expenseRatio ?? "—"}%, goal progress ${h.goalProgress ?? "—"}%.`,
    hi: `फाइनेंशियल हेल्थ स्कोर: ${h.score}/100 — स्थिति ${label} है।\nबचत दर ${h.savingsRate ?? "—"}%, EMI/आमदनी ${h.emiRatio ?? "—"}%, खर्च अनुपात ${h.expenseRatio ?? "—"}%, गोल प्रगति ${h.goalProgress ?? "—"}%।`,
    gu: `ફાઇનાન્શિયલ હેલ્થ સ્કોર: ${h.score}/100 — સ્થિતિ ${label} છે.\nબચત દર ${h.savingsRate ?? "—"}%, EMI/આવક ${h.emiRatio ?? "—"}%, ખર્ચ પ્રમાણ ${h.expenseRatio ?? "—"}%, ગોલ પ્રગતિ ${h.goalProgress ?? "—"}%.`,
    hn: `Financial health score: ${h.score}/100 — ${label}.\nSavings rate ${h.savingsRate ?? "—"}%, EMI/income ${h.emiRatio ?? "—"}%, kharcha ratio ${h.expenseRatio ?? "—"}%, goal progress ${h.goalProgress ?? "—"}%.`,
  });
  return reply(lang, text, { suggestions: sug(lang, "advice") });
}

async function answerInsights(lang: Lang, t: Target, cur: string): Promise<EngineReply> {
  const r = await generateInsights(String(t.owner._id), { advanced: true, currency: cur, lang });
  const top = r.insights.slice(0, 4);
  if (!top.length) return reply(lang, L(lang, { en: "No insights yet — add a few entries first.", hi: "अभी कोई इनसाइट नहीं — पहले कुछ एंट्री जोड़िए।", gu: "હજી કોઈ ઇનસાઇટ નથી — પહેલાં થોડી એન્ટ્રી ઉમેરો.", hn: "Abhi koi insight nahi — pehle kuch entries add kijiye." }));
  const head = L(lang, { en: "Here's what stands out:", hi: "ये बातें ध्यान देने लायक हैं:", gu: "આ વાતો ધ્યાન આપવા જેવી છે:", hn: "Ye baatein dhyan dene layak hain:" });
  const text = [head, ...top.map((i) => `• ${i.title}: ${i.message}`)].join("\n");
  return reply(lang, text, { speak: `${head} ${top[0].title}. ${top[0].message}`, suggestions: sug(lang, "advice") });
}

async function answerForecast(lang: Lang, t: Target, cur: string, today: string): Promise<EngineReply> {
  const p = thisMonth(today);
  const s = await T.periodSums(String(t.owner._id), p.start, p.end);
  const day = parseYmd(today).getUTCDate();
  const dim = new Date(p.end.getTime() - 86400000).getUTCDate();
  const projected = day ? (s.expense / day) * dim : s.expense;
  const left = s.income - projected;
  const m = (n: number) => money(Math.round(n), cur);
  const text = L(lang, {
    en: `So far this month: income ${m(s.income)}, spent ${m(s.expense)} in ${day} days (${m(s.expense / Math.max(1, day))}/day). At this pace month-end spending ≈ ${m(projected)}, so about ${signedMoney(Math.round(left), cur)} will be left.`,
    hi: `इस महीने अब तक: आमदनी ${m(s.income)}, ${day} दिन में खर्च ${m(s.expense)} (${m(s.expense / Math.max(1, day))}/दिन)। इसी रफ़्तार से महीने के अंत तक खर्च ≈ ${m(projected)}, यानी लगभग ${signedMoney(Math.round(left), cur)} बचेंगे।`,
    gu: `આ મહિને અત્યાર સુધી: આવક ${m(s.income)}, ${day} દિવસમાં ખર્ચ ${m(s.expense)} (${m(s.expense / Math.max(1, day))}/દિવસ). આ ઝડપે મહિનાના અંતે ખર્ચ ≈ ${m(projected)}, એટલે આશરે ${signedMoney(Math.round(left), cur)} બચશે.`,
    hn: `Is mahine ab tak: income ${m(s.income)}, ${day} din mein kharcha ${m(s.expense)} (${m(s.expense / Math.max(1, day))}/din). Isi raftaar se mahine ke end tak kharcha ≈ ${m(projected)}, yaani lagbhag ${signedMoney(Math.round(left), cur)} bachenge.`,
  });
  return reply(lang, text, { suggestions: sug(lang, "advice") });
}

async function answerAverage(lang: Lang, t: Target, cur: string, period: Period, today: string, category: string | null): Promise<EngineReply> {
  const s = await T.periodSums(String(t.owner._id), period.start, period.end, category);
  const end = Math.min(period.end.getTime(), parseYmd(today).getTime() + 86400000);
  const days = Math.max(1, Math.round((end - period.start.getTime()) / 86400000));
  const avg = s.expense / days;
  const pl = periodLabel(lang, period);
  const text = L(lang, {
    en: `${cap(pl)} the average daily spending${category ? ` on ${category}` : ""} is ${money(Math.round(avg), cur)} (${money(s.expense, cur)} over ${days} days).`,
    hi: `${pl}${category ? ` ${catLabel(lang, category)} पर` : ""} रोज़ का औसत खर्च ${money(Math.round(avg), cur)} है (${days} दिन में ${money(s.expense, cur)})।`,
    gu: `${pl}${category ? ` ${catLabel(lang, category)} પર` : ""} રોજનો સરેરાશ ખર્ચ ${money(Math.round(avg), cur)} છે (${days} દિવસમાં ${money(s.expense, cur)}).`,
    hn: `${cap(pl)}${category ? ` ${category} pe` : ""} roz ka average kharcha ${money(Math.round(avg), cur)} hai (${days} din mein ${money(s.expense, cur)}).`,
  });
  return reply(lang, text, { suggestions: sug(lang, "money") });
}

async function advisorInput(lang: Lang, t: Target, cur: string, today: string): Promise<AdvisorInput> {
  const st = await T.advisorStats(String(t.owner._id), today);
  return {
    lang,
    currency: cur,
    who: t.who,
    today,
    balance: st.balance,
    avgIncome: st.avgIncome,
    avgExpense: st.avgExpense,
    monthsOfData: st.months,
    categoryAvg: st.categoryAvg,
    emiMonthly: st.emiMonthly,
    debts: st.debts.map((d) => ({ title: d.title, remaining: d.remaining, interestRate: d.interestRate, emi: d.emi })),
  };
}

async function answerPlatform(lang: Lang, cur: string, period: Period): Promise<EngineReply> {
  const [u, s, top] = await Promise.all([T.platformUsers(period.start, period.end), T.periodSums(null, period.start, period.end), T.topSpenders(period.start, period.end, 3)]);
  const pl = periodLabel(lang, period);
  const m = (n: number) => money(n, cur);
  const text = L(lang, {
    en: `You have ${u.total} users on Budget Pro (${u.active} active, ${u.activeLast30} logged in within 30 days, ${u.admins} admin).\nPlans: Free ${u.free}, Plus ${u.plus}, Pro ${u.pro}, Unlimited ${u.unlimited}. New sign-ups ${pl}: ${u.signups ?? 0}.\nAll users ${pl}: income ${m(s.income)}, spending ${m(s.expense)}.`,
    hi: `आपके Budget Pro पर कुल ${u.total} यूज़र हैं (${u.active} एक्टिव, 30 दिन में ${u.activeLast30} ने लॉगिन किया, ${u.admins} एडमिन)।\nप्लान: Free ${u.free}, Plus ${u.plus}, Pro ${u.pro}, Unlimited ${u.unlimited}। ${pl} नए साइन-अप: ${u.signups ?? 0}।\n${pl} सबकी कुल आमदनी ${m(s.income)}, कुल खर्च ${m(s.expense)}।`,
    gu: `તમારા Budget Pro પર કુલ ${u.total} યુઝર છે (${u.active} એક્ટિવ, 30 દિવસમાં ${u.activeLast30} એ લૉગિન કર્યું, ${u.admins} એડમિન).\nપ્લાન: Free ${u.free}, Plus ${u.plus}, Pro ${u.pro}, Unlimited ${u.unlimited}. ${pl} નવા સાઇન-અપ: ${u.signups ?? 0}.\n${pl} બધાની કુલ આવક ${m(s.income)}, કુલ ખર્ચ ${m(s.expense)}.`,
    hn: `Aapke Budget Pro par total ${u.total} users hain (${u.active} active, 30 din mein ${u.activeLast30} ne login kiya, ${u.admins} admin).\nPlans: Free ${u.free}, Plus ${u.plus}, Pro ${u.pro}, Unlimited ${u.unlimited}. ${cap(pl)} naye sign-ups: ${u.signups ?? 0}.\n${cap(pl)} sabki total income ${m(s.income)}, total kharcha ${m(s.expense)}.`,
  });
  const cards: Card[] = [];
  if (top.length)
    cards.push({
      type: "list",
      title: L(lang, { en: "Top spenders", hi: "सबसे ज़्यादा खर्च करने वाले", gu: "સૌથી વધુ ખર્ચ કરનાર", hn: "Top spenders" }) + ` · ${pl}`,
      items: top.map((x) => ({ title: x.name, subtitle: x.email, value: m(x.total), tone: "neg" as const })),
    });
  return reply(lang, text, { speak: text.split("\n")[0], cards, suggestions: sug(lang, "admin") });
}

async function answerListUsers(lang: Lang): Promise<EngineReply> {
  const users = await T.allUsersLite(10);
  const card: Card = {
    type: "list",
    items: users.map((u) => ({ title: u.name, subtitle: `${u.email} · ${u.role === "admin" ? "admin" : getPlan(u.plan).name}${u.status !== "active" ? " · disabled" : ""}`, value: u.createdAt ? dateLabel(lang, new Date(u.createdAt).toISOString().slice(0, 10)) : "" })),
  };
  return reply(lang, L(lang, { en: "The 10 newest users:", hi: "सबसे नए 10 यूज़र:", gu: "સૌથી નવા 10 યુઝર:", hn: "Sabse naye 10 users:" }), { cards: [card], suggestions: sug(lang, "admin") });
}


// ---------- overview ("mera hisaab batao", "how am I doing", "ravi ka is mahine ka hisaab") ----------
async function answerOverview(lang: Lang, t: Target, cur: string, period: Period, today: string): Promise<EngineReply> {
  const id = String(t.owner._id);
  const [s, life, debts, goals] = await Promise.all([T.periodSums(id, period.start, period.end), T.lifetime(id), T.debtsOf(id), T.goalsOf(id, true)]);
  const m = (n: number) => money(n, cur);
  const pl = periodLabel(lang, period);
  const left = s.income - s.expense;
  const w = t.who;
  const lines: string[] = [];
  if (!w.self) lines.push(`${w.name} (${t.owner.email})`);
  lines.push(
    L(lang, {
      en: `${cap(pl)}: income ${m(s.income)}, spent ${m(s.expense)} → ${left >= 0 ? "left" : "overspent"} ${m(Math.abs(left))}.`,
      hi: `${pl}: आमदनी ${m(s.income)}, खर्च ${m(s.expense)} → ${left >= 0 ? "बचे" : "ज़्यादा खर्च"} ${m(Math.abs(left))}।`,
      gu: `${pl}: આવક ${m(s.income)}, ખર્ચ ${m(s.expense)} → ${left >= 0 ? "બચ્યા" : "વધુ ખર્ચ"} ${m(Math.abs(left))}.`,
      hn: `${cap(pl)}: income ${m(s.income)}, kharcha ${m(s.expense)} → ${left >= 0 ? "bache" : "zyada kharcha"} ${m(Math.abs(left))}.`,
    }),
  );
  lines.push(L(lang, { en: `Total balance: ${signedMoney(life.balance, cur)}.`, hi: `कुल बैलेंस: ${signedMoney(life.balance, cur)}।`, gu: `કુલ બેલેન્સ: ${signedMoney(life.balance, cur)}.`, hn: `Total balance: ${signedMoney(life.balance, cur)}.` }));
  const top = s.expenseByCategory[0];
  if (top)
    lines.push(
      L(lang, {
        en: `Most spent on ${catLabel(lang, top.category)}: ${m(top.total)}.`,
        hi: `सबसे ज़्यादा खर्च ${catLabel(lang, top.category)} पर: ${m(top.total)}।`,
        gu: `સૌથી વધુ ખર્ચ ${catLabel(lang, top.category)} પર: ${m(top.total)}.`,
        hn: `Sabse zyada kharcha ${catLabel(lang, top.category)} pe: ${m(top.total)}.`,
      }),
    );
  const active = debts.filter((d) => d.status === "active");
  if (active.length) {
    const next = [...active].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const rem = debts.reduce((x, d) => x + d.remaining, 0);
    lines.push(
      L(lang, {
        en: `Loans: ${m(rem)} left; next EMI “${next.title}” ${m(next.emi)} on ${dateLabel(lang, next.dueDate)}.`,
        hi: `लोन: ${m(rem)} बाकी; अगली EMI “${next.title}” ${m(next.emi)}, ${dateLabel(lang, next.dueDate)}।`,
        gu: `લોન: ${m(rem)} બાકી; આગલી EMI “${next.title}” ${m(next.emi)}, ${dateLabel(lang, next.dueDate)}.`,
        hn: `Loan: ${m(rem)} baaki; agli EMI “${next.title}” ${m(next.emi)}, ${dateLabel(lang, next.dueDate)}.`,
      }),
    );
  }
  if (goals.length) {
    const saved = goals.reduce((x, g) => x + g.current, 0);
    const target = goals.reduce((x, g) => x + g.target, 0);
    lines.push(
      L(lang, {
        en: `Goals: ${goals.length} open, ${m(saved)} saved of ${m(target)}.`,
        hi: `गोल: ${goals.length} चालू, ${m(target)} में से ${m(saved)} जमा।`,
        gu: `ગોલ: ${goals.length} ચાલુ, ${m(target)} માંથી ${m(saved)} જમા.`,
        hn: `Goals: ${goals.length} active, ${m(target)} mein se ${m(saved)} jama.`,
      }),
    );
  }
  if (!s.incomeCount && !s.expenseCount && !debts.length && !goals.length)
    lines.push(L(lang, { en: "No entries yet — tell me what you earn and spend, e.g. “salary 50000 received”.", hi: "अभी कोई एंट्री नहीं है — बताइए क्या कमाया और खर्च किया, जैसे “50000 सैलरी आई”।", gu: "હજી કોઈ એન્ટ્રી નથી — કહો શું કમાયા અને ખર્ચ્યું, જેમ કે “પગાર 50000 આવ્યો”.", hn: "Abhi koi entry nahi hai — bataiye kya kamaya aur kharch kiya, jaise “50000 salary aayi”." }));
  const cards: Card[] = [
    {
      type: "stats",
      items: [
        { label: L(lang, { en: "Income", hi: "आमदनी", gu: "આવક", hn: "Income" }), value: m(s.income), tone: "pos" },
        { label: L(lang, { en: "Spent", hi: "खर्च", gu: "ખર્ચ", hn: "Kharcha" }), value: m(s.expense), tone: "neg" },
        { label: L(lang, { en: "Left", hi: "बचे", gu: "બચ્યા", hn: "Bache" }), value: signedMoney(left, cur), tone: left >= 0 ? "pos" : "neg" },
      ],
    },
  ];
  return reply(lang, lines.join("\n"), { speak: lines.slice(w.self ? 0 : 1, w.self ? 2 : 3).join(" "), cards, suggestions: sug(lang, "money") });
}

// ---------- profile / account details ("mera plan kya hai", "ravi ki details", "ravi ka email") ----------
async function answerProfile(lang: Lang, t: Target, cur: string, p: Parsed, today: string): Promise<EngineReply> {
  const u = t.owner;
  const id = String(u._id);
  const mp = thisMonth(today);
  const [usage, life, month, debts, goals] = await Promise.all([getUsage(id), T.lifetime(id), T.periodSums(id, mp.start, mp.end), T.debtsOf(id), T.goalsOf(id, true)]);
  const plan = planForUser(u);
  const m = (n: number) => money(n, cur);
  const d = (x?: Date | null) => (x ? dateLabel(lang, new Date(x).toISOString().slice(0, 10)) : L(lang, { en: "never", hi: "कभी नहीं", gu: "ક્યારેય નહીં", hn: "kabhi nahi" }));
  const lbl = (t4: T4) => L(lang, t4);
  const records = `${usage.financeRecords}${plan.maxFinanceRecords ? ` / ${plan.maxFinanceRecords}` : ""}`;
  const items = [
    { title: lbl({ en: "Name", hi: "नाम", gu: "નામ", hn: "Naam" }), value: u.name },
    { title: "Email", value: u.email },
    { title: lbl({ en: "Plan", hi: "प्लान", gu: "પ્લાન", hn: "Plan" }), value: `${plan.name}${u.role === "admin" ? " (admin)" : ""}` },
    { title: lbl({ en: "Status", hi: "स्टेटस", gu: "સ્ટેટસ", hn: "Status" }), value: u.status },
    { title: lbl({ en: "Member since", hi: "कब जुड़े", gu: "ક્યારે જોડાયા", hn: "Member since" }), value: d(u.createdAt) },
    { title: lbl({ en: "Last login", hi: "आखिरी लॉगिन", gu: "છેલ્લું લૉગિન", hn: "Last login" }), value: d(u.lastLoginAt) },
    ...(!t.who.self || u.role === "admin"
      ? [
          { title: lbl({ en: "Last seen", hi: "आखिरी बार देखा", gu: "છેલ્લે જોયા", hn: "Last seen" }), value: d(u.lastSeenAt ?? u.lastLoginAt) },
          { title: lbl({ en: "Location (approx.)", hi: "लोकेशन (लगभग)", gu: "લોકેશન (આશરે)", hn: "Location (approx.)" }), value: [u.lastLocation?.city, u.lastLocation?.region, u.lastLocation?.country].filter(Boolean).join(", ") || "—" },
          { title: lbl({ en: "Email verified", hi: "ईमेल वेरिफाइड", gu: "ઈમેલ વેરિફાઇડ", hn: "Email verified" }), value: u.emailVerified === false ? "✗" : "✓" },
        ]
      : []),
    { title: lbl({ en: "Records", hi: "एंट्री", gu: "એન્ટ્રી", hn: "Records" }), value: `${records} · ${usage.goals} ${lbl({ en: "goals", hi: "गोल", gu: "ગોલ", hn: "goals" })}` },
    { title: lbl({ en: "Balance", hi: "बैलेंस", gu: "બેલેન્સ", hn: "Balance" }), value: signedMoney(life.balance, cur) },
    { title: lbl({ en: "This month", hi: "इस महीने", gu: "આ મહિને", hn: "Is mahine" }), value: `+${m(month.income)} / −${m(month.expense)}` },
    { title: lbl({ en: "Loans left", hi: "लोन बाकी", gu: "લોન બાકી", hn: "Loan baaki" }), value: m(debts.reduce((x, y) => x + y.remaining, 0)) },
    { title: lbl({ en: "Open goals", hi: "चालू गोल", gu: "ચાલુ ગોલ", hn: "Active goals" }), value: String(goals.length) },
  ];
  // Lead with what was asked
  const tk = p.tokens.join(" ");
  const nm = t.who.self ? L(lang, { en: "Your", hi: "आपका", gu: "તમારું", hn: "Aapka" }) : L(lang, { en: `${u.name}'s`, hi: `${u.name} का`, gu: `${u.name}નું`, hn: `${u.name} ka` });
  let head: string;
  if (/mail|ईमेल|ઈમેલ/.test(tk)) head = `${nm} email: ${u.email}`;
  else if (/login|लॉगिन|લૉગિન|લોગિન/.test(tk)) head = L(lang, { en: `${nm} last login: ${d(u.lastLoginAt)}`, hi: `${nm} आखिरी लॉगिन: ${d(u.lastLoginAt)}`, gu: `${nm} છેલ્લું લૉગિન: ${d(u.lastLoginAt)}`, hn: `${nm} last login: ${d(u.lastLoginAt)}` });
  else if (p.hits.plan) head = L(lang, { en: `${nm} plan: ${plan.name} (${records} records used).`, hi: `${nm} प्लान: ${plan.name} (${records} एंट्री)।`, gu: `${nm} પ્લાન: ${plan.name} (${records} એન્ટ્રી).`, hn: `${nm} plan: ${plan.name} (${records} records).` });
  else if (/naam|name|नाम|નામ/.test(tk) && t.who.self) head = L(lang, { en: `Your name is ${u.name}.`, hi: `आपका नाम ${u.name} है।`, gu: `તમારું નામ ${u.name} છે.`, hn: `Aapka naam ${u.name} hai.` });
  else if (/record|एंट्री/.test(tk)) head = L(lang, { en: `${nm} records: ${records}.`, hi: `${nm} एंट्री: ${records}।`, gu: `${nm} એન્ટ્રી: ${records}.`, hn: `${nm} records: ${records}.` });
  else
    head = t.who.self
      ? L(lang, { en: `Here are your account details, ${u.name.split(" ")[0]}:`, hi: `ये रही आपके अकाउंट की जानकारी:`, gu: `આ રહી તમારા એકાઉન્ટની માહિતી:`, hn: `Ye rahi aapke account ki details:` })
      : L(lang, { en: `Everything about ${u.name}:`, hi: `${u.name} की पूरी जानकारी:`, gu: `${u.name} ની પૂરી માહિતી:`, hn: `${u.name} ki poori details:` });
  return reply(lang, head, { cards: [{ type: "list", items }], suggestions: t.who.self ? sug(lang, "money") : sug(lang, "admin") });
}

// ---------- admin: who spent / earned the most ----------
async function answerTopUsers(lang: Lang, cur: string, period: Period, p: Parsed): Promise<EngineReply> {
  const earners = !!p.hits.income || !!p.incomeCategory;
  const rows = earners ? await T.topEarners(period.start, period.end, 5) : await T.topSpenders(period.start, period.end, 5);
  const pl = periodLabel(lang, period);
  if (!rows.length) return reply(lang, L(lang, { en: `No entries ${pl}.`, hi: `${pl} कोई एंट्री नहीं है।`, gu: `${pl} કોઈ એન્ટ્રી નથી.`, hn: `${cap(pl)} koi entry nahi hai.` }));
  const text = earners
    ? L(lang, { en: `Top earner ${pl}: ${rows[0].name} — ${money(rows[0].total, cur)}.`, hi: `${pl} सबसे ज़्यादा आमदनी: ${rows[0].name} — ${money(rows[0].total, cur)}।`, gu: `${pl} સૌથી વધુ આવક: ${rows[0].name} — ${money(rows[0].total, cur)}.`, hn: `${cap(pl)} sabse zyada income: ${rows[0].name} — ${money(rows[0].total, cur)}.` })
    : L(lang, { en: `Top spender ${pl}: ${rows[0].name} — ${money(rows[0].total, cur)}.`, hi: `${pl} सबसे ज़्यादा खर्च: ${rows[0].name} — ${money(rows[0].total, cur)}।`, gu: `${pl} સૌથી વધુ ખર્ચ: ${rows[0].name} — ${money(rows[0].total, cur)}.`, hn: `${cap(pl)} sabse zyada kharcha: ${rows[0].name} — ${money(rows[0].total, cur)}.` });
  return reply(lang, text, { cards: [{ type: "list", items: rows.map((r, i) => ({ title: `${i + 1}. ${r.name}`, subtitle: r.email, value: money(r.total, cur), tone: earners ? ("pos" as const) : ("neg" as const) })) }], suggestions: sug(lang, "admin") });
}

// ---------- admin: user search ("free users kitne hain", "aaj kitne users ne login kiya", "admin kaun hai") ----------
async function answerUsersQuery(lang: Lang, p: Parsed, today: string): Promise<EngineReply> {
  const tk = ` ${p.tokens.join(" ")} `;
  const f: T.UsersFilter = { sort: "new" };
  const labels: string[] = [];
  if (p.planId) {
    f.plan = p.planId;
    labels.push(getPlan(p.planId).name);
  }
  if (p.hits.adminWord) {
    f.role = "admin";
    labels.push("admin");
  }
  if (/ (disabled|blocked|band|बंद|બંધ) /.test(tk)) {
    f.status = "disabled";
    labels.push("disabled");
  }
  const days30 = new Date(parseYmd(today).getTime() - 29 * 86400000);
  if (/ (inactive|निष्क्रिय) /.test(tk)) {
    f.notLoggedInSince = days30;
    labels.push(L(lang, { en: "inactive (no login in 30 days)", hi: "निष्क्रिय (30 दिन से लॉगिन नहीं)", gu: "નિષ્ક્રિય (30 દિવસથી લૉગિન નહીં)", hn: "inactive (30 din se login nahi)" }));
  } else if (/ (active|login|logged|एक्टिव|લૉગિન|लॉगिन|એક્ટિવ) /.test(tk)) {
    f.loggedInSince = p.period ? p.period.start : days30;
    f.sort = "login";
    labels.push(p.period ? L(lang, { en: `logged in ${periodLabel("en", p.period)}`, hi: `${periodLabel("hi", p.period)} लॉगिन`, gu: `${periodLabel("gu", p.period)} લૉગિન`, hn: `${periodLabel("hn", p.period)} login` }) : L(lang, { en: "active (30 days)", hi: "एक्टिव (30 दिन)", gu: "એક્ટિવ (30 દિવસ)", hn: "active (30 din)" }));
  }
  if (/ (old|oldest|purana|purane|पुराना|पुराने|જૂના|જૂનો) /.test(tk)) f.sort = "old";
  else if (/ (new|newest|latest|naye|naya|नए|નવા) /.test(tk) && p.period) {
    f.createdFrom = p.period.start;
    f.createdTo = p.period.end;
  }
  const r = await T.usersQuery(f, 10);
  const what = labels.length ? labels.join(", ") : L(lang, { en: "all", hi: "सभी", gu: "બધા", hn: "sabhi" });
  const names = r.total > 0 && r.total <= 3 ? `: ${r.items.map((u) => u.name).join(", ")}` : "";
  const text = L(lang, {
    en: `${r.total} user${r.total === 1 ? "" : "s"} (${what})${names}.`,
    hi: `${r.total} यूज़र (${what})${names}।`,
    gu: `${r.total} યુઝર (${what})${names}.`,
    hn: `${r.total} user${r.total === 1 ? "" : "s"} (${what})${names}.`,
  });
  const card: Card = {
    type: "list",
    items: r.items.map((u) => ({
      title: u.name,
      subtitle: `${u.email} · ${u.role === "admin" ? "admin" : getPlan(u.plan).name}${u.status !== "active" ? " · disabled" : ""}`,
      value: f.sort === "login" ? (u.lastLoginAt ? dateLabel(lang, new Date(u.lastLoginAt).toISOString().slice(0, 10)) : "—") : u.createdAt ? dateLabel(lang, new Date(u.createdAt).toISOString().slice(0, 10)) : "",
    })),
  };
  return reply(lang, text, { cards: r.items.length ? [card] : [], suggestions: sug(lang, "admin") });
}


// ======================= reasoning answers (new) =======================
const M3 = (lang: Lang) => L(lang, { en: "/mo", hi: "/महीना", gu: "/મહિનો", hn: "/mahina" });

/** "Why did my spending go up?" — compares like-for-like days, finds the categories and entries behind it. */
async function answerExplain(lang: Lang, t: Target, cur: string, today: string): Promise<EngineReply> {
  const id = String(t.owner._id);
  const now = parseYmd(today);
  const day = now.getUTCDate();
  const curStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const curEnd = new Date(now.getTime() + 86400000);
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevDays = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
  const prevEnd = new Date(prevStart.getTime() + Math.min(day, prevDays) * 86400000); // same number of days → fair
  const [a, b] = await Promise.all([T.periodSums(id, curStart, curEnd), T.periodSums(id, prevStart, prevEnd)]);
  const m = (n: number) => money(Math.round(n), cur);
  if (!a.expenseCount && !b.expenseCount) return answerFlow("expense", lang, t, cur, thisMonth(today), null);
  const diff = a.expense - b.expense;
  const pctCh = b.expense ? Math.round((diff / b.expense) * 1000) / 10 : null;
  const prevMap = new Map(b.expenseByCategory.map((r) => [r.category, r.total]));
  const curMap = new Map(a.expenseByCategory.map((r) => [r.category, r.total]));
  const cats = [...new Set([...curMap.keys(), ...prevMap.keys()])].map((c) => ({ c, d: (curMap.get(c) ?? 0) - (prevMap.get(c) ?? 0) }));
  const ups = cats.filter((x) => x.d > 0).sort((x, y) => y.d - x.d).slice(0, 3);
  const downs = cats.filter((x) => x.d < 0).sort((x, y) => x.d - y.d).slice(0, 2);
  const lines: string[] = [];
  const dir = diff >= 0;
  lines.push(
    L(lang, {
      en: `This month so far (${day} days) you spent ${m(a.expense)} vs ${m(b.expense)} in the same ${day} days last month — ${dir ? "up" : "down"} ${m(Math.abs(diff))}${pctCh !== null ? ` (${dir ? "+" : "−"}${Math.abs(pctCh)}%)` : ""}.`,
      hi: `इस महीने अब तक (${day} दिन) ${m(a.expense)} खर्च हुए, जबकि पिछले महीने के इन्हीं ${day} दिनों में ${m(b.expense)} — यानी ${m(Math.abs(diff))} ${dir ? "ज़्यादा" : "कम"}${pctCh !== null ? ` (${dir ? "+" : "−"}${Math.abs(pctCh)}%)` : ""}।`,
      gu: `આ મહિને અત્યાર સુધી (${day} દિવસ) ${m(a.expense)} ખર્ચ થયો, જ્યારે ગયા મહિનાના આ જ ${day} દિવસમાં ${m(b.expense)} — એટલે ${m(Math.abs(diff))} ${dir ? "વધુ" : "ઓછો"}${pctCh !== null ? ` (${dir ? "+" : "−"}${Math.abs(pctCh)}%)` : ""}.`,
      hn: `Is mahine ab tak (${day} din) ${m(a.expense)} kharch hue, jabki pichle mahine ke inhi ${day} dino mein ${m(b.expense)} — yaani ${m(Math.abs(diff))} ${dir ? "zyada" : "kam"}${pctCh !== null ? ` (${dir ? "+" : "−"}${Math.abs(pctCh)}%)` : ""}.`,
    }),
  );
  const cards: Card[] = [];
  if (ups.length) {
    lines.push(L(lang, { en: "What pushed it up:", hi: "किस वजह से बढ़ा:", gu: "શેના કારણે વધ્યો:", hn: "Kis wajah se badha:" }));
    const items: { title: string; subtitle?: string; value?: string; tone?: "pos" | "neg" | "neutral" }[] = [];
    for (const u of ups) {
      const tops = await T.topTransactions(id, curStart, curEnd, u.c, 2);
      const eg = tops.map((x) => `${x.title} ${m(x.amount)}`).join(", ");
      lines.push(`• ${catLabel(lang, u.c)} +${m(u.d)}${eg ? ` — ${eg}` : ""}`);
      items.push({ title: catLabel(lang, u.c), subtitle: eg || undefined, value: `+${m(u.d)}`, tone: "neg" });
    }
    cards.push({ type: "list", title: L(lang, { en: "Biggest increases", hi: "सबसे बड़ी बढ़त", gu: "સૌથી મોટો વધારો", hn: "Sabse bada badhav" }), items });
  }
  if (downs.length) lines.push(L(lang, { en: `You spent less on ${downs.map((d) => `${catLabel(lang, d.c)} (−${m(-d.d)})`).join(", ")}.`, hi: `${downs.map((d) => `${catLabel(lang, d.c)} (−${m(-d.d)})`).join(", ")} पर कम खर्च हुआ।`, gu: `${downs.map((d) => `${catLabel(lang, d.c)} (−${m(-d.d)})`).join(", ")} પર ઓછો ખર્ચ થયો.`, hn: `${downs.map((d) => `${catLabel(lang, d.c)} (−${m(-d.d)})`).join(", ")} pe kam kharcha hua.` }));
  if (dir && ups[0]) {
    lines.push(L(lang, {
      en: `💡 Setting a ${catLabel(lang, ups[0].c)} budget would stop this repeating — say “${ups[0].c} budget ${Math.round((prevMap.get(ups[0].c) ?? curMap.get(ups[0].c) ?? 0) * 1.1 / 100) * 100 || 1000}”.`,
      hi: `💡 ${catLabel(lang, ups[0].c)} का बजट रखने से ये दोबारा नहीं होगा — बोलिए “${ups[0].c} budget ${Math.round((prevMap.get(ups[0].c) ?? curMap.get(ups[0].c) ?? 0) * 1.1 / 100) * 100 || 1000}”।`,
      gu: `💡 ${catLabel(lang, ups[0].c)} નું બજેટ રાખવાથી આ ફરી નહીં થાય — કહો “${ups[0].c} budget ${Math.round((prevMap.get(ups[0].c) ?? curMap.get(ups[0].c) ?? 0) * 1.1 / 100) * 100 || 1000}”.`,
      hn: `💡 ${catLabel(lang, ups[0].c)} ka budget rakhne se ye dobara nahi hoga — boliye “${ups[0].c} budget ${Math.round((prevMap.get(ups[0].c) ?? curMap.get(ups[0].c) ?? 0) * 1.1 / 100) * 100 || 1000}”.`,
    }));
  }
  return reply(lang, lines.join("\n"), { speak: lines.slice(0, 3).join(" "), cards, suggestions: sug(lang, "advice", "money") });
}

/** Budget status (all, or one category) — with what you can still spend per day. */
async function answerBudgets(lang: Lang, t: Target, cur: string, category: string | null): Promise<EngineReply> {
  const r = await budgetReport(String(t.owner._id));
  const m = (n: number) => money(n, cur);
  const all = [...(r.total ? [r.total] : []), ...r.items];
  const label = (c: string) => (c === TOTAL ? L(lang, { en: "Whole month", hi: "पूरा महीना", gu: "આખો મહિનો", hn: "Poora mahina" }) : catLabel(lang, c));
  if (!all.length) {
    const sg = r.suggestions.slice(0, 3);
    const text = L(lang, {
      en: `No budgets set yet.${sg.length ? ` Based on your last 3 months I'd suggest: ${sg.map((x) => `${catLabel(lang, x.category)} ${m(x.suggested)}`).join(", ")}.` : ""} Say for example “food budget 5000” and I'll track it and warn you at 80% and 100%.`,
      hi: `अभी कोई बजट नहीं है।${sg.length ? ` पिछले 3 महीनों के हिसाब से मेरा सुझाव: ${sg.map((x) => `${catLabel(lang, x.category)} ${m(x.suggested)}`).join(", ")}।` : ""} जैसे बोलिए “खाने का बजट 5000” — मैं ट्रैक करूंगी और 80% व 100% पर बताऊंगी।`,
      gu: `હજી કોઈ બજેટ નથી.${sg.length ? ` છેલ્લા 3 મહિનાના આધારે મારું સૂચન: ${sg.map((x) => `${catLabel(lang, x.category)} ${m(x.suggested)}`).join(", ")}.` : ""} જેમ કે કહો “ખાવાનું બજેટ 5000” — હું ટ્રેક કરીશ અને 80% અને 100% પર જણાવીશ.`,
      hn: `Abhi koi budget nahi hai.${sg.length ? ` Pichle 3 mahine ke hisaab se mera suggestion: ${sg.map((x) => `${catLabel(lang, x.category)} ${m(x.suggested)}`).join(", ")}.` : ""} Jaise boliye “food budget 5000” — main track karungi aur 80% aur 100% pe bataungi.`,
    });
    return reply(lang, text, { suggestions: sg.length ? [`${sg[0].category} budget ${sg[0].suggested}`, ...sug(lang, "money")].slice(0, 3) : sug(lang, "money") });
  }
  const focus = category ? all.find((x) => x.category === category) : null;
  if (category && !focus) {
    return reply(lang, L(lang, { en: `There's no budget for ${catLabel(lang, category)} yet. Say “${category} budget 5000” to set one.`, hi: `${catLabel(lang, category)} का अभी कोई बजट नहीं है। सेट करने के लिए बोलिए “${category} budget 5000”।`, gu: `${catLabel(lang, category)} નું હજી કોઈ બજેટ નથી. સેટ કરવા કહો “${category} budget 5000”.`, hn: `${catLabel(lang, category)} ka abhi koi budget nahi hai. Set karne ke liye boliye “${category} budget 5000”.` }));
  }
  const one = (x: (typeof all)[number]) =>
    x.status === "over"
      ? L(lang, { en: `${label(x.category)}: over by ${m(-x.remaining)} (${m(x.spent)} of ${m(x.limit)}).`, hi: `${label(x.category)}: ${m(-x.remaining)} से पार (${m(x.limit)} में से ${m(x.spent)})।`, gu: `${label(x.category)}: ${m(-x.remaining)} થી પાર (${m(x.limit)} માંથી ${m(x.spent)}).`, hn: `${label(x.category)}: ${m(-x.remaining)} se cross (${m(x.limit)} mein se ${m(x.spent)}).` })
      : L(lang, { en: `${label(x.category)}: ${m(x.remaining)} left of ${m(x.limit)} (${x.pct}% used) — about ${m(x.perDay)}/day for ${r.daysLeft} days.${x.projectedOver ? ` ⚠️ At this pace you'll reach ${m(x.projected)}.` : ""}`, hi: `${label(x.category)}: ${m(x.limit)} में से ${m(x.remaining)} बचे (${x.pct}% इस्तेमाल) — ${r.daysLeft} दिन के लिए लगभग ${m(x.perDay)}/दिन।${x.projectedOver ? ` ⚠️ इसी रफ़्तार से ${m(x.projected)} हो जाएगा।` : ""}`, gu: `${label(x.category)}: ${m(x.limit)} માંથી ${m(x.remaining)} બાકી (${x.pct}% વપરાયું) — ${r.daysLeft} દિવસ માટે આશરે ${m(x.perDay)}/દિવસ.${x.projectedOver ? ` ⚠️ આ ઝડપે ${m(x.projected)} થઈ જશે.` : ""}`, hn: `${label(x.category)}: ${m(x.limit)} mein se ${m(x.remaining)} bache (${x.pct}% use) — ${r.daysLeft} din ke liye lagbhag ${m(x.perDay)}/din.${x.projectedOver ? ` ⚠️ Isi raftaar se ${m(x.projected)} ho jayega.` : ""}` });
  if (focus) return reply(lang, one(focus), { suggestions: sug(lang, "money") });
  const over = all.filter((x) => x.status === "over").length;
  const warn = all.filter((x) => x.status === "warn").length;
  const head = L(lang, {
    en: over ? `${over} budget${over > 1 ? "s are" : " is"} over the limit${warn ? `, ${warn} close to it` : ""}.` : warn ? `All within limits, but ${warn} ${warn > 1 ? "are" : "is"} close.` : "All budgets are within limits 👍",
    hi: over ? `${over} बजट लिमिट से पार हैं${warn ? `, ${warn} लिमिट के करीब` : ""}।` : warn ? `सब लिमिट में हैं, पर ${warn} करीब हैं।` : "सारे बजट लिमिट के अंदर हैं 👍",
    gu: over ? `${over} બજેટ લિમિટથી પાર છે${warn ? `, ${warn} લિમિટની નજીક` : ""}.` : warn ? `બધા લિમિટમાં છે, પણ ${warn} નજીક છે.` : "બધાં બજેટ લિમિટની અંદર છે 👍",
    hn: over ? `${over} budget limit se cross hain${warn ? `, ${warn} limit ke kareeb` : ""}.` : warn ? `Sab limit mein hain, par ${warn} kareeb hain.` : "Saare budgets limit ke andar hain 👍",
  });
  const card: Card = { type: "bars", title: L(lang, { en: "Budget used", hi: "बजट इस्तेमाल", gu: "બજેટ વપરાશ", hn: "Budget used" }), items: all.slice(0, 8).map((x) => ({ label: label(x.category), value: Math.min(100, x.pct), display: `${m(x.spent)} / ${m(x.limit)}` })) };
  return reply(lang, [head, ...all.slice(0, 4).map(one)].join("\n"), { speak: head, cards: [card], suggestions: sug(lang, "money") });
}

/** 50/30/20 for the current month (or last month when this month has no income yet). */
async function answer503020(lang: Lang, t: Target, cur: string, today: string): Promise<EngineReply> {
  const id = String(t.owner._id);
  let p = thisMonth(today);
  let s = await T.periodSums(id, p.start, p.end);
  if (!s.income) {
    p = { kind: "lastMonth", start: new Date(Date.UTC(p.start.getUTCFullYear(), p.start.getUTCMonth() - 1, 1)), end: p.start };
    s = await T.periodSums(id, p.start, p.end);
  }
  const m = (n: number) => money(Math.round(n), cur);
  if (!s.income) return reply(lang, L(lang, KB.rule503020.answer) + "\n" + L(lang, { en: "Add your income and I'll show your own split.", hi: "अपनी आमदनी जोड़िए, फिर मैं आपका हिसाब दिखाऊंगी।", gu: "તમારી આવક ઉમેરો, પછી હું તમારો હિસાબ બતાવીશ.", hn: "Apni income add kijiye, phir main aapka split dikhaungi." }));
  const nw = needsWantsOf(s.expenseByCategory);
  const saved = s.income - nw.needs - nw.wants;
  const pc = (x: number) => Math.round((x / s.income) * 1000) / 10;
  const pl = periodLabel(lang, p);
  const tips: string[] = [];
  if (pc(nw.wants) > 30) tips.push(L(lang, { en: `Wants are above 30% — trimming them to 30% frees ${m(nw.wants - s.income * 0.3)}.`, hi: `शौक 30% से ऊपर हैं — 30% तक लाने से ${m(nw.wants - s.income * 0.3)} बचेंगे।`, gu: `શોખ 30% થી ઉપર છે — 30% સુધી લાવવાથી ${m(nw.wants - s.income * 0.3)} બચશે.`, hn: `Shauk 30% se upar hain — 30% tak laane se ${m(nw.wants - s.income * 0.3)} bachenge.` }));
  if (pc(nw.needs) > 50) tips.push(L(lang, { en: "Needs are above 50% — usually rent/EMIs; avoid new EMIs and review bills.", hi: "ज़रूरतें 50% से ऊपर हैं — अक्सर किराया/EMI; नई EMI से बचें और बिल जांचें।", gu: "જરૂરિયાતો 50% થી ઉપર છે — મોટાભાગે ભાડું/EMI; નવી EMI ટાળો અને બિલ તપાસો.", hn: "Zaroorat 50% se upar hai — aksar rent/EMI; nayi EMI se bachiye aur bills check kijiye." }));
  if (pc(saved) >= 20) tips.push(L(lang, { en: "Savings at or above 20% — excellent 👏", hi: "बचत 20% या ज़्यादा — बहुत बढ़िया 👏", gu: "બચત 20% કે વધુ — ખૂબ સરસ 👏", hn: "Bachat 20% ya zyada — bahut badhiya 👏" }));
  const text = [
    L(lang, { en: `${cap(pl)} (income ${m(s.income)}):`, hi: `${pl} (आमदनी ${m(s.income)}):`, gu: `${pl} (આવક ${m(s.income)}):`, hn: `${cap(pl)} (income ${m(s.income)}):` }),
    `• ${L(lang, { en: "Needs", hi: "ज़रूरतें", gu: "જરૂરિયાત", hn: "Zaroorat" })}: ${m(nw.needs)} (${pc(nw.needs)}% · ideal 50%)`,
    `• ${L(lang, { en: "Wants", hi: "शौक", gu: "શોખ", hn: "Shauk" })}: ${m(nw.wants)} (${pc(nw.wants)}% · ideal 30%)`,
    `• ${L(lang, { en: "Savings & investments", hi: "बचत व निवेश", gu: "બચત અને રોકાણ", hn: "Bachat & investment" })}: ${signedMoney(Math.round(saved), cur)} (${pc(saved)}% · ideal 20%)`,
    ...tips,
  ].join("\n");
  const card: Card = { type: "bars", items: [
    { label: L(lang, { en: "Needs", hi: "ज़रूरतें", gu: "જરૂરિયાત", hn: "Zaroorat" }), value: Math.max(0, pc(nw.needs)), display: `${pc(nw.needs)}%` },
    { label: L(lang, { en: "Wants", hi: "शौक", gu: "શોખ", hn: "Shauk" }), value: Math.max(0, pc(nw.wants)), display: `${pc(nw.wants)}%` },
    { label: L(lang, { en: "Savings", hi: "बचत", gu: "બચત", hn: "Bachat" }), value: Math.max(0, pc(saved)), display: `${pc(saved)}%` },
  ] };
  return reply(lang, text, { cards: [card], suggestions: sug(lang, "advice") });
}

async function answerEmergency(lang: Lang, t: Target, cur: string, today: string): Promise<EngineReply> {
  const st = await T.advisorStats(String(t.owner._id), today);
  const m = (n: number) => money(Math.round(n), cur);
  const base = L(lang, { en: "An emergency fund covers 3–6 months of essential spending (6+ if your income is irregular or you support family). Keep it safe and quick to access — a savings account, sweep FD or liquid fund — not in stocks.", hi: "इमरजेंसी फंड में 3–6 महीने का ज़रूरी खर्च होना चाहिए (आमदनी अनियमित हो या परिवार निर्भर हो तो 6+)। इसे सुरक्षित और तुरंत मिलने वाली जगह रखें — सेविंग्स खाता, स्वीप FD या लिक्विड फंड — शेयर में नहीं।", gu: "ઇમરજન્સી ફંડમાં 3–6 મહિનાનો જરૂરી ખર્ચ હોવો જોઈએ (આવક અનિયમિત હોય કે પરિવાર નિર્ભર હોય તો 6+). તેને સુરક્ષિત અને તરત મળે એવી જગ્યાએ રાખો — સેવિંગ્સ ખાતું, સ્વીપ FD કે લિક્વિડ ફંડ — શેરમાં નહીં.", hn: "Emergency fund mein 3–6 mahine ka zaroori kharcha hona chahiye (income irregular ho ya family nirbhar ho to 6+). Ise safe aur turant milne wali jagah rakhiye — savings account, sweep FD ya liquid fund — shares mein nahi." });
  if (!st.avgExpense) return reply(lang, base, { suggestions: sug(lang, "advice") });
  const months = Math.max(0, st.balance) / st.avgExpense;
  const lo = st.avgExpense * 3;
  const hi = st.avgExpense * 6;
  const gap = Math.max(0, lo - st.balance);
  const mine = L(lang, {
    en: `For you: average spending is ${m(st.avgExpense)}/month, so the target is ${m(lo)}–${m(hi)}. Your balance ${m(st.balance)} covers about ${Math.round(months * 10) / 10} months.${gap > 0 ? ` You need ${m(gap)} more for the 3-month minimum${st.avgIncome > st.avgExpense ? ` — about ${Math.ceil(gap / (st.avgIncome - st.avgExpense))} months at your current surplus` : ""}.` : " ✅ You already have the 3-month minimum."}`,
    hi: `आपके लिए: औसत खर्च ${m(st.avgExpense)}/महीना है, तो लक्ष्य ${m(lo)}–${m(hi)} है। आपका बैलेंस ${m(st.balance)} लगभग ${Math.round(months * 10) / 10} महीने चला सकता है।${gap > 0 ? ` 3 महीने के न्यूनतम के लिए ${m(gap)} और चाहिए${st.avgIncome > st.avgExpense ? ` — मौजूदा बचत से लगभग ${Math.ceil(gap / (st.avgIncome - st.avgExpense))} महीने` : ""}।` : " ✅ 3 महीने का न्यूनतम फंड पहले से है।"}`,
    gu: `તમારા માટે: સરેરાશ ખર્ચ ${m(st.avgExpense)}/મહિનો છે, એટલે લક્ષ્ય ${m(lo)}–${m(hi)} છે. તમારું બેલેન્સ ${m(st.balance)} આશરે ${Math.round(months * 10) / 10} મહિના ચલાવી શકે.${gap > 0 ? ` 3 મહિનાના લઘુત્તમ માટે ${m(gap)} વધુ જોઈએ${st.avgIncome > st.avgExpense ? ` — હાલની બચતથી આશરે ${Math.ceil(gap / (st.avgIncome - st.avgExpense))} મહિના` : ""}.` : " ✅ 3 મહિનાનું લઘુત્તમ ફંડ પહેલેથી છે."}`,
    hn: `Aapke liye: average kharcha ${m(st.avgExpense)}/mahina hai, to target ${m(lo)}–${m(hi)} hai. Aapka balance ${m(st.balance)} lagbhag ${Math.round(months * 10) / 10} mahine chala sakta hai.${gap > 0 ? ` 3 mahine ke minimum ke liye ${m(gap)} aur chahiye${st.avgIncome > st.avgExpense ? ` — current bachat se lagbhag ${Math.ceil(gap / (st.avgIncome - st.avgExpense))} mahine` : ""}.` : " ✅ 3 mahine ka minimum fund pehle se hai."}`,
  });
  const action = gap > 0 && t.scope === "self" ? L(lang, { en: "Create an emergency fund goal", hi: "इमरजेंसी फंड गोल बनाओ", gu: "ઇમરજન્સી ફંડ ગોલ બનાવો", hn: "Emergency fund goal banao" }) : null;
  return reply(lang, `${base}\n${mine}`, { speak: mine, suggestions: [...(action ? [`${action} ${Math.round(lo / 1000) * 1000}`] : []), ...sug(lang, "advice")].slice(0, 3) });
}

async function answerSubscriptions(lang: Lang, t: Target, cur: string): Promise<EngineReply> {
  const rows = await T.recurringList(String(t.owner._id));
  const m = (n: number) => money(n, cur);
  if (!rows.length) return reply(lang, L(lang, { en: "I don't see any repeating payments yet. When you add rent, bills or subscriptions, choose “Monthly” (and tick Auto-repeat to have them added automatically).", hi: "अभी कोई बार-बार होने वाला भुगतान नहीं दिखा। किराया, बिल या सब्सक्रिप्शन जोड़ते समय “Monthly” चुनिए (और Auto-repeat चुनें ताकि अपने-आप जुड़ें)।", gu: "હજી કોઈ વારંવાર થતી ચુકવણી દેખાતી નથી. ભાડું, બિલ કે સબ્સ્ક્રિપ્શન ઉમેરતી વખતે “Monthly” પસંદ કરો (અને Auto-repeat પસંદ કરો જેથી આપમેળે ઉમેરાય).", hn: "Abhi koi baar-baar hone wala payment nahi dikha. Rent, bills ya subscriptions add karte waqt “Monthly” chuniye (aur Auto-repeat chuniye taaki apne-aap judein)." }));
  const monthly = rows.reduce((s, r) => s + (r.recurring === "weekly" ? r.amount * 4.33 : r.recurring === "yearly" ? r.amount / 12 : r.amount), 0);
  const text = L(lang, {
    en: `${rows.length} repeating payments ≈ ${m(Math.round(monthly))}/month (${m(Math.round(monthly * 12))} a year). Anything you no longer use is an easy saving.`,
    hi: `${rows.length} बार-बार होने वाले भुगतान ≈ ${m(Math.round(monthly))}/महीना (${m(Math.round(monthly * 12))} सालाना)। जो अब इस्तेमाल नहीं होता, उसे बंद करना आसान बचत है।`,
    gu: `${rows.length} વારંવાર થતી ચુકવણી ≈ ${m(Math.round(monthly))}/મહિનો (${m(Math.round(monthly * 12))} વાર્ષિક). જે હવે વપરાતું નથી તે બંધ કરવું સરળ બચત છે.`,
    hn: `${rows.length} baar-baar hone wale payments ≈ ${m(Math.round(monthly))}/mahina (${m(Math.round(monthly * 12))} saalana). Jo ab use nahi hota, use band karna aasaan bachat hai.`,
  });
  return reply(lang, text, { cards: [{ type: "list", items: rows.slice(0, 8).map((r) => ({ title: r.title, subtitle: `${catLabel(lang, r.category)} · ${r.recurring}${r.auto ? " · auto" : ""}`, value: m(r.amount), tone: "neg" as const })) }], suggestions: sug(lang, "money") });
}

/** General money knowledge + a personal touch where we have the numbers. */
async function answerKb(lang: Lang, topic: string, t: Target, cur: string, today: string): Promise<EngineReply> {
  const e = KB[topic];
  if (!e) return reply(lang, L(lang, HELP));
  const lines = [L(lang, e.answer)];
  const id = String(t.owner._id);
  const m = (n: number) => money(Math.round(n), cur);
  try {
    if (topic === "debt_strategy") {
      const debts = (await T.debtsOf(id)).filter((d) => d.status === "active");
      if (debts.length >= 2) {
        const av = [...debts].sort((a, b) => b.interestRate - a.interestRate)[0];
        const sb = [...debts].sort((a, b) => a.remaining - b.remaining)[0];
        lines.push(L(lang, { en: `For your loans: avalanche → “${av.title}” first (${av.interestRate}%); snowball → “${sb.title}” first (${m(sb.remaining)} left).`, hi: `आपके लोन के लिए: avalanche → पहले “${av.title}” (${av.interestRate}%); snowball → पहले “${sb.title}” (${m(sb.remaining)} बाकी)।`, gu: `તમારી લોન માટે: avalanche → પહેલાં “${av.title}” (${av.interestRate}%); snowball → પહેલાં “${sb.title}” (${m(sb.remaining)} બાકી).`, hn: `Aapke loans ke liye: avalanche → pehle “${av.title}” (${av.interestRate}%); snowball → pehle “${sb.title}” (${m(sb.remaining)} baaki).` }));
      }
    } else if (topic === "sip" || topic === "fd_vs_sip" || topic === "retirement") {
      const st = await T.advisorStats(id, today);
      const surplus = st.avgIncome - st.avgExpense;
      if (surplus > 0) lines.push(L(lang, { en: `Your average monthly surplus is about ${m(surplus)} — after your emergency fund is in place, part of that could go into long-term investing.`, hi: `आपकी औसत मासिक बचत लगभग ${m(surplus)} है — इमरजेंसी फंड बनने के बाद इसका कुछ हिस्सा लंबे निवेश में जा सकता है।`, gu: `તમારી સરેરાશ માસિક બચત આશરે ${m(surplus)} છે — ઇમરજન્સી ફંડ બન્યા પછી તેનો થોડો ભાગ લાંબા રોકાણમાં જઈ શકે.`, hn: `Aapki average monthly bachat lagbhag ${m(surplus)} hai — emergency fund banne ke baad iska kuch hissa long-term investment mein ja sakta hai.` }));
    } else if (topic === "budgeting") {
      const n = await Budget.countDocuments({ userId: t.owner._id });
      if (n) lines.push(L(lang, { en: `You already have ${n} budget${n > 1 ? "s" : ""} — ask “budget status” anytime.`, hi: `आपके ${n} बजट पहले से हैं — कभी भी पूछिए “बजट स्टेटस”।`, gu: `તમારાં ${n} બજેટ પહેલેથી છે — ક્યારેય પણ પૂછો “બજેટ સ્ટેટસ”.`, hn: `Aapke ${n} budget pehle se hain — kabhi bhi poochiye “budget status”.` }));
    }
  } catch {
    /* personal extras are best-effort */
  }
  return reply(lang, lines.join("\n"), { speak: lines[0].split(/(?<=[.।])\s/).slice(0, 2).join(" "), suggestions: e.next.map((x) => L(lang, x)).slice(0, 3) });
}

async function answerVisitors(lang: Lang, period: Period | null, today: string): Promise<EngineReply> {
  const start = period?.start ?? parseYmd(today);
  const v = await T.visitorsSummary(start);
  const pl = period ? periodLabel(lang, period) : L(lang, { en: "today", hi: "आज", gu: "આજે", hn: "aaj" });
  const places = v.places.map((p) => `${p.place} (${p.n})`).join(", ");
  const text = L(lang, {
    en: `${v.online} visitor${v.online === 1 ? "" : "s"} online right now. ${cap(pl)}: ${v.visitors} unique visitors, ${v.views} page views, ${v.signedIn} signed-in users.${places ? `\nTop places: ${places}.` : ""}\n(Locations are approximate, from the visitor's IP.)`,
    hi: `अभी ${v.online} विज़िटर ऑनलाइन हैं। ${pl}: ${v.visitors} अलग विज़िटर, ${v.views} पेज व्यू, ${v.signedIn} लॉगिन यूज़र।${places ? `\nसबसे ज़्यादा: ${places}।` : ""}\n(लोकेशन लगभग है, IP से।)`,
    gu: `હમણાં ${v.online} વિઝિટર ઓનલાઇન છે. ${pl}: ${v.visitors} અલગ વિઝિટર, ${v.views} પેજ વ્યૂ, ${v.signedIn} લૉગિન યુઝર.${places ? `\nસૌથી વધુ: ${places}.` : ""}\n(લોકેશન આશરે છે, IP પરથી.)`,
    hn: `Abhi ${v.online} visitors online hain. ${cap(pl)}: ${v.visitors} unique visitors, ${v.views} page views, ${v.signedIn} logged-in users.${places ? `\nTop places: ${places}.` : ""}\n(Location approximate hai, IP se.)`,
  });
  const card: Card = { type: "list", title: L(lang, { en: "Latest visits", hi: "हाल के विज़िट", gu: "તાજેતરની મુલાકાતો", hn: "Latest visits" }), items: v.recent.map((r) => ({ title: r.place, subtitle: `${r.path} · ${r.device}`, value: dateLabel(lang, new Date(r.at).toISOString().slice(0, 10)) })) };
  return reply(lang, text, { speak: text.split("\n")[0], cards: v.recent.length ? [card] : [], suggestions: sug(lang, "admin") });
}

/** A short "thinking" line added after plain number answers: compares with the usual and with budgets. */
async function thinkAbout(lang: Lang, intent: Intent, t: Target, cur: string, period: Period, category: string | null, today: string): Promise<string | null> {
  if (t.scope === "platform") return null;
  const id = String(t.owner._id);
  const m = (n: number) => money(Math.round(n), cur);
  try {
    if (intent === "expense" && (period.kind === "month" || period.kind === "namedMonth")) {
      const isCurrent = period.kind === "month";
      const st = await T.advisorStats(id, today);
      const avg = category ? st.categoryAvg.find((c) => c.category === category)?.avg ?? 0 : st.avgExpense;
      if (!avg || st.months < 2) return null;
      const s = await T.periodSums(id, period.start, period.end, category);
      const day = parseYmd(today).getUTCDate();
      const dim = new Date(period.end.getTime() - 86400000).getUTCDate();
      const proj = isCurrent && day < dim ? (s.expense / Math.max(1, day)) * dim : s.expense;
      const ch = Math.round(((proj - avg) / avg) * 100);
      if (Math.abs(ch) < 10) return L(lang, { en: `💡 That's in line with your usual ${m(avg)}${M3(lang)}.`, hi: `💡 ये आपके सामान्य ${m(avg)}${M3(lang)} के बराबर है।`, gu: `💡 આ તમારા સામાન્ય ${m(avg)}${M3(lang)} જેટલું જ છે.`, hn: `💡 Ye aapke normal ${m(avg)}${M3(lang)} ke barabar hai.` });
      return ch > 0
        ? L(lang, { en: `💡 ${isCurrent ? `At this pace the month ends near ${m(proj)} — ` : ""}${ch}% above your usual ${m(avg)}${M3(lang)}. Ask “why did my spending go up?” to see what changed.`, hi: `💡 ${isCurrent ? `इसी रफ़्तार से महीना लगभग ${m(proj)} पर खत्म होगा — ` : ""}आपके सामान्य ${m(avg)}${M3(lang)} से ${ch}% ज़्यादा। “खर्च क्यों बढ़ा?” पूछिए, मैं वजह बताऊंगी।`, gu: `💡 ${isCurrent ? `આ ઝડપે મહિનો આશરે ${m(proj)} પર પૂરો થશે — ` : ""}તમારા સામાન્ય ${m(avg)}${M3(lang)} કરતાં ${ch}% વધુ. “ખર્ચ કેમ વધ્યો?” પૂછો, હું કારણ બતાવીશ.`, hn: `💡 ${isCurrent ? `Isi raftaar se mahina lagbhag ${m(proj)} pe khatam hoga — ` : ""}aapke normal ${m(avg)}${M3(lang)} se ${ch}% zyada. “Kharcha kyu badha?” poochiye, main wajah bataungi.` })
        : L(lang, { en: `💡 ${Math.abs(ch)}% below your usual ${m(avg)}${M3(lang)} — well done.`, hi: `💡 आपके सामान्य ${m(avg)}${M3(lang)} से ${Math.abs(ch)}% कम — बढ़िया।`, gu: `💡 તમારા સામાન્ય ${m(avg)}${M3(lang)} કરતાં ${Math.abs(ch)}% ઓછું — સરસ.`, hn: `💡 Aapke normal ${m(avg)}${M3(lang)} se ${Math.abs(ch)}% kam — badhiya.` });
    }
    if (intent === "balance") {
      const goals = await T.goalsOf(id, false);
      const set = goals.filter((g) => g.status !== "cancelled").reduce((x, g) => x + g.current, 0);
      if (set > 0) {
        const life = await T.lifetime(id);
        return L(lang, { en: `💡 ${m(set)} of this is set aside in goals, so ${signedMoney(life.balance - set, cur)} is free to spend.`, hi: `💡 इसमें से ${m(set)} गोल में अलग रखे हैं, यानी खर्च के लिए ${signedMoney(life.balance - set, cur)} खाली हैं।`, gu: `💡 આમાંથી ${m(set)} ગોલમાં અલગ રાખ્યા છે, એટલે ખર્ચ માટે ${signedMoney(life.balance - set, cur)} ખાલી છે.`, hn: `💡 Isme se ${m(set)} goals mein alag rakhe hain, yaani kharch ke liye ${signedMoney(life.balance - set, cur)} free hain.` });
      }
    }
    if (intent === "income" && (period.kind === "month" || period.kind === "lastMonth" || period.kind === "namedMonth")) {
      const prevStart = new Date(Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth() - 1, 1));
      const [a, b] = await Promise.all([T.periodSums(id, period.start, period.end), T.periodSums(id, prevStart, period.start)]);
      if (a.income && b.income) {
        const ch = Math.round(((a.income - b.income) / b.income) * 100);
        if (Math.abs(ch) >= 5) return L(lang, { en: `💡 ${ch > 0 ? "Up" : "Down"} ${Math.abs(ch)}% from the month before (${m(b.income)}).`, hi: `💡 पिछले महीने (${m(b.income)}) से ${Math.abs(ch)}% ${ch > 0 ? "ज़्यादा" : "कम"}।`, gu: `💡 ગયા મહિના (${m(b.income)}) કરતાં ${Math.abs(ch)}% ${ch > 0 ? "વધુ" : "ઓછી"}.`, hn: `💡 Pichle mahine (${m(b.income)}) se ${Math.abs(ch)}% ${ch > 0 ? "zyada" : "kam"}.` });
      }
    }
    if (intent === "savings") {
      const st = await T.advisorStats(id, today);
      if (st.avgIncome > 0) {
        const rate = Math.round(((st.avgIncome - st.avgExpense) / st.avgIncome) * 100);
        return L(lang, { en: `💡 Your 3-month average savings rate is ${rate}%${rate < 20 ? " — 20% is a healthy target." : " — above the 20% benchmark 👏"}`, hi: `💡 पिछले 3 महीनों की औसत बचत दर ${rate}% है${rate < 20 ? " — 20% अच्छा लक्ष्य है।" : " — 20% से ऊपर 👏"}`, gu: `💡 છેલ્લા 3 મહિનાનો સરેરાશ બચત દર ${rate}% છે${rate < 20 ? " — 20% સારું લક્ષ્ય છે." : " — 20% થી ઉપર 👏"}`, hn: `💡 Pichle 3 mahine ka average savings rate ${rate}% hai${rate < 20 ? " — 20% achha target hai." : " — 20% se upar 👏"}` });
      }
    }
  } catch {
    return null;
  }
  return null;
}

// ======================= actions =======================
type Actor = { user: UserDoc; ip: string };

function canWrite(perms: Permission[], t: Target, resource: "income" | "expense" | "debt" | "goal", action: "create" | "update" | "delete"): boolean {
  if (t.scope === "user") return perms.includes("users.finance.manage");
  return requiredPerms(resource, action).every((p) => perms.includes(p));
}

function nameFromWords(words: string[], fallback: string): string {
  const w = words.filter((x) => !/^(goal|loan|emi|गोल|लोन|ગોલ|લોન)$/.test(x)).slice(0, 4).join(" ").trim();
  return w ? titleCase(w).slice(0, 120) : fallback;
}

/** Items whose name best matches the spoken words ("personal loan" → Personal loan, not Home loan). */
function matchByName<X extends { id: string }>(items: X[], label: (x: X) => string, words: string[]): X[] {
  const keys = words.map((w) => phonetic(w.toLowerCase())).filter((k) => k.length >= 3);
  const scored = items.map((it) => {
    const parts = label(it).toLowerCase().split(/[\s()·,]+/).map(phonetic);
    const score = keys.filter((k) => parts.some((p) => p === k || (p.length >= 4 && k.length >= 4 && (p.startsWith(k) || k.startsWith(p))))).length;
    return { it, score };
  });
  const best = Math.max(0, ...scored.map((x) => x.score));
  return best ? scored.filter((x) => x.score === best).map((x) => x.it) : [];
}

async function categoryMonthTotal(ownerId: string, category: string, today: string) {
  const p = thisMonth(today);
  const s = await T.periodSums(ownerId, p.start, p.end, category);
  return s.expense;
}

/** Runs an action for real. Throws ApiError on validation / plan-limit problems. */
async function execute(kind: ActionKind, payload: Record<string, unknown>, owner: UserDoc, actor: Actor, perms: Permission[]): Promise<{ summary: string; undo?: Record<string, unknown>; canUndo: boolean; ephemeral?: Card[] }> {
  switch (kind) {
    case "add_expense":
    case "add_income": {
      const resource = kind === "add_expense" ? "expense" : "income";
      const rec = await createRecord(actor, owner, resource, payload);
      return { summary: String(payload.title), undo: { resource, id: rec.id }, canUndo: true };
    }
    case "create_goal":
    case "create_debt": {
      const resource = kind === "create_goal" ? "goal" : "debt";
      const rec = await createRecord(actor, owner, resource, payload);
      return { summary: String(payload.name ?? payload.title), undo: { resource, id: rec.id }, canUndo: true };
    }
    case "goal_contribute": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const before: any = await Goal.findOne({ _id: oid(String(payload.goalId)), userId: owner._id }).lean();
      const minor = toMinor(payload.amount);
      if (!before || minor === null) throw new ApiError(404, "Goal not found.");
      await contributeGoal(actor, owner, String(payload.goalId), minor, { source: "angel", note: "Added by Angel AI" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const led: any = await GoalContribution.findOne({ goalId: before._id, source: "angel" }).sort({ createdAt: -1 }).select("_id").lean();
      return { summary: String(payload.goalName), undo: { goalId: String(payload.goalId), minor, prevStatus: before.status, ledgerId: led ? String(led._id) : null }, canUndo: true };
    }
    case "goal_withdraw": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const before: any = await Goal.findOne({ _id: oid(String(payload.goalId)), userId: owner._id }).lean();
      const minor = toMinor(payload.amount);
      if (!before || minor === null) throw new ApiError(404, "Goal not found.");
      await contributeGoal(actor, owner, String(payload.goalId), minor, { withdraw: true, source: "angel", note: "Withdrawn via Angel AI" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const led: any = await GoalContribution.findOne({ goalId: before._id, source: "angel" }).sort({ createdAt: -1 }).select("_id").lean();
      return { summary: String(payload.goalName), undo: { goalId: String(payload.goalId), minor, prevStatus: before.status, ledgerId: led ? String(led._id) : null }, canUndo: true };
    }
    case "set_budget": {
      const category = String(payload.category);
      const minor = toMinor(payload.amount);
      if (minor === null || minor <= 0) throw new ApiError(400, "Enter a valid monthly limit.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev: any = await Budget.findOne({ userId: owner._id, category }).lean();
      if (!prev && (await Budget.countDocuments({ userId: owner._id })) >= 40) throw new ApiError(400, "You can have up to 40 budgets.");
      await Budget.updateOne({ userId: owner._id, category }, { $set: { amount: minor, alertPct: prev?.alertPct ?? 80 }, $unset: { lastAlert: 1 } }, { upsert: true });
      await audit({ actor: actor.user, action: String(actor.user._id) === String(owner._id) ? "finance.budget.set" : "admin.finance.budget.set", resource: "budget", targetUserId: String(owner._id), metadata: { category, amount: fromMinor(minor), via: "angel" }, ip: actor.ip });
      await publish([userChannel(String(owner._id))], "finance:changed", { resource: "budget", action: "update" });
      await checkBudgetAlerts(owner, category === TOTAL ? null : category);
      return { summary: `${category === TOTAL ? "Monthly" : category} budget`, undo: { category, prev: prev ? { amount: prev.amount, alertPct: prev.alertPct ?? 80 } : null }, canUndo: true };
    }
    case "edit_record": {
      const resource = payload.resource as "income" | "expense";
      await updateRecord(actor, owner, resource, String(payload.id), { amount: payload.amount });
      return { summary: String(payload.title), undo: { resource, id: String(payload.id), amount: payload.prevAmount }, canUndo: true };
    }
    case "delete_user": {
      if (actor.user.role !== "admin" || !perms.includes("users.delete")) throw new ApiError(403, "You do not have permission to perform this action.");
      const target = await User.findById(String(payload.userId)).lean<UserDoc>();
      if (!target) throw new ApiError(404, "User not found.");
      if (String(target._id) === String(actor.user._id)) throw new ApiError(400, "You can't delete your own account from Angel. Use Settings → Delete account (needs your password).");
      assertCanManage(target, perms);
      if (target.role === "admin") {
        if (!perms.includes("users.update")) throw new ApiError(403, "You do not have permission to remove an administrator.");
        await assertNotLastAdmin(target, "delete");
      }
      await deleteUserCompletely(target._id);
      await audit({ actor: actor.user, action: "admin.user.delete", resource: "user", resourceId: String(target._id), metadata: { email: target.email, via: "angel" }, ip: actor.ip });
      await publish(["admin"], "admin:activity", { action: "admin.user.delete" });
      return { summary: `${target.name} <${target.email}>`, canUndo: false };
    }
    case "set_user_status": {
      if (actor.user.role !== "admin" || !perms.includes("users.update")) throw new ApiError(403, "You do not have permission to perform this action.");
      const target = await User.findById(String(payload.userId)).lean<UserDoc>();
      if (!target) throw new ApiError(404, "User not found.");
      if (String(target._id) === String(actor.user._id)) throw new ApiError(400, "You can't change your own account status.");
      assertCanManage(target, perms);
      const status = payload.status === "disabled" ? "disabled" : "active";
      if (status === "disabled") await assertNotLastAdmin(target, "disable");
      await User.updateOne({ _id: target._id }, { $set: { status } });
      if (status === "disabled") {
        await Session.deleteMany({ userId: target._id });
        await publish([userChannel(String(target._id))], "session:revoked", {});
      } else {
        await notifyUser(String(target._id), { type: "admin", title: "Account re-enabled", message: "An administrator re-enabled your account. Welcome back!", link: "/dashboard" });
      }
      await audit({ actor: actor.user, action: "admin.user.status", resource: "user", resourceId: String(target._id), targetUserId: String(target._id), metadata: { status: { from: target.status, to: status }, via: "angel" }, ip: actor.ip });
      await publish(["admin"], "admin:activity", { action: "admin.user.status" });
      return { summary: `${target.name} → ${status}`, undo: { userId: String(target._id), status: target.status }, canUndo: false };
    }
    case "reset_password": {
      if (actor.user.role !== "admin" || !perms.includes("users.update")) throw new ApiError(403, "You do not have permission to perform this action.");
      const target = await User.findById(String(payload.userId)).lean<UserDoc>();
      if (!target) throw new ApiError(404, "User not found.");
      if (String(target._id) === String(actor.user._id)) throw new ApiError(400, "Change your own password in Settings → Change password.");
      if (target.role === "admin") throw new ApiError(400, "Administrators reset their own password (Settings or “Forgot password”).");
      const temp = makeTempPassword();
      await User.updateOne({ _id: target._id }, { $set: { passwordHash: await hashPassword(temp) } });
      await Session.deleteMany({ userId: target._id });
      await publish([userChannel(String(target._id))], "session:revoked", {});
      await audit({ actor: actor.user, action: "admin.user.password_reset", resource: "user", resourceId: String(target._id), targetUserId: String(target._id), metadata: { via: "angel" }, ip: actor.ip });
      await notifyUser(String(target._id), { type: "admin", title: "Password reset by admin", message: "An administrator reset your password. Sign in with the temporary password they share with you, then change it in Settings.", link: "/settings" });
      return { summary: `${target.name}`, canUndo: false, ephemeral: [{ type: "secret", title: "Temporary password", value: temp, note: "Shown only once and never saved in the chat. Share it privately; the user should change it in Settings." }] };
    }
    case "pay_emi": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const before: any = await Debt.findOne({ _id: oid(String(payload.debtId)), userId: owner._id }).lean();
      const minor = toMinor(payload.amount);
      if (!before || minor === null) throw new ApiError(404, "Loan not found.");
      await payDebt(actor, owner, String(payload.debtId), minor, parseYmd(String(payload.date)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exp: any = await Expense.findOne({ userId: owner._id, debtId: before._id }).sort({ createdAt: -1 }).lean();
      return {
        summary: String(payload.debtTitle),
        undo: { debtId: String(before._id), expenseId: exp ? String(exp._id) : null, minor: Math.min(minor, before.remainingAmount), prev: { remainingAmount: before.remainingAmount, dueDate: before.dueDate, status: before.status } },
        canUndo: true,
      };
    }
    case "delete_record": {
      const resource = payload.resource as "income" | "expense";
      await deleteRecord(actor, owner, resource, String(payload.id));
      return { summary: String(payload.title), canUndo: false };
    }
    case "create_user": {
      if (actor.user.role !== "admin" || !perms.includes("users.create")) throw new ApiError(403, "You do not have permission to perform this action.");
      const email = String(payload.email).toLowerCase();
      if (await User.exists({ email })) throw new ApiError(409, "A user with this email already exists.");
      const plan = String(payload.plan || "free");
      const tempPassword = makeTempPassword();
      const created = await User.create({
        name: String(payload.name).slice(0, 80),
        email,
        passwordHash: await hashPassword(tempPassword),
        role: "user",
        plan,
        permissions: DEFAULT_USER_PERMISSIONS.filter((p) => !isAdminPermission(p)),
      });
      await audit({ actor: actor.user, action: "admin.user.create", resource: "user", resourceId: String(created._id), targetUserId: String(created._id), metadata: { email, role: "user", plan, via: "angel" }, ip: actor.ip });
      await notifyUser(String(created._id), { type: "system", title: "Welcome to Budget Pro", message: "An administrator created your account. You can change your password in Settings.", link: "/settings", push: false });
      return {
        summary: `${payload.name} <${email}>`,
        canUndo: false,
        ephemeral: [{ type: "secret", title: "Temporary password", value: tempPassword, note: "Shown only once and never saved in the chat. Share it privately; the user should change it in Settings." }],
      };
    }
    case "change_plan": {
      if (actor.user.role !== "admin" || !perms.includes("users.update")) throw new ApiError(403, "You do not have permission to perform this action.");
      const target = await User.findById(String(payload.userId)).lean<UserDoc>();
      if (!target) throw new ApiError(404, "User not found.");
      if (String(target._id) === String(actor.user._id)) throw new ApiError(400, "You cannot change your own plan. Ask another administrator.");
      if (target.role === "admin") throw new ApiError(400, "Admins always have the Unlimited plan.");
      const plan = String(payload.plan);
      await User.updateOne({ _id: target._id }, { $set: { plan } });
      await publish([userChannel(String(target._id))], "profile:changed", {});
      await audit({ actor: actor.user, action: "admin.user.plan_change", resource: "user", resourceId: String(target._id), targetUserId: String(target._id), metadata: { changes: ["plan"], plan: { from: target.plan, to: plan }, via: "angel" }, ip: actor.ip });
      await notifyUser(String(target._id), { type: "admin", title: "Account updated by admin", message: `An administrator updated your account: your plan is now ${getPlan(plan).name}.`, link: "/plan" });
      return { summary: `${target.name} → ${getPlan(plan).name}`, undo: { userId: String(target._id), plan: target.plan }, canUndo: false };
    }
  }
}

function makeTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let s = "";
  for (const b of bytes) s += chars[b % chars.length];
  return `${s}7a`; // guarantees a letter + a number (password rules)
}

function errorText(lang: Lang, err: unknown): string {
  const msg = err instanceof ApiError ? err.message : (err as { name?: string })?.name === "ZodError" ? (err as { issues?: { message: string }[] }).issues?.[0]?.message ?? "Invalid data." : "Something went wrong.";
  return L(lang, { en: `I couldn't do that: ${msg}`, hi: `ये नहीं हो पाया: ${msg}`, gu: `આ થઈ શક્યું નહીં: ${msg}`, hn: `Ye nahi ho paya: ${msg}` });
}

/** Text shown after an action succeeds. */
async function doneText(lang: Lang, kind: ActionKind, payload: Record<string, unknown>, owner: UserDoc, t: { self: boolean; name: string }, cur: string, today: string): Promise<string> {
  const m = (n: number) => money(n, cur);
  const amount = Number(payload.amount ?? payload.targetAmount ?? payload.totalAmount ?? 0);
  const forWhom = t.self ? "" : L(lang, { en: ` for ${t.name}`, hi: ` (${t.name} के लिए)`, gu: ` (${t.name} માટે)`, hn: ` (${t.name} ke liye)` });
  switch (kind) {
    case "add_expense": {
      const cat = String(payload.category);
      const monthTotal = await categoryMonthTotal(String(owner._id), cat, today);
      return L(lang, {
        en: `✓ Added expense${forWhom}: ${payload.title} — ${m(amount)} (${cat}, ${dateLabel(lang, String(payload.date))}). ${cat} this month: ${m(monthTotal)}.`,
        hi: `✓ खर्च जोड़ दिया${forWhom}: ${payload.title} — ${m(amount)} (${catLabel(lang, cat)}, ${dateLabel(lang, String(payload.date))})। इस महीने ${catLabel(lang, cat)} पर कुल: ${m(monthTotal)}।`,
        gu: `✓ ખર્ચ ઉમેરી દીધો${forWhom}: ${payload.title} — ${m(amount)} (${catLabel(lang, cat)}, ${dateLabel(lang, String(payload.date))}). આ મહિને ${catLabel(lang, cat)} પર કુલ: ${m(monthTotal)}.`,
        hn: `✓ Expense add ho gaya${forWhom}: ${payload.title} — ${m(amount)} (${cat}, ${dateLabel(lang, String(payload.date))}). Is mahine ${cat} pe total: ${m(monthTotal)}.`,
      });
    }
    case "add_income":
      return L(lang, {
        en: `✓ Added income${forWhom}: ${payload.title} — ${m(amount)} (${payload.category}, ${dateLabel(lang, String(payload.date))}).`,
        hi: `✓ आमदनी जोड़ दी${forWhom}: ${payload.title} — ${m(amount)} (${catLabel(lang, String(payload.category))}, ${dateLabel(lang, String(payload.date))})।`,
        gu: `✓ આવક ઉમેરી દીધી${forWhom}: ${payload.title} — ${m(amount)} (${catLabel(lang, String(payload.category))}, ${dateLabel(lang, String(payload.date))}).`,
        hn: `✓ Income add ho gayi${forWhom}: ${payload.title} — ${m(amount)} (${payload.category}, ${dateLabel(lang, String(payload.date))}).`,
      });
    case "goal_contribute":
      return L(lang, {
        en: `✓ Put ${m(amount)} into “${payload.goalName}”${forWhom}.`,
        hi: `✓ “${payload.goalName}” में ${m(amount)} डाल दिए${forWhom}।`,
        gu: `✓ “${payload.goalName}” માં ${m(amount)} ઉમેરી દીધા${forWhom}.`,
        hn: `✓ “${payload.goalName}” mein ${m(amount)} daal diye${forWhom}.`,
      });
    case "pay_emi":
      return L(lang, {
        en: `✓ Recorded EMI payment of ${m(amount)} for “${payload.debtTitle}”${forWhom}. The remaining balance and next due date are updated.`,
        hi: `✓ “${payload.debtTitle}” की ${m(amount)} की EMI दर्ज कर दी${forWhom}। बाकी रकम और अगली तारीख अपडेट हो गई।`,
        gu: `✓ “${payload.debtTitle}” ની ${m(amount)} ની EMI નોંધી દીધી${forWhom}. બાકી રકમ અને આગલી તારીખ અપડેટ થઈ ગઈ.`,
        hn: `✓ “${payload.debtTitle}” ki ${m(amount)} ki EMI record kar di${forWhom}. Baaki amount aur agli date update ho gayi.`,
      });
    case "create_goal":
      return L(lang, {
        en: `✓ Created goal “${payload.name}”${forWhom}: ${m(amount)} by ${dateLabel(lang, String(payload.targetDate))}.`,
        hi: `✓ गोल बना दिया${forWhom}: “${payload.name}” — ${dateLabel(lang, String(payload.targetDate))} तक ${m(amount)}।`,
        gu: `✓ ગોલ બનાવી દીધો${forWhom}: “${payload.name}” — ${dateLabel(lang, String(payload.targetDate))} સુધી ${m(amount)}.`,
        hn: `✓ Goal bana diya${forWhom}: “${payload.name}” — ${dateLabel(lang, String(payload.targetDate))} tak ${m(amount)}.`,
      });
    case "create_debt":
      return L(lang, {
        en: `✓ Added loan “${payload.title}”${forWhom}: ${m(amount)}, EMI ${m(Number(payload.emiAmount))}, next due ${dateLabel(lang, String(payload.dueDate))}.`,
        hi: `✓ लोन जोड़ दिया${forWhom}: “${payload.title}” — ${m(amount)}, EMI ${m(Number(payload.emiAmount))}, अगली तारीख ${dateLabel(lang, String(payload.dueDate))}।`,
        gu: `✓ લોન ઉમેરી દીધી${forWhom}: “${payload.title}” — ${m(amount)}, EMI ${m(Number(payload.emiAmount))}, આગલી તારીખ ${dateLabel(lang, String(payload.dueDate))}.`,
        hn: `✓ Loan add kar diya${forWhom}: “${payload.title}” — ${m(amount)}, EMI ${m(Number(payload.emiAmount))}, agli date ${dateLabel(lang, String(payload.dueDate))}.`,
      });
    case "delete_record":
      return L(lang, { en: `✓ Deleted “${payload.title}”.`, hi: `✓ “${payload.title}” हटा दिया।`, gu: `✓ “${payload.title}” કાઢી નાખ્યું.`, hn: `✓ “${payload.title}” delete kar diya.` });
    case "goal_withdraw":
      return L(lang, {
        en: `✓ Took ${m(amount)} out of “${payload.goalName}”${forWhom}. Its progress is updated.`,
        hi: `✓ “${payload.goalName}” से ${m(amount)} निकाल लिए${forWhom}। प्रगति अपडेट हो गई।`,
        gu: `✓ “${payload.goalName}” માંથી ${m(amount)} કાઢી લીધા${forWhom}. પ્રગતિ અપડેટ થઈ ગઈ.`,
        hn: `✓ “${payload.goalName}” se ${m(amount)} nikal liye${forWhom}. Progress update ho gayi.`,
      });
    case "set_budget": {
      const c = String(payload.category);
      const name = c === TOTAL ? L(lang, { en: "monthly", hi: "महीने का", gu: "મહિનાનું", hn: "monthly" }) : catLabel(lang, c);
      const spent = c === TOTAL ? (await T.periodSums(String(owner._id), thisMonth(today).start, thisMonth(today).end)).expense : await categoryMonthTotal(String(owner._id), c, today);
      return L(lang, {
        en: `✓ ${cap(name)} budget set to ${m(amount)}/month${forWhom}. Spent so far this month: ${m(spent)} (${Math.round((spent / amount) * 100)}%). I'll warn at 80% and 100%.`,
        hi: `✓ ${name} बजट ${m(amount)}/महीना कर दिया${forWhom}। इस महीने अब तक: ${m(spent)} (${Math.round((spent / amount) * 100)}%)। 80% और 100% पर बताऊंगी।`,
        gu: `✓ ${name} બજેટ ${m(amount)}/મહિનો કરી દીધું${forWhom}. આ મહિને અત્યાર સુધી: ${m(spent)} (${Math.round((spent / amount) * 100)}%). 80% અને 100% પર જણાવીશ.`,
        hn: `✓ ${cap(name)} budget ${m(amount)}/mahina kar diya${forWhom}. Is mahine ab tak: ${m(spent)} (${Math.round((spent / amount) * 100)}%). 80% aur 100% pe bataungi.`,
      });
    }
    case "edit_record":
      return L(lang, {
        en: `✓ Changed “${payload.title}” from ${m(Number(payload.prevAmount))} to ${m(amount)}.`,
        hi: `✓ “${payload.title}” को ${m(Number(payload.prevAmount))} से ${m(amount)} कर दिया।`,
        gu: `✓ “${payload.title}” ને ${m(Number(payload.prevAmount))} થી ${m(amount)} કરી દીધું.`,
        hn: `✓ “${payload.title}” ko ${m(Number(payload.prevAmount))} se ${m(amount)} kar diya.`,
      });
    case "delete_user":
      return L(lang, {
        en: `✓ Deleted ${payload.userName}'s account and all their data.`,
        hi: `✓ ${payload.userName} का अकाउंट और उनका सारा डेटा हटा दिया।`,
        gu: `✓ ${payload.userName} નું એકાઉન્ટ અને તેમનો બધો ડેટા કાઢી નાખ્યો.`,
        hn: `✓ ${payload.userName} ka account aur unka saara data delete kar diya.`,
      });
    case "set_user_status":
      return payload.status === "disabled"
        ? L(lang, { en: `✓ ${payload.userName} is blocked and signed out of every device.`, hi: `✓ ${payload.userName} को ब्लॉक कर दिया और हर डिवाइस से लॉगआउट कर दिया।`, gu: `✓ ${payload.userName} ને બ્લોક કરી દીધા અને દરેક ડિવાઇસમાંથી લૉગઆઉટ કર્યા.`, hn: `✓ ${payload.userName} ko block kar diya aur har device se logout kar diya.` })
        : L(lang, { en: `✓ ${payload.userName} can sign in again.`, hi: `✓ ${payload.userName} अब फिर से लॉगिन कर सकते हैं।`, gu: `✓ ${payload.userName} હવે ફરી લૉગિન કરી શકે છે.`, hn: `✓ ${payload.userName} ab phir se login kar sakte hain.` });
    case "reset_password":
      return L(lang, {
        en: `✓ ${payload.userName}'s password was reset and they were signed out everywhere. The temporary password is below — only this once.`,
        hi: `✓ ${payload.userName} का पासवर्ड रीसेट कर दिया और हर जगह से लॉगआउट कर दिया। अस्थायी पासवर्ड नीचे है — सिर्फ़ एक बार दिखेगा।`,
        gu: `✓ ${payload.userName} નો પાસવર્ડ રીસેટ કર્યો અને દરેક જગ્યાએથી લૉગઆઉટ કર્યા. કામચલાઉ પાસવર્ડ નીચે છે — ફક્ત એક જ વાર.`,
        hn: `✓ ${payload.userName} ka password reset kar diya aur har jagah se logout kar diya. Temporary password neeche hai — sirf ek baar.`,
      });
    case "create_user":
      return L(lang, {
        en: `✓ Created user ${payload.name} (${payload.email}) on the ${getPlan(String(payload.plan)).name} plan. The temporary password is shown below — only this once.`,
        hi: `✓ यूज़र बना दिया: ${payload.name} (${payload.email}), प्लान ${getPlan(String(payload.plan)).name}। अस्थायी पासवर्ड नीचे है — सिर्फ़ एक बार दिखेगा।`,
        gu: `✓ યુઝર બનાવી દીધો: ${payload.name} (${payload.email}), પ્લાન ${getPlan(String(payload.plan)).name}. કામચલાઉ પાસવર્ડ નીચે છે — ફક્ત એક જ વાર દેખાશે.`,
        hn: `✓ User bana diya: ${payload.name} (${payload.email}), plan ${getPlan(String(payload.plan)).name}. Temporary password neeche hai — sirf ek baar dikhega.`,
      });
    case "change_plan":
      return L(lang, {
        en: `✓ ${payload.userName}'s plan is now ${getPlan(String(payload.plan)).name}. They've been notified.`,
        hi: `✓ ${payload.userName} का प्लान अब ${getPlan(String(payload.plan)).name} है। उन्हें सूचना भेज दी।`,
        gu: `✓ ${payload.userName} નો પ્લાન હવે ${getPlan(String(payload.plan)).name} છે. તેમને જાણ કરી દીધી.`,
        hn: `✓ ${payload.userName} ka plan ab ${getPlan(String(payload.plan)).name} hai. Unhe notification bhej diya.`,
      });
  }
}

/** Plans an action from a parsed message; either runs it, asks for a missing detail, or asks to confirm. */
async function planAction(intent: Intent, p: Parsed, inp: EngineInput, lang: Lang, t: Target, cur: string, today: string, pre?: Record<string, unknown>): Promise<{ reply: EngineReply; pending?: Pending | null }> {
  const { perms } = inp;
  const actor: Actor = { user: inp.actor, ip: inp.ip };
  const ownerId = String(t.owner._id);
  const ask = (slot: Pending["slot"], kind: ActionKind, payload: Record<string, unknown>, q: T4, options?: Pending["options"]) => ({
    reply: reply(lang, L(lang, q), options?.length ? { cards: [{ type: "list", items: options.map((o, i) => ({ title: `${i + 1}. ${o.label}` })) }] } : {}),
    pending: { kind: "slot" as const, slot, options, action: { kind, ownerId, payload } },
  });
  const confirm = (kind: ActionKind, payload: Record<string, unknown>, summary: string, q: T4) => {
    const action: StoredAction = { kind, status: "pending", summary, ownerId, needsConfirm: true, payload };
    return {
      reply: reply(lang, L(lang, q), { action, suggestions: [L(lang, { en: "Yes", hi: "हाँ", gu: "હા", hn: "Haan" }), L(lang, { en: "No", hi: "नहीं", gu: "ના", hn: "Nahi" })] }),
      pending: { kind: "confirm" as const, action: { kind, ownerId, payload } },
    };
  };
  const run = async (kind: ActionKind, payload: Record<string, unknown>) => {
    if (t.scope === "user") {
      // Writing into SOMEONE ELSE's account (admin) always needs an explicit OK, naming the user.
      const label = String(payload.title ?? payload.name ?? payload.goalName ?? payload.debtTitle ?? "");
      const amt = Number(payload.amount ?? payload.targetAmount ?? payload.totalAmount ?? 0);
      const what = `${label}${amt ? ` — ${money(amt, cur)}` : ""}`;
      return confirm(kind, payload, `${t.owner.name}: ${what}`, {
        en: `Add this to ${t.owner.name}'s account (${t.owner.email})? ${what}`,
        hi: `${t.owner.name} (${t.owner.email}) के अकाउंट में ये जोड़ दूं? ${what}`,
        gu: `${t.owner.name} (${t.owner.email}) ના એકાઉન્ટમાં આ ઉમેરું? ${what}`,
        hn: `${t.owner.name} (${t.owner.email}) ke account mein ye add kar dun? ${what}`,
      });
    }
    try {
      const r = await execute(kind, payload, t.owner, actor, perms);
      const text = await doneText(lang, kind, payload, t.owner, t.who, cur, today);
      const action: StoredAction = { kind, status: "done", summary: r.summary, ownerId, canUndo: r.canUndo, payload, undo: r.undo };
      return { reply: reply(lang, text, { action, ephemeral: r.ephemeral, suggestions: sug(lang, "action") }), pending: null };
    } catch (err) {
      return { reply: reply(lang, errorText(lang, err)), pending: null };
    }
  };
  const amount = (pre?.amount as number | undefined) ?? p.amount;
  const date = p.dates.date ?? today;
  const note = `Added by Angel AI${inp.source === "voice" ? " (voice)" : ""}`;

  switch (intent) {
    case "add_expense": {
      if (!canWrite(perms, t, "expense", "create")) return { reply: deny(lang, "perm") };
      const category = (pre?.category as string | undefined) ?? p.expenseCategory ?? "Other";
      const title = (pre?.title as string | undefined) ?? p.categoryWord ?? (p.contentWords.length ? nameFromWords(p.contentWords, category) : category);
      const payload = { title, category, amount, date: (pre?.date as string | undefined) ?? date, recurring: "none", notes: note };
      if (!amount)
        return ask("amount", "add_expense", payload, { en: `How much was “${title}”?`, hi: `“${title}” कितने का था?`, gu: `“${title}” કેટલાનું હતું?`, hn: `“${title}” kitne ka tha?` });
      return run("add_expense", payload);
    }
    case "add_income": {
      if (!canWrite(perms, t, "income", "create")) return { reply: deny(lang, "perm") };
      const category = (pre?.category as string | undefined) ?? p.incomeCategory ?? "Other";
      const title = (pre?.title as string | undefined) ?? p.categoryWord ?? (p.contentWords.length ? nameFromWords(p.contentWords, category) : category);
      const payload = { title, type: category === "Salary" ? "salary" : "extra", category, amount, date: (pre?.date as string | undefined) ?? date, recurring: "none", notes: note };
      if (!amount) return ask("amount", "add_income", payload, { en: "How much did you receive?", hi: "कितनी रकम आई?", gu: "કેટલી રકમ આવી?", hn: "Kitni amount aayi?" });
      return run("add_income", payload);
    }
    case "goal_contribute": {
      if (!canWrite(perms, t, "goal", "update")) return { reply: deny(lang, "perm") };
      const goals = (await T.goalsOf(ownerId, true)).map((g) => ({ ...g }));
      let goal = pre?.goalId ? goals.find((g) => g.id === pre.goalId) : undefined;
      if (!goal) {
        const matched = matchByName(goals, (g) => g.name, p.contentWords);
        goal = matched.length === 1 ? matched[0] : goals.length === 1 ? goals[0] : undefined;
      }
      if (!goals.length) return { reply: reply(lang, L(lang, { en: "There's no active goal yet. Say “create a goal…” first.", hi: "अभी कोई चालू गोल नहीं है। पहले “गोल बनाओ…” बोलिए।", gu: "હજી કોઈ ચાલુ ગોલ નથી. પહેલાં “ગોલ બનાવો…” બોલો.", hn: "Abhi koi active goal nahi hai. Pehle “goal banao…” boliye." })) };
      if (!goal)
        return ask("goal", "goal_contribute", { amount }, { en: "Which goal?", hi: "किस गोल में?", gu: "કયા ગોલમાં?", hn: "Kaun se goal mein?" }, goals.map((g) => ({ id: g.id, label: g.name })));
      const payload = { goalId: goal.id, goalName: goal.name, amount };
      if (!amount) return ask("amount", "goal_contribute", payload, { en: `How much should I add to “${goal.name}”?`, hi: `“${goal.name}” में कितने डालूं?`, gu: `“${goal.name}” માં કેટલા ઉમેરું?`, hn: `“${goal.name}” mein kitne daalun?` });
      return run("goal_contribute", payload);
    }
    case "pay_emi": {
      if (!canWrite(perms, t, "debt", "update") || (t.scope === "self" && !perms.includes("expense.create"))) return { reply: deny(lang, "perm") };
      const debts = (await T.debtsOf(ownerId)).filter((d) => d.status === "active");
      if (!debts.length) return { reply: reply(lang, L(lang, { en: "There's no active loan to pay.", hi: "कोई चालू लोन नहीं है।", gu: "કોઈ ચાલુ લોન નથી.", hn: "Koi active loan nahi hai." })) };
      let debt = pre?.debtId ? debts.find((d) => d.id === pre.debtId) : undefined;
      if (!debt) {
        const matched = matchByName(debts, (d) => d.title, p.contentWords);
        debt = matched.length === 1 ? matched[0] : debts.length === 1 ? debts[0] : undefined;
      }
      if (!debt)
        return ask("debt", "pay_emi", { amount }, { en: "Which loan's EMI?", hi: "किस लोन की EMI?", gu: "કઈ લોનની EMI?", hn: "Kaunse loan ki EMI?" }, debts.map((d) => ({ id: d.id, label: `${d.title} (EMI ${money(d.emi, cur)})` })));
      const pay = amount ?? debt.emi;
      return run("pay_emi", { debtId: debt.id, debtTitle: debt.title, amount: Math.min(pay, debt.remaining), date });
    }
    case "create_goal": {
      if (!canWrite(perms, t, "goal", "create")) return { reply: deny(lang, "perm") };
      const name = (pre?.name as string | undefined) ?? nameFromWords(p.contentWords, "Savings goal");
      const targetDate = (pre?.targetDate as string | undefined) ?? p.dates.deadline ?? (p.dates.months ? addMonths(today, p.dates.months) : addMonths(today, 12));
      const payload = { name, targetAmount: amount, currentAmount: 0, targetDate, status: "active", notes: note };
      if (!amount) return ask("amount", "create_goal", payload, { en: `What's the target amount for “${name}”?`, hi: `“${name}” का टारगेट कितना है?`, gu: `“${name}” નો ટાર્ગેટ કેટલો છે?`, hn: `“${name}” ka target kitna hai?` });
      return run("create_goal", payload);
    }
    case "create_debt": {
      if (!canWrite(perms, t, "debt", "create")) return { reply: deny(lang, "perm") };
      const vals = p.amounts.map((a) => a.value).sort((a, b) => b - a);
      const total = (pre?.totalAmount as number | undefined) ?? vals[0] ?? null;
      const emi = (pre?.emiAmount as number | undefined) ?? (vals.length > 1 ? vals[vals.length - 1] : pre?.amount && total ? (pre.amount as number) : null);
      let due = p.dates.date ? p.dates.date : addMonths(today, 1);
      if (due <= today) due = addMonths(due, 1);
      const title = (pre?.title as string | undefined) ?? nameFromWords(p.contentWords, "Loan");
      const payload: Record<string, unknown> = { title: /loan|लोन|લોન/i.test(title) ? title : `${title === "Loan" ? "" : `${title} `}Loan`.trim(), totalAmount: total, remainingAmount: total, emiAmount: emi, interestRate: p.interest ?? 0, dueDate: (pre?.dueDate as string | undefined) ?? due, status: "active", notes: note };
      if (!emi) return ask("emi", "create_debt", payload, { en: "What's the monthly EMI?", hi: "हर महीने की EMI कितनी है?", gu: "દર મહિનાની EMI કેટલી છે?", hn: "Monthly EMI kitni hai?" });
      return run("create_debt", payload);
    }
    case "delete_last": {
      const resource = p.hits.income || p.incomeCategory ? "income" : p.hits.expense || p.expenseCategory ? "expense" : null;
      if (!canWrite(perms, t, resource ?? "expense", "delete")) return { reply: deny(lang, "perm") };
      const last = await T.lastCreated(ownerId, resource);
      if (!last) return { reply: reply(lang, L(lang, { en: "There's nothing to delete.", hi: "हटाने के लिए कुछ नहीं है।", gu: "કાઢવા માટે કંઈ નથી.", hn: "Delete karne ke liye kuch nahi hai." })) };
      const desc = `${last.title} — ${money(last.amount, cur)} (${catLabel(lang, last.category)}, ${dateLabel(lang, last.date)})`;
      return confirm("delete_record", { resource: last.resource, id: last.id, title: last.title }, desc, {
        en: `Delete this ${last.resource}? ${desc}`,
        hi: `ये ${last.resource === "income" ? "आमदनी" : "खर्च"} हटा दूं? ${desc}`,
        gu: `આ ${last.resource === "income" ? "આવક" : "ખર્ચ"} કાઢી નાખું? ${desc}`,
        hn: `Ye ${last.resource} delete kar dun? ${desc}`,
      });
    }
    case "goal_withdraw": {
      if (!canWrite(perms, t, "goal", "update")) return { reply: deny(lang, "perm") };
      const goals = (await T.goalsOf(ownerId, false)).filter((g) => g.status !== "cancelled" && g.current > 0);
      if (!goals.length) return { reply: reply(lang, L(lang, { en: "None of your goals has money in it yet.", hi: "अभी किसी गोल में पैसे नहीं हैं।", gu: "હજી કોઈ ગોલમાં પૈસા નથી.", hn: "Abhi kisi goal mein paise nahi hain." })) };
      let goal = pre?.goalId ? goals.find((g) => g.id === pre.goalId) : undefined;
      if (!goal) {
        const matched = matchByName(goals, (g) => g.name, p.contentWords);
        goal = matched.length === 1 ? matched[0] : goals.length === 1 ? goals[0] : undefined;
      }
      if (!goal) return ask("goal", "goal_withdraw", { amount }, { en: "From which goal?", hi: "किस गोल से?", gu: "કયા ગોલમાંથી?", hn: "Kaun se goal se?" }, goals.map((g) => ({ id: g.id, label: `${g.name} (${money(g.current, cur)})` })));
      const payload = { goalId: goal.id, goalName: goal.name, amount };
      if (!amount) return ask("amount", "goal_withdraw", payload, { en: `How much should I take out of “${goal.name}”?`, hi: `“${goal.name}” से कितने निकालूं?`, gu: `“${goal.name}” માંથી કેટલા કાઢું?`, hn: `“${goal.name}” se kitne nikalun?` });
      if (amount > goal.current) return { reply: reply(lang, L(lang, { en: `“${goal.name}” only holds ${money(goal.current, cur)}.`, hi: `“${goal.name}” में सिर्फ़ ${money(goal.current, cur)} हैं।`, gu: `“${goal.name}” માં માત્ર ${money(goal.current, cur)} છે.`, hn: `“${goal.name}” mein sirf ${money(goal.current, cur)} hain.` })) };
      return run("goal_withdraw", payload);
    }
    case "set_budget": {
      if (!canWrite(perms, t, "expense", "create")) return { reply: deny(lang, "perm") };
      const totalWord = /(^| )(total|overall|monthly|month|mahine|mahina|महीने|महीना|કુલ|મહિનાનું|mahinanu|poora|pura)( |$)/.test(` ${p.tokens.join(" ")} `);
      const category = (pre?.category as string | undefined) ?? p.expenseCategory ?? (totalWord ? TOTAL : null);
      const payload = { category, amount, title: category ?? "" };
      if (!category)
        return ask("category", "set_budget", payload, { en: `For which category is the ${amount ? money(amount, cur) + " " : ""}budget? (e.g. food, petrol, shopping — or “total”)`, hi: `${amount ? money(amount, cur) + " का " : ""}बजट किस कैटेगरी के लिए? (जैसे खाना, पेट्रोल, शॉपिंग — या “total”)`, gu: `${amount ? money(amount, cur) + " નું " : ""}બજેટ કઈ કેટેગરી માટે? (જેમ કે ખાવાનું, પેટ્રોલ, શોપિંગ — અથવા “total”)`, hn: `${amount ? money(amount, cur) + " ka " : ""}budget kis category ke liye? (jaise food, petrol, shopping — ya “total”)` });
      if (!amount) return ask("amount", "set_budget", payload, { en: `What monthly limit for ${category === TOTAL ? "the whole month" : catLabel(lang, category)}?`, hi: `${category === TOTAL ? "पूरे महीने" : catLabel(lang, category)} की महीने की लिमिट कितनी रखूं?`, gu: `${category === TOTAL ? "આખા મહિના" : catLabel(lang, category)} ની મહિનાની લિમિટ કેટલી રાખું?`, hn: `${category === TOTAL ? "Poore mahine" : catLabel(lang, category)} ki monthly limit kitni rakhun?` });
      return run("set_budget", { category, amount, title: `${category === TOTAL ? "Monthly" : category} budget` });
    }
    case "delete_entry": {
      const resource = p.hits.income || p.incomeCategory ? "income" : p.hits.expense || p.expenseCategory ? "expense" : null;
      if (!canWrite(perms, t, resource ?? "expense", "delete")) return { reply: deny(lang, "perm") };
      let found: { id: string; resource: "income" | "expense"; title: string; category: string; amount: number; date: string } | null = null;
      if (pre?.entryId) {
        const [res, rid] = String(pre.entryId).split(":");
        if (isObjectId(rid)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d: any = await (res === "income" ? Income : Expense).findOne({ _id: oid(rid), userId: t.owner._id }).lean();
          if (d) found = { id: rid, resource: res === "income" ? "income" : "expense", title: d.title, category: d.category, amount: fromMinor(d.amount), date: new Date(d.date).toISOString().slice(0, 10) };
        }
      }
      if (!found) {
        const list = await T.findEntries(ownerId, { words: p.contentWords, category: p.expenseCategory ?? p.incomeCategory, amount: p.amount, resource });
        if (!list.length) return { reply: reply(lang, L(lang, { en: "I couldn't find a matching entry in the last 4 months. Try the title, e.g. “delete the swiggy expense”.", hi: "पिछले 4 महीनों में ऐसी कोई एंट्री नहीं मिली। नाम से बोलिए, जैसे “swiggy वाला खर्च हटाओ”।", gu: "છેલ્લા 4 મહિનામાં આવી કોઈ એન્ટ્રી મળી નહીં. નામથી કહો, જેમ કે “swiggy વાળો ખર્ચ કાઢો”.", hn: "Pichle 4 mahine mein aisi koi entry nahi mili. Naam se boliye, jaise “swiggy wala kharcha hatao”." })) };
        if (list.length > 1)
          return ask("entry", "delete_record", {}, { en: "Which one should I delete?", hi: "कौन सी हटाऊं?", gu: "કઈ કાઢું?", hn: "Kaunsi delete karun?" }, list.map((e) => ({ id: `${e.resource}:${e.id}`, label: `${e.title} — ${money(e.amount, cur)} · ${dateLabel(lang, e.date)}` })));
        found = list[0];
      }
      if (!found) return { reply: reply(lang, cancelText(lang)) };
      const desc = `${found.title} — ${money(found.amount, cur)} (${catLabel(lang, found.category)}, ${dateLabel(lang, found.date)})`;
      return confirm("delete_record", { resource: found.resource, id: found.id, title: found.title }, desc, {
        en: `Delete this ${found.resource}? ${desc}`,
        hi: `ये ${found.resource === "income" ? "आमदनी" : "खर्च"} हटा दूं? ${desc}`,
        gu: `આ ${found.resource === "income" ? "આવક" : "ખર્ચ"} કાઢી નાખું? ${desc}`,
        hn: `Ye ${found.resource} delete kar dun? ${desc}`,
      });
    }
    case "edit_last": {
      const resource = p.hits.income || p.incomeCategory ? "income" : p.hits.expense || p.expenseCategory ? "expense" : null;
      if (!canWrite(perms, t, resource ?? "expense", "update")) return { reply: deny(lang, "perm") };
      const last = await T.lastCreated(ownerId, resource);
      if (!last) return { reply: reply(lang, L(lang, { en: "There's no entry to change yet.", hi: "बदलने के लिए अभी कोई एंट्री नहीं है।", gu: "બદલવા માટે હજી કોઈ એન્ટ્રી નથી.", hn: "Badalne ke liye abhi koi entry nahi hai." })) };
      // when two numbers are said ("250 ka tha 520 nahi, 250 kar do") the new amount is the one next to "kar do / to"
      const amt = p.amounts.length > 1 ? p.amounts[p.amounts.length - 1].value : amount;
      if (!amt) return ask("amount", "edit_record", { resource: last.resource, id: last.id, title: last.title, prevAmount: last.amount }, { en: `What should “${last.title}” (${money(last.amount, cur)}) be changed to?`, hi: `“${last.title}” (${money(last.amount, cur)}) को कितना करूं?`, gu: `“${last.title}” (${money(last.amount, cur)}) ને કેટલું કરું?`, hn: `“${last.title}” (${money(last.amount, cur)}) ko kitna karun?` });
      return run("edit_record", { resource: last.resource, id: last.id, title: last.title, amount: amt, prevAmount: last.amount });
    }
    case "create_user": {
      if (inp.actor.role !== "admin" || !perms.includes("users.create")) return { reply: deny(lang, "admin") };
      const email = (pre?.email as string | undefined) ?? p.email;
      const words = p.contentWords;
      const name = (pre?.name as string | undefined) ?? (words.length ? titleCase(words.slice(0, 3).join(" ")) : email ? titleCase(email.split("@")[0].replace(/[._-]+/g, " ")) : "");
      const plan = (pre?.plan as string | undefined) ?? p.planId ?? "free";
      const payload = { name, email, plan };
      if (!email) return ask("email", "create_user", payload, { en: `What's ${name || "the user"}'s email?`, hi: `${name || "यूज़र"} का ईमेल क्या है?`, gu: `${name || "યુઝર"} નો ઈમેલ શું છે?`, hn: `${name || "User"} ka email kya hai?` });
      if (name.length < 2) return ask("user", "create_user", payload, { en: "What's the user's name?", hi: "यूज़र का नाम क्या है?", gu: "યુઝરનું નામ શું છે?", hn: "User ka naam kya hai?" });
      return confirm("create_user", payload, `${name} <${email}> · ${getPlan(plan).name}`, {
        en: `Create a new user ${name} (${email}) on the ${getPlan(plan).name} plan?`,
        hi: `नया यूज़र बनाऊं: ${name} (${email}), प्लान ${getPlan(plan).name}?`,
        gu: `નવો યુઝર બનાવું: ${name} (${email}), પ્લાન ${getPlan(plan).name}?`,
        hn: `Naya user banaun: ${name} (${email}), plan ${getPlan(plan).name}?`,
      });
    }
    case "change_plan": {
      if (inp.actor.role !== "admin" || !perms.includes("users.update")) return { reply: deny(lang, "admin") };
      if (t.scope !== "user") return { reply: reply(lang, L(lang, { en: "Whose plan should I change? Say the user's name or email.", hi: "किसका प्लान बदलूं? यूज़र का नाम या ईमेल बताइए।", gu: "કોનો પ્લાન બદલું? યુઝરનું નામ કે ઈમેલ કહો.", hn: "Kiska plan badlun? User ka naam ya email bataiye." })) };
      const plan = p.planId!;
      return confirm("change_plan", { userId: ownerId, userName: t.owner.name, plan }, `${t.owner.name} → ${getPlan(plan).name}`, {
        en: `Change ${t.owner.name}'s plan from ${getPlan(t.owner.plan).name} to ${getPlan(plan).name}?`,
        hi: `${t.owner.name} का प्लान ${getPlan(t.owner.plan).name} से ${getPlan(plan).name} कर दूं?`,
        gu: `${t.owner.name} નો પ્લાન ${getPlan(t.owner.plan).name} થી ${getPlan(plan).name} કરી દઉં?`,
        hn: `${t.owner.name} ka plan ${getPlan(t.owner.plan).name} se ${getPlan(plan).name} kar dun?`,
      });
    }
  }
  return { reply: reply(lang, "") };
}

// ======================= undo =======================
export async function undoAction(a: StoredAction, actorUser: UserDoc, ip: string, perms: Permission[]): Promise<void> {
  const owner = await User.findById(a.ownerId).lean<UserDoc>();
  if (!owner) throw new ApiError(404, "User not found.");
  const self = String(owner._id) === String(actorUser._id);
  if (!self && !(actorUser.role === "admin" && perms.includes("users.finance.manage"))) throw new ApiError(403, "You do not have permission to perform this action.");
  if (self) {
    // Undo must never be stronger than the normal app permissions.
    const NEED: Partial<Record<ActionKind, Permission[]>> = {
      add_expense: requiredPerms("expense", "delete"),
      add_income: requiredPerms("income", "delete"),
      create_goal: requiredPerms("goal", "delete"),
      create_debt: requiredPerms("debt", "delete"),
      goal_contribute: requiredPerms("goal", "update"),
      goal_withdraw: requiredPerms("goal", "update"),
      pay_emi: [...requiredPerms("debt", "update"), "expense.delete"],
      set_budget: ["finance.write"],
      edit_record: requiredPerms((a.payload.resource as "income" | "expense") ?? "expense", "update"),
    };
    if ((NEED[a.kind] ?? []).some((x) => !perms.includes(x))) throw new ApiError(403, "You do not have permission to perform this action.");
  }
  const actor: Actor = { user: actorUser, ip };
  const u = a.undo ?? {};
  switch (a.kind) {
    case "add_expense":
    case "add_income":
    case "create_goal":
    case "create_debt":
      await deleteRecord(actor, owner, u.resource as "income" | "expense" | "goal" | "debt", String(u.id));
      return;
    case "goal_contribute":
    case "goal_withdraw": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g: any = await Goal.findOne({ _id: oid(String(u.goalId)), userId: owner._id });
      if (!g) throw new ApiError(404, "Goal not found.");
      g.currentAmount = Math.max(0, g.currentAmount + (a.kind === "goal_withdraw" ? Number(u.minor) : -Number(u.minor)));
      g.status = u.prevStatus ?? g.status;
      await g.save();
      if (u.ledgerId && isObjectId(String(u.ledgerId))) await GoalContribution.deleteOne({ _id: oid(String(u.ledgerId)), userId: owner._id });
      await audit({ actor: actorUser, action: "finance.goal.contribution_undo", resource: "goal", resourceId: String(g._id), targetUserId: String(owner._id), metadata: { label: g.name, amount: fromMinor(Number(u.minor)), via: "angel" }, ip });
      await publish([userChannel(String(owner._id))], "finance:changed", { resource: "goal", action: "update", id: String(g._id) });
      return;
    }
    case "pay_emi": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const debt: any = await Debt.findOne({ _id: oid(String(u.debtId)), userId: owner._id }).lean();
      if (!debt) throw new ApiError(404, "Loan not found.");
      if (u.expenseId) await Expense.deleteOne({ _id: oid(String(u.expenseId)), userId: owner._id });
      const prev = (u.prev ?? {}) as { remainingAmount: number; dueDate: Date; status: string };
      const paid = Number(u.minor ?? 0);
      if (debt.remainingAmount === Math.max(0, prev.remainingAmount - paid)) {
        // untouched since Angel's payment → restore it exactly (amount, due date, status)
        await Debt.updateOne({ _id: debt._id, userId: owner._id }, { $set: { remainingAmount: prev.remainingAmount, dueDate: prev.dueDate, status: prev.status } });
      } else {
        // changed in the app meanwhile → only give the paid amount back, keep everything else
        await Debt.updateOne({ _id: debt._id, userId: owner._id }, { $inc: { remainingAmount: paid }, ...(debt.status === "closed" ? { $set: { status: "active" } } : {}) });
      }
      await audit({ actor: actorUser, action: "finance.debt.payment_undo", resource: "debt", resourceId: String(u.debtId), targetUserId: String(owner._id), metadata: { via: "angel" }, ip });
      await publish([userChannel(String(owner._id))], "finance:changed", { resource: "debt", action: "update", id: String(u.debtId) });
      return;
    }
    case "set_budget": {
      const prev = u.prev as { amount: number; alertPct: number } | null;
      if (prev) await Budget.updateOne({ userId: owner._id, category: String(u.category) }, { $set: { amount: prev.amount, alertPct: prev.alertPct } });
      else await Budget.deleteOne({ userId: owner._id, category: String(u.category) });
      await publish([userChannel(String(owner._id))], "finance:changed", { resource: "budget", action: "update" });
      return;
    }
    case "edit_record":
      await updateRecord(actor, owner, u.resource as "income" | "expense", String(u.id), { amount: u.amount });
      return;
    default:
      throw new ApiError(400, "This action cannot be undone.");
  }
}

/** Runs a confirmed (pending) action — used by the Yes button and by saying "haan". */
export async function runConfirmed(a: StoredAction, actorUser: UserDoc, ip: string, perms: Permission[], lang: Lang, cur: string): Promise<{ action: StoredAction; reply: EngineReply }> {
  const ADMIN_KINDS: ActionKind[] = ["create_user", "change_plan", "delete_user", "set_user_status", "reset_password"];
  const adminKind = ADMIN_KINDS.includes(a.kind);
  const owner = adminKind ? actorUser : await User.findById(a.ownerId).lean<UserDoc>();
  if (!owner) return { action: { ...a, status: "failed" }, reply: reply(lang, errorText(lang, new ApiError(404, "User not found."))) };
  if (String(owner._id) !== String(actorUser._id) && !(actorUser.role === "admin" && perms.includes("users.finance.manage")) && !adminKind) {
    return { action: { ...a, status: "failed" }, reply: deny(lang, "perm") };
  }
  const today = ymd(todayUTC());
  const self = String(owner._id) === String(actorUser._id);
  const RES: Partial<Record<ActionKind, ["income" | "expense" | "debt" | "goal", "create" | "update" | "delete"]>> = {
    add_expense: ["expense", "create"],
    add_income: ["income", "create"],
    create_goal: ["goal", "create"],
    create_debt: ["debt", "create"],
    goal_contribute: ["goal", "update"],
    pay_emi: ["debt", "update"],
    delete_record: [a.payload.resource === "income" ? "income" : "expense", "delete"],
    goal_withdraw: ["goal", "update"],
    edit_record: [a.payload.resource === "income" ? "income" : "expense", "update"],
    set_budget: ["expense", "create"],
  };
  const need = RES[a.kind];
  if (need && self && !requiredPerms(need[0], need[1]).every((x) => perms.includes(x))) return { action: { ...a, status: "failed", needsConfirm: false }, reply: deny(lang, "perm") };
  try {
    const r = await execute(a.kind, a.payload, owner, { user: actorUser, ip }, perms);
    const text = await doneText(lang, a.kind, a.payload, owner, { self, name: owner.name }, cur, today);
    const action: StoredAction = { ...a, status: "done", needsConfirm: false, canUndo: r.canUndo, undo: r.undo };
    return { action, reply: reply(lang, text, { action: null, ephemeral: r.ephemeral, suggestions: sug(lang, adminKind ? "admin" : "action") }) };
  } catch (err) {
    return { action: { ...a, status: "failed", needsConfirm: false }, reply: reply(lang, errorText(lang, err)) };
  }
}

// ======================= "did you mean" chips (from the learned model's guesses) =======================
const ADMIN_ONLY = new Set(["platform_summary", "visitors", "delete_user", "disable_user", "enable_user", "reset_password", "create_user", "top_users", "users_query", "list_users"]);
const DID_YOU_MEAN: Record<string, T4> = {
  balance: { en: "What's my balance?", hi: "मेरा बैलेंस कितना है?", gu: "મારું બેલેન્સ કેટલું છે?", hn: "Mera balance kitna hai?" },
  expense: { en: "How much did I spend this month?", hi: "इस महीने कितना खर्च हुआ?", gu: "આ મહિને કેટલો ખર્ચ થયો?", hn: "Is mahine kitna kharcha hua?" },
  income: { en: "How much did I earn this month?", hi: "इस महीने कितनी आमदनी हुई?", gu: "આ મહિને કેટલી આવક થઈ?", hn: "Is mahine kitni income hui?" },
  savings: { en: "How much did I save this month?", hi: "इस महीने कितनी बचत हुई?", gu: "આ મહિને કેટલી બચત થઈ?", hn: "Is mahine kitni bachat hui?" },
  top_categories: { en: "Where did most of my money go?", hi: "सबसे ज़्यादा खर्च कहां हुआ?", gu: "સૌથી વધુ ખર્ચ ક્યાં થયો?", hn: "Sabse zyada kharcha kahan hua?" },
  explain_change: { en: "Why did my spending go up?", hi: "खर्च क्यों बढ़ा?", gu: "ખર્ચ કેમ વધ્યો?", hn: "Kharcha kyu badha?" },
  compare: { en: "Compare with last month", hi: "पिछले महीने से तुलना करो", gu: "ગયા મહિના સાથે સરખામણી કરો", hn: "Pichle mahine se compare karo" },
  budget_status: { en: "Am I over budget?", hi: "क्या बजट पार हुआ?", gu: "બજેટ પાર થયું?", hn: "Budget cross hua kya?" },
  goals: { en: "Are my goals on track?", hi: "मेरे गोल सही चल रहे हैं?", gu: "મારા ગોલ બરાબર ચાલે છે?", hn: "Mere goals on track hain?" },
  debts: { en: "When is my next EMI?", hi: "अगली EMI कब है?", gu: "આગલી EMI ક્યારે છે?", hn: "Agli EMI kab hai?" },
  advice: { en: "How can I save more?", hi: "ज़्यादा बचत कैसे करूं?", gu: "વધુ બચત કેવી રીતે કરું?", hn: "Zyada bachat kaise karun?" },
  insights: { en: "Give me suggestions", hi: "मुझे सुझाव दो", gu: "મને સૂચનો આપો", hn: "Mujhe suggestions do" },
  forecast: { en: "How much will be left at month end?", hi: "महीने के अंत तक कितना बचेगा?", gu: "મહિનાના અંતે કેટલું બચશે?", hn: "Mahine ke end tak kitna bachega?" },
  health: { en: "How is my financial health?", hi: "मेरी फाइनेंशियल हेल्थ कैसी है?", gu: "મારી ફાઇનાન્શિયલ હેલ્થ કેવી છે?", hn: "Meri financial health kaisi hai?" },
  rule_503020: { en: "Show my 50/30/20 split", hi: "मेरा 50/30/20 दिखाओ", gu: "મારો 50/30/20 બતાવો", hn: "Mera 50/30/20 dikhao" },
  emergency_fund: { en: "How much emergency fund do I need?", hi: "मुझे कितना इमरजेंसी फंड चाहिए?", gu: "મારે કેટલું ઇમરજન્સી ફંડ જોઈએ?", hn: "Mujhe kitna emergency fund chahiye?" },
  subscriptions: { en: "Show my recurring payments", hi: "मेरे फिक्स खर्च दिखाओ", gu: "મારા ફિક્સ ખર્ચ બતાવો", hn: "Mere fixed kharche dikhao" },
  recent: { en: "Show my last transactions", hi: "आखिरी लेनदेन दिखाओ", gu: "છેલ્લા વ્યવહાર બતાવો", hn: "Last transactions dikhao" },
  platform_summary: { en: "How many users are there?", hi: "कितने यूज़र हैं?", gu: "કેટલા યુઝર છે?", hn: "Kitne users hain?" },
  visitors: { en: "How many visitors today?", hi: "आज कितने विज़िटर आए?", gu: "આજે કેટલા વિઝિટર આવ્યા?", hn: "Aaj kitne visitors aaye?" },
};

// ======================= admin: user management by voice / chat =======================
/** "ravi ko block karo", "delete user ravi@x.com", "unblock ravi", "ravi ka password reset karo" — always confirmed first. */
async function adminUserAction(intent: Intent, p: Parsed, inp: EngineInput, lang: Lang, ctx: AngelContext): Promise<{ reply: EngineReply; pending?: Pending | null }> {
  const need: Permission = intent === "delete_user" ? "users.delete" : "users.update";
  if (!inp.perms.includes(need)) return { reply: deny(lang, "perm") };
  let { users } = await findMentionedUsers(p);
  if (!users.length && p.hits.otherPronoun && ctx.lastUserId) {
    const u = await loadUser(ctx.lastUserId);
    if (u) users = [{ _id: String(u._id), name: u.name, email: u.email, plan: u.plan, role: u.role, status: u.status }];
  }
  if (!users.length && intent === "reset_password" && p.hits.self)
    return { reply: reply(lang, L(lang, { en: "Change your own password in Settings → Change password (or use “Forgot password” on the sign-in page).", hi: "अपना पासवर्ड Settings → Change password में बदलिए (या साइन-इन पेज पर “Forgot password”)।", gu: "તમારો પાસવર્ડ Settings → Change password માં બદલો (અથવા સાઇન-ઇન પેજ પર “Forgot password”).", hn: "Apna password Settings → Change password mein badliye (ya sign-in page pe “Forgot password”)." })) };
  if (!users.length)
    return { reply: reply(lang, L(lang, { en: "Which user? Say their name or email.", hi: "कौन सा यूज़र? नाम या ईमेल बताइए।", gu: "કયો યુઝર? નામ કે ઈમેલ કહો.", hn: "Kaun sa user? Naam ya email bataiye." })) };
  if (users.length > 1) {
    const list = users.map((u, i) => `${i + 1}. ${u.name} (${u.email})`).join("\n");
    return { reply: reply(lang, L(lang, { en: `I found more than one user — please say the email:\n${list}`, hi: `एक से ज़्यादा यूज़र मिले — ईमेल बताइए:\n${list}`, gu: `એકથી વધુ યુઝર મળ્યા — ઈમેલ કહો:\n${list}`, hn: `Ek se zyada users mile — email bataiye:\n${list}` })) };
  }
  const u = users[0];
  if (u._id === String(inp.actor._id))
    return { reply: reply(lang, L(lang, { en: "That's your own account — for safety, manage it in Settings.", hi: "ये आपका अपना अकाउंट है — सुरक्षा के लिए इसे Settings से संभालिए।", gu: "આ તમારું પોતાનું એકાઉન્ટ છે — સુરક્ષા માટે Settings માંથી સંભાળો.", hn: "Ye aapka apna account hai — safety ke liye ise Settings se manage kijiye." })) };
  const full = await loadUser(u._id);
  if (!full) return { reply: reply(lang, L(lang, { en: "User not found.", hi: "यूज़र नहीं मिला।", gu: "યુઝર મળ્યો નહીં.", hn: "User nahi mila." })) };
  try {
    assertCanManage(full, inp.perms);
  } catch {
    return { reply: deny(lang, "perm") };
  }
  ctx.lastUserId = u._id;
  ctx.lastUserName = u.name;
  const who = `${u.name} (${u.email})`;
  let kind: ActionKind;
  let payload: Record<string, unknown>;
  let q: T4;
  if (intent === "delete_user") {
    kind = "delete_user";
    payload = { userId: u._id, userName: u.name };
    q = { en: `⚠️ Permanently delete ${who} and ALL their data (entries, goals, chats)? This cannot be undone.`, hi: `⚠️ ${who} और उनका सारा डेटा (एंट्री, गोल, चैट) हमेशा के लिए हटा दूं? ये वापस नहीं होगा।`, gu: `⚠️ ${who} અને તેમનો બધો ડેટા (એન્ટ્રી, ગોલ, ચેટ) કાયમ માટે કાઢી નાખું? આ પાછું નહીં થાય.`, hn: `⚠️ ${who} aur unka saara data (entries, goals, chats) hamesha ke liye delete kar dun? Ye wapas nahi hoga.` };
  } else if (intent === "disable_user" || intent === "enable_user") {
    const status = intent === "disable_user" ? "disabled" : "active";
    if (u.status === status)
      return { reply: reply(lang, L(lang, { en: `${who} is already ${status === "disabled" ? "blocked" : "active"}.`, hi: `${who} पहले से ${status === "disabled" ? "ब्लॉक" : "एक्टिव"} है।`, gu: `${who} પહેલેથી ${status === "disabled" ? "બ્લોક" : "એક્ટિવ"} છે.`, hn: `${who} pehle se ${status === "disabled" ? "blocked" : "active"} hai.` })) };
    kind = "set_user_status";
    payload = { userId: u._id, userName: u.name, status };
    q = status === "disabled"
      ? { en: `Block ${who}? They'll be signed out everywhere and can't log in until unblocked.`, hi: `${who} को ब्लॉक करूं? हर जगह से लॉगआउट होंगे और अनब्लॉक होने तक लॉगिन नहीं कर पाएंगे।`, gu: `${who} ને બ્લોક કરું? દરેક જગ્યાએથી લૉગઆઉટ થશે અને અનબ્લોક સુધી લૉગિન નહીં કરી શકે.`, hn: `${who} ko block karun? Har jagah se logout honge aur unblock hone tak login nahi kar payenge.` }
      : { en: `Unblock ${who} so they can sign in again?`, hi: `${who} को अनब्लॉक करूं ताकि वो फिर लॉगिन कर सकें?`, gu: `${who} ને અનબ્લોક કરું જેથી ફરી લૉગિન કરી શકે?`, hn: `${who} ko unblock karun taaki wo phir login kar sakein?` };
  } else {
    kind = "reset_password";
    payload = { userId: u._id, userName: u.name };
    q = { en: `Reset ${who}'s password? I'll create a temporary password (shown once) and sign them out everywhere.`, hi: `${who} का पासवर्ड रीसेट करूं? मैं एक अस्थायी पासवर्ड बनाऊंगी (एक बार दिखेगा) और हर जगह से लॉगआउट कर दूंगी।`, gu: `${who} નો પાસવર્ડ રીસેટ કરું? હું કામચલાઉ પાસવર્ડ બનાવીશ (એક જ વાર દેખાશે) અને દરેક જગ્યાએથી લૉગઆઉટ કરીશ.`, hn: `${who} ka password reset karun? Main ek temporary password banaungi (ek baar dikhega) aur har jagah se logout kar dungi.` };
  }
  const action: StoredAction = { kind, status: "pending", summary: `${u.name}: ${kind.replace("_", " ")}`, ownerId: u._id, needsConfirm: true, payload };
  return {
    reply: reply(lang, L(lang, q), { action, suggestions: [L(lang, { en: "Yes", hi: "हाँ", gu: "હા", hn: "Haan" }), L(lang, { en: "No", hi: "नहीं", gu: "ના", hn: "Nahi" })] }),
    pending: { kind: "confirm", action: { kind, ownerId: u._id, payload } },
  };
}

// ======================= main entry =======================
const IDENTITY: T4 = {
  en: "I'm Angel — Budget Pro's own AI assistant, created by Dhrumil Panchal. I keep track of your money: balance, spending, savings, EMIs and goals. Ask me anything about your budget, or just tell me what you spent and I'll add it for you.",
  hi: "मैं एंजल हूं — Budget Pro की अपनी AI असिस्टेंट, जिसे धृमिल पंचाल ने बनाया है। मैं आपके पैसों का पूरा हिसाब रखती हूं: बैलेंस, खर्च, बचत, EMI और गोल। अपने बजट के बारे में कुछ भी पूछिए, या बस बताइए कि क्या खर्च किया — मैं जोड़ दूंगी।",
  gu: "હું એન્જલ છું — Budget Pro ની પોતાની AI આસિસ્ટન્ટ, જેને ધ્રુમિલ પંચાલે બનાવી છે. હું તમારા પૈસાનો પૂરો હિસાબ રાખું છું: બેલેન્સ, ખર્ચ, બચત, EMI અને ગોલ. તમારા બજેટ વિશે કંઈ પણ પૂછો, અથવા બસ કહો કે શું ખર્ચ્યું — હું ઉમેરી દઈશ.",
  hn: "Main Angel hoon — Budget Pro ki apni AI assistant, jise Dhrumil Panchal ne banaya hai. Main aapke paison ka poora hisaab rakhti hoon: balance, kharcha, bachat, EMI aur goals. Apne budget ke baare mein kuch bhi poochiye, ya bas bataiye ki kya kharch kiya — main add kar dungi.",
};

const HELP: T4 = {
  en: "Here's what I can do:\n• Answer: “What's my balance?”, “Food spending last month?”, “Where did my money go?”, “Next EMI?”, “Am I over budget?”\n• Think: “Why did my spending go up?”, “How can I save 1 lakh in 6 months?”, “Can I afford a ₹50,000 phone?”, “Are my goals on track?”, “My 50/30/20 split”\n• Explain: “What is a SIP?”, “How much emergency fund do I need?”, “Avalanche or snowball?”\n• Do: “Add 500 petrol”, “Salary 50000 received”, “Food budget 5000”, “Put 2000 in my bike goal”, “EMI paid”, “Delete the swiggy expense”, “Undo”.\nI understand English, हिंदी, ગુજરાતી and Hinglish — by voice or text.",
  hi: "मैं ये कर सकती हूं:\n• जवाब: “मेरा बैलेंस कितना है?”, “पिछले महीने खाने पर कितना खर्च हुआ?”, “पैसा कहां गया?”, “अगली EMI कब है?”, “बजट पार हुआ क्या?”\n• सोच-समझकर सलाह: “खर्च क्यों बढ़ा?”, “6 महीने में 1 लाख कैसे बचाऊं?”, “क्या मैं ₹50,000 का फोन ले सकता हूं?”, “मेरे गोल सही चल रहे हैं?”, “मेरा 50/30/20”\n• समझाना: “SIP क्या है?”, “इमरजेंसी फंड कितना चाहिए?”, “पहले कौन सा लोन चुकाऊं?”\n• काम: “500 का पेट्रोल जोड़ो”, “50000 सैलरी आई”, “खाने का बजट 5000”, “बाइक गोल में 2000 डालो”, “EMI भर दी”, “swiggy वाला खर्च हटाओ”, “वापस लो”।\nमैं English, हिंदी, ગુજરાતી और Hinglish — बोलकर या लिखकर — समझती हूं।",
  gu: "હું આ કરી શકું છું:\n• જવાબ: “મારું બેલેન્સ કેટલું છે?”, “ગયા મહિને ખાવામાં કેટલો ખર્ચ થયો?”, “પૈસા ક્યાં ગયા?”, “આગલી EMI ક્યારે છે?”, “બજેટ પાર થયું?”\n• વિચારીને સલાહ: “ખર્ચ કેમ વધ્યો?”, “6 મહિનામાં 1 લાખ કેવી રીતે બચાવું?”, “શું હું ₹50,000 નો ફોન લઈ શકું?”, “મારા ગોલ બરાબર ચાલે છે?”, “મારો 50/30/20”\n• સમજાવવું: “SIP શું છે?”, “ઇમરજન્સી ફંડ કેટલું જોઈએ?”, “કઈ લોન પહેલાં ચૂકવું?”\n• કામ: “500 નું પેટ્રોલ ઉમેરો”, “પગાર 50000 આવ્યો”, “ખાવાનું બજેટ 5000”, “બાઇક ગોલમાં 2000 નાખો”, “EMI ભરી દીધી”, “swiggy વાળો ખર્ચ કાઢો”, “પાછું કરો”.\nહું English, हिंदी, ગુજરાતી અને Hinglish — બોલીને કે લખીને — સમજું છું.",
  hn: "Main ye kar sakti hoon:\n• Jawab: “Mera balance kitna hai?”, “Pichle mahine food pe kitna kharcha hua?”, “Paisa kahan gaya?”, “Agli EMI kab hai?”, “Budget cross hua kya?”\n• Soch-samajh kar salah: “Kharcha kyu badha?”, “6 mahine mein 1 lakh kaise bachaun?”, “Kya main ₹50,000 ka phone le sakta hun?”, “Mere goals on track hain?”, “Mera 50/30/20”\n• Samjhana: “SIP kya hai?”, “Emergency fund kitna chahiye?”, “Pehle kaunsa loan chukaun?”\n• Kaam: “500 ka petrol add karo”, “50000 salary aayi”, “Food budget 5000”, “Bike goal mein 2000 daalo”, “EMI bhar di”, “Swiggy wala kharcha hatao”, “Undo karo”.\nMain English, हिंदी, ગુજરાતી aur Hinglish — bolkar ya likhkar — samajhti hoon.",
};

export async function respond(inp: EngineInput): Promise<EngineResult> {
  // Voice: if the main guess isn't understood but one of the browser's other guesses is, use that one.
  if (inp.alts?.length && !inp.ctx?.pending) {
    const today = ymd(todayUTC());
    if (parse(inp.text, today).intent === "unknown") {
      const alt = inp.alts.slice(0, 3).find((a) => parse(a, today).intent !== "unknown");
      if (alt) return { ...(await respondInner({ ...inp, text: alt })), usedText: alt };
    }
  }
  return respondInner(inp);
}

async function respondInner(inp: EngineInput): Promise<EngineResult> {
  const today = ymd(todayUTC());
  const cur = inp.actor.currency || "INR";
  const ctx: AngelContext = { ...(inp.ctx ?? {}) };
  const p = parse(inp.text, today);
  const hasLetters = /\p{L}/u.test(p.norm);
  // very short follow-ups ("food pe?") keep the conversation's language
  const shortFollowUp = p.tokens.length <= 3 && p.lang === "en" && !!ctx.lang;
  // Reply language: the language chosen in Angel's settings on this device → the account's saved language →
  // the language the question was asked in (very short follow-ups keep the conversation's language).
  const savedLang = inp.actor.replyLanguage && inp.actor.replyLanguage !== "auto" ? (inp.actor.replyLanguage as Lang) : null;
  const lang: Lang = inp.langPref !== "auto" ? inp.langPref : savedLang ?? (hasLetters && !shortFollowUp ? p.lang : ctx.lang ?? p.lang);
  ctx.lang = lang;
  const first = inp.actor.name.split(" ")[0];
  let updateMessage: EngineResult["updateMessage"];

  // ---------- 0. forget questions nobody answered for 10 minutes ----------
  if (ctx.pending?.at && Date.now() - ctx.pending.at > PENDING_TTL_MS) {
    if (ctx.pending.kind === "confirm" && ctx.pending.messageId) {
      await claimAction(ctx.pending.messageId, inp.actor._id, "pending", "cancelled");
    }
    ctx.pending = null;
  }

  // ---------- 1. a pending confirmation ("haan" / "nahi") ----------
  if (ctx.pending?.kind === "confirm") {
    const pend = ctx.pending;
    const stored: StoredAction = { kind: pend.action.kind, status: "pending", summary: "", ownerId: pend.action.ownerId, payload: pend.action.payload, needsConfirm: true };
    if (p.intent === "yes") {
      ctx.pending = null;
      if (pend.messageId && !(await claimAction(pend.messageId, inp.actor._id, "pending", "running"))) {
        return { reply: reply(lang, L(lang, { en: "That's already been handled.", hi: "ये पहले ही हो चुका है।", gu: "આ પહેલેથી થઈ ગયું છે.", hn: "Ye pehle hi ho chuka hai." })), ctx };
      }
      const r = await runConfirmed(stored, inp.actor, inp.ip, inp.perms, lang, cur);
      if (pend.messageId) updateMessage = { id: pend.messageId, action: r.action };
      return { reply: { ...r.reply, action: null }, ctx, updateMessage };
    }
    ctx.pending = null;
    if (pend.messageId && (await claimAction(pend.messageId, inp.actor._id, "pending", "cancelled"))) {
      updateMessage = { id: pend.messageId, action: { ...stored, status: "cancelled", needsConfirm: false } };
    }
    if (p.intent === "no" || p.intent === "stop") {
      return { reply: reply(lang, L(lang, { en: "Okay, cancelled.", hi: "ठीक है, रद्द कर दिया।", gu: "બરાબર, રદ કર્યું.", hn: "Theek hai, cancel kar diya." })), ctx, updateMessage };
    }
    // anything else → the user moved on; continue normally below
  }

  // ---------- 2. a pending question ("which goal?", "how much?") ----------
  if (ctx.pending?.kind === "slot") {
    const pend = ctx.pending;
    let filled: Record<string, unknown> | null = null;
    if (pend.slot === "amount" || pend.slot === "emi") {
      const v = p.amount ?? (p.tokens.length === 1 && /^\d+(\.\d+)?$/.test(p.tokens[0]) ? Number(p.tokens[0]) : null);
      if (v) filled = pend.slot === "emi" ? { ...pend.action.payload, emiAmount: v } : { ...pend.action.payload, amount: v };
    } else if (pend.slot === "goal" || pend.slot === "debt" || pend.slot === "entry") {
      const opts = pend.options ?? [];
      const num = p.tokens.map((x) => Number(x)).find((n) => Number.isInteger(n) && n >= 1 && n <= opts.length);
      const byName = matchByName(opts, (o) => o.label, p.tokens);
      const ordinal = /(^| )(first|pehla|pehli|pahela|pahelu|पहला|पहली|પહેલું|પહેલી)( |$)/.test(` ${p.tokens.join(" ")} `) ? 1 : /(^| )(second|dusra|dusri|bijo|biju|दूसरा|दूसरी|બીજું|બીજી)( |$)/.test(` ${p.tokens.join(" ")} `) ? 2 : null;
      const pick = num ? opts[num - 1] : ordinal && opts[ordinal - 1] ? opts[ordinal - 1] : byName.length === 1 ? byName[0] : null;
      if (pick) filled = { ...pend.action.payload, [pend.slot === "goal" ? "goalId" : pend.slot === "debt" ? "debtId" : "entryId"]: pick.id };
    } else if (pend.slot === "category") {
      const total = /(^| )(total|overall|monthly|month|mahine|mahina|महीने|કુલ|poora|pura|sab)( |$)/.test(` ${p.tokens.join(" ")} `);
      const cat = p.expenseCategory ?? (total ? TOTAL : null);
      if (cat) filled = { ...pend.action.payload, category: cat, ...(p.amount && !pend.action.payload.amount ? { amount: p.amount } : {}) };
    } else if (pend.slot === "user" && p.contentWords.length) {
      filled = { ...pend.action.payload, name: titleCase(p.contentWords.slice(0, 3).join(" ")) };
    } else if (pend.slot === "email" && p.email) filled = { ...pend.action.payload, email: p.email };

    if (filled) {
      ctx.pending = null;
      const isSelf = pend.action.ownerId === String(inp.actor._id);
      const owner = isSelf ? inp.actor : await loadUser(pend.action.ownerId);
      if (!owner) return { reply: reply(lang, errorText(lang, new ApiError(404, "User not found."))), ctx };
      const t: Target = { scope: isSelf ? "self" : "user", owner, who: whoOf(isSelf, isSelf ? first : owner.name) };
      const intentMap: Record<ActionKind, Intent> = { add_expense: "add_expense", add_income: "add_income", goal_contribute: "goal_contribute", goal_withdraw: "goal_withdraw", pay_emi: "pay_emi", create_goal: "create_goal", create_debt: "create_debt", delete_record: "delete_entry", edit_record: "edit_last", set_budget: "set_budget", create_user: "create_user", change_plan: "change_plan", delete_user: "delete_user", set_user_status: "disable_user", reset_password: "reset_password" };
      const r = await planAction(intentMap[pend.action.kind], parse("", today), inp, lang, t, cur, today, filled);
      ctx.pending = r.pending ?? null;
      return { reply: r.reply, ctx };
    }
    if (p.intent === "no" || p.intent === "stop") {
      ctx.pending = null;
      return { reply: reply(lang, L(lang, { en: "Okay, cancelled.", hi: "ठीक है, रद्द कर दिया।", gu: "બરાબર, રદ કર્યું.", hn: "Theek hai, cancel kar diya." })), ctx };
    }
    if (p.intent === "unknown" || p.intent === "yes") {
      return { reply: reply(lang, L(lang, { en: "Sorry, I didn't catch that. You can also say “cancel”.", hi: "माफ़ कीजिए, समझ नहीं आया। आप “रद्द करो” भी बोल सकते हैं।", gu: "માફ કરશો, સમજાયું નહીં. તમે “રદ કરો” પણ બોલી શકો.", hn: "Sorry, samajh nahi aaya. Aap “cancel” bhi bol sakte hain." })), ctx };
    }
    ctx.pending = null; // the user moved on to something else
  }

  // ---------- 3. follow-ups ("aur pichle mahine?", "food pe?") ----------
  let intent = p.intent;
  if (
    intent === "unknown" &&
    ctx.lastIntent &&
    QUERY_INTENTS.includes(ctx.lastIntent) &&
    (p.period || p.expenseCategory || p.incomeCategory || p.hits.otherPronoun || (inp.actor.role === "admin" && p.tokens.length <= 4 && p.contentWords.length > 0 && p.tokens.some((tk) => POSSESSIVE.has(phonetic(tk)))))
  )
    intent = ctx.lastIntent;
  // best guesses before giving up
  if (intent === "unknown") {
    if (p.expenseCategory) intent = "expense";
    else if (p.incomeCategory) intent = "income";
    else if (p.period) intent = "overview";
    else if (p.hits.question && (p.hits.self || p.tokens.length <= 3) && !p.amount) intent = "overview";
  }
  if (intent === "unknown" && p.amount && p.tokens.length <= 3) {
    return {
      reply: reply(lang, L(lang, {
        en: `What was ${money(p.amount, cur)} for? Say for example “petrol ${p.amount}” or “salary ${p.amount} received”.`,
        hi: `${money(p.amount, cur)} किस चीज़ के थे? जैसे बोलिए “पेट्रोल ${p.amount}” या “${p.amount} सैलरी आई”।`,
        gu: `${money(p.amount, cur)} શેના હતા? જેમ કે બોલો “પેટ્રોલ ${p.amount}” અથવા “પગાર ${p.amount} આવ્યો”.`,
        hn: `${money(p.amount, cur)} kis cheez ke the? Jaise boliye “petrol ${p.amount}” ya “${p.amount} salary aayi”.`,
      })),
      ctx,
    };
  }
  if (intent === "top_users" && inp.actor.role !== "admin") intent = "top_categories";
  if (intent === "users_query" && inp.actor.role !== "admin") return { reply: deny(lang, "others"), ctx };
  const period = p.period ?? (intent === ctx.lastIntent && !p.period ? unserial(ctx.lastPeriod) : null) ?? thisMonth(today);
  const category = p.expenseCategory ?? p.incomeCategory ?? (intent === ctx.lastIntent && p.intent === "unknown" ? ctx.lastCategory ?? null : null);

  // ---------- 4. small talk ----------
  if (intent === "greet") {
    const text = `${greetingByHour(lang, istHour(), first)} ` + L(lang, { en: "I'm Angel. How can I help with your money today?", hi: "मैं एंजल हूं। आज पैसों से जुड़ी क्या मदद करूं?", gu: "હું એન્જલ છું. આજે પૈસા સંબંધી શું મદદ કરું?", hn: "Main Angel hoon. Aaj paison se judi kya madad karun?" });
    return { reply: reply(lang, text, { suggestions: sug(lang, "start") }), ctx };
  }
  if (intent === "identity") return { reply: reply(lang, L(lang, IDENTITY), { suggestions: sug(lang, "start") }), ctx };
  if (intent === "help") return { reply: reply(lang, L(lang, HELP), { speak: L(lang, { en: "I can answer questions about your money, give saving advice, and add entries for you. Here are some examples.", hi: "मैं आपके पैसों के सवालों का जवाब दे सकती हूं, बचत की सलाह दे सकती हूं और एंट्री जोड़ सकती हूं। ये रहे कुछ उदाहरण।", gu: "હું તમારા પૈસાના સવાલોના જવાબ આપી શકું, બચતની સલાહ આપી શકું અને એન્ટ્રી ઉમેરી શકું. આ રહ્યા થોડા ઉદાહરણ.", hn: "Main aapke paison ke sawaalon ka jawab de sakti hoon, bachat ki salah de sakti hoon aur entries add kar sakti hoon. Ye rahe kuch examples." }), suggestions: sug(lang, "start") }), ctx };
  if (intent === "ack") return { reply: reply(lang, L(lang, { en: "🙂 Anything else you'd like to know?", hi: "🙂 और कुछ जानना है?", gu: "🙂 બીજું કંઈ જાણવું છે?", hn: "🙂 Aur kuch jaanna hai?" }), { suggestions: sug(lang, "money") }), ctx };
  if (intent === "thanks") return { reply: reply(lang, L(lang, { en: "Happy to help! 😊", hi: "खुशी हुई मदद करके! 😊", gu: "મદદ કરીને આનંદ થયો! 😊", hn: "Khushi hui madad karke! 😊" })), ctx };
  if (intent === "stop") return { reply: reply(lang, L(lang, { en: `Bye ${first}! Say “Angel active” whenever you need me.`, hi: `अलविदा ${first}! जब ज़रूरत हो, “एंजल एक्टिव” बोलिए।`, gu: `આવજો ${first}! જરૂર પડે ત્યારે “એન્જલ એક્ટિવ” બોલજો.`, hn: `Bye ${first}! Jab zaroorat ho, “Angel active” boliye.` })), ctx };
  if (intent === "yes" || intent === "no") return { reply: reply(lang, L(lang, { en: "Okay! What would you like to know?", hi: "ठीक है! क्या जानना चाहेंगे?", gu: "બરાબર! શું જાણવું છે?", hn: "Theek hai! Kya jaanna chahenge?" }), { suggestions: sug(lang, "start") }), ctx };

  // ---------- 5. undo ----------
  if (intent === "undo") return { reply: reply(lang, ""), ctx, undo: true }; // the route finds the last action in the chat

  // ---------- 6. who is this about? ----------
  // ---------- 5a. deleting one's OWN account is never done by chat (needs password re-entry) ----------
  if (intent === "delete_account") {
    return {
      reply: reply(lang, L(lang, {
        en: "For your safety I can't delete your own account from chat. Go to Settings → Delete account (it asks for your password). If you only want to remove an entry, say e.g. “delete the swiggy expense”.",
        hi: "सुरक्षा के लिए मैं चैट से आपका अपना अकाउंट डिलीट नहीं कर सकती। Settings → Delete account पर जाइए (पासवर्ड मांगेगा)। सिर्फ़ कोई एंट्री हटानी हो तो बोलिए, जैसे “swiggy वाला खर्च हटाओ”।",
        gu: "સુરક્ષા માટે હું ચેટથી તમારું પોતાનું એકાઉન્ટ ડિલીટ નથી કરી શકતી. Settings → Delete account પર જાઓ (પાસવર્ડ માગશે). ફક્ત કોઈ એન્ટ્રી કાઢવી હોય તો કહો, જેમ કે “swiggy વાળો ખર્ચ કાઢો”.",
        hn: "Safety ke liye main chat se aapka apna account delete nahi kar sakti. Settings → Delete account pe jaiye (password maangega). Sirf koi entry hatani ho to boliye, jaise “swiggy wala kharcha hatao”.",
      })),
      ctx,
    };
  }

  // ---------- 5b. admin: visitors + user management ----------
  if (intent === "visitors" || intent === "delete_user" || intent === "disable_user" || intent === "enable_user" || intent === "reset_password") {
    if (inp.actor.role !== "admin") {
      if (intent === "reset_password")
        return { reply: reply(lang, L(lang, { en: "You can change your password in Settings → Change password. Forgot it? Use “Forgot password” on the sign-in page — a code is emailed to you.", hi: "पासवर्ड Settings → Change password में बदलिए। भूल गए? साइन-इन पेज पर “Forgot password” से ईमेल पर कोड आएगा।", gu: "પાસવર્ડ Settings → Change password માં બદલો. ભૂલી ગયા? સાઇન-ઇન પેજ પર “Forgot password” થી ઈમેલ પર કોડ આવશે.", hn: "Password Settings → Change password mein badliye. Bhool gaye? Sign-in page pe “Forgot password” se email pe code aayega." })), ctx };
      return { reply: deny(lang, intent === "visitors" ? "admin" : "others"), ctx };
    }
    if (intent === "visitors") {
      if (!inp.perms.includes("users.view")) return { reply: deny(lang, "perm"), ctx };
      return { reply: await answerVisitors(lang, p.period, today), ctx };
    }
    const r = await adminUserAction(intent, p, inp, lang, ctx);
    ctx.pending = r.pending ?? null;
    return { reply: r.reply, ctx };
  }

  const ACTIONS: Intent[] = ["add_expense", "add_income", "goal_contribute", "goal_withdraw", "pay_emi", "create_goal", "create_debt", "delete_last", "delete_entry", "edit_last", "set_budget"];
  const wantsWrite = ACTIONS.includes(intent);
  const platformIntent = intent === "platform_summary" || intent === "list_users" || intent === "users_query" || intent === "top_users";
  if (platformIntent && inp.actor.role !== "admin") return { reply: deny(lang, p.hits.platform ? "others" : "admin"), ctx };
  if (platformIntent && !inp.perms.includes("users.view")) return { reply: deny(lang, "perm"), ctx };

  if (intent === "create_user") {
    const r = await planAction(intent, p, inp, lang, { scope: "self", owner: inp.actor, who: whoOf(true, first) }, cur, today);
    ctx.pending = r.pending ?? null;
    return { reply: r.reply, ctx };
  }

  const tr = platformIntent ? null : await resolveTarget(p, inp, lang, wantsWrite || intent === "change_plan", intent);
  if (tr && !tr.ok) return { reply: tr.reply, ctx };
  const t: Target = tr && tr.ok ? tr.t : { scope: "platform", owner: inp.actor, who: whoOf(false, "All users") };
  if (t.scope === "user") {
    ctx.lastUserId = String(t.owner._id);
    ctx.lastUserName = t.owner.name;
  } else if (t.scope === "self") ctx.lastUserId = null;
  if (!wantsWrite && t.scope === "self" && !inp.perms.includes("finance.read") && intent !== "unknown") return { reply: deny(lang, "perm"), ctx };

  // ---------- 7. actions ----------
  if (wantsWrite || intent === "change_plan") {
    const r = await planAction(intent, p, inp, lang, t, cur, today);
    ctx.pending = r.pending ?? null;
    if (t.note) r.reply.text = `${t.note}\n${r.reply.text}`;
    return { reply: r.reply, ctx };
  }

  // ---------- 8. questions ----------
  let out: EngineReply;
  const platform = t.scope === "platform";
  switch (intent) {
    case "balance":
      out = platform ? await answerPlatform(lang, cur, { kind: "all", start: new Date(0), end: new Date(Date.UTC(2101, 0, 1)) }) : await answerBalance(lang, t, cur, today);
      break;
    case "expense":
    case "income":
    case "savings":
      out = await answerFlow(intent, lang, t, cur, period, category);
      break;
    case "top_categories":
      out = await answerTop(lang, t, cur, period);
      break;
    case "compare": {
      // "pichle mahine se compare karo" = this month vs last month
      const base = p.period && (p.period.kind === "lastMonth" || p.period.kind === "lastWeek" || p.period.kind === "lastYear") ? null : p.period;
      out = await answerCompare(lang, t, cur, base ?? thisMonth(today));
      break;
    }
    case "largest":
      out = platform ? await answerTop(lang, t, cur, period) : await answerLargest(lang, t, cur, period);
      break;
    case "recent":
      out = platform ? await answerListUsers(lang) : await answerRecent(lang, t, cur);
      break;
    case "debts":
      out = await answerDebts(lang, t, cur, today);
      break;
    case "goals":
      out = await answerGoals(lang, t, cur, today, p.contentWords);
      break;
    case "health":
      out = await answerHealth(lang, t);
      break;
    case "insights":
      out = await answerInsights(lang, t, cur);
      break;
    case "explain_change":
      out = platform ? await answerPlatform(lang, cur, period) : await answerExplain(lang, t, cur, today);
      break;
    case "budget_status":
      out = await answerBudgets(lang, t, cur, p.expenseCategory);
      break;
    case "rule_503020":
      out = await answer503020(lang, t, cur, today);
      break;
    case "emergency_fund":
      out = await answerEmergency(lang, t, cur, today);
      break;
    case "subscriptions":
      out = await answerSubscriptions(lang, t, cur);
      break;
    case "kb":
      out = await answerKb(lang, p.kbTopic ?? "budgeting", t, cur, today);
      break;
    case "forecast":
      out = await answerForecast(lang, t, cur, today);
      break;
    case "average":
      out = await answerAverage(lang, t, cur, period, today, category);
      break;
    case "advice": {
      const ai = await advisorInput(lang, t, cur, today);
      const r = planSavings(ai, { amount: p.amount, months: p.dates.months, deadline: p.dates.deadline, perMonth: p.dates.perMonth });
      out = reply(lang, r.text, {
        speak: r.speak,
        cards: r.cuts.length ? [{ type: "list", title: L(lang, { en: "Where to cut", hi: "कहां कटौती करें", gu: "ક્યાં કાપ મૂકવો", hn: "Kahan katauti karein" }), items: r.cuts.map((c) => ({ title: catLabel(lang, c.category), subtitle: `${money(c.from, cur)} → ${money(c.to, cur)}`, value: `+${money(c.save, cur)}`, tone: "pos" as const })) }] : [],
        suggestions: r.suggestGoal ? [L(lang, { en: "Yes", hi: "हाँ", gu: "હા", hn: "Haan" }), ...sug(lang, "advice")].slice(0, 3) : sug(lang, "advice"),
      });
      if (r.suggestGoal && t.scope === "self" && canWrite(inp.perms, t, "goal", "create")) {
        const payload = { name: r.suggestGoal.name, targetAmount: r.suggestGoal.target, currentAmount: 0, targetDate: r.suggestGoal.targetDate, status: "active", notes: "Created by Angel AI from a saving plan" };
        out.action = { kind: "create_goal", status: "pending", summary: `${r.suggestGoal.name} · ${money(r.suggestGoal.target, cur)} · ${dateLabel(lang, r.suggestGoal.targetDate)}`, ownerId: String(t.owner._id), needsConfirm: true, payload };
        ctx.pending = { kind: "confirm", action: { kind: "create_goal", ownerId: String(t.owner._id), payload } };
      }
      break;
    }
    case "afford": {
      const ai = await advisorInput(lang, t, cur, today);
      const r = checkAfford(ai, p.amount ?? 0);
      out = reply(lang, r.text, { suggestions: sug(lang, "advice") });
      break;
    }
    case "platform_summary":
      out = await answerPlatform(lang, cur, p.period ?? thisMonth(today));
      break;
    case "list_users":
      out = await answerListUsers(lang);
      break;
    case "user_info":
    case "profile":
      out = t.scope === "platform" ? await answerListUsers(lang) : await answerProfile(lang, t, cur, p, today);
      break;
    case "overview":
      out = platform ? await answerPlatform(lang, cur, period) : await answerOverview(lang, t, cur, period, today);
      break;
    case "top_users":
      out = await answerTopUsers(lang, cur, period, p);
      break;
    case "users_query":
      out = await answerUsersQuery(lang, p, today);
      break;
    default: {
      // Nothing matched: answer kindly, say what Angel can do, and offer questions that fit THIS user —
      // starting with what the learned model THINKS was meant ("Did you mean…?").
      const debts = await T.debtsOf(String(inp.actor._id));
      const guesses = p.ml.ranked
        .filter((r) => r.score >= 0.16 && DID_YOU_MEAN[r.intent] && (inp.actor.role === "admin" || !ADMIN_ONLY.has(r.intent)))
        .slice(0, 2)
        .map((r) => L(lang, DID_YOU_MEAN[r.intent]));
      const personal = [
        ...guesses,
        L(lang, { en: "How am I doing this month?", hi: "इस महीने मेरा हिसाब बताओ", gu: "આ મહિને મારો હિસાબ બતાવો", hn: "Is mahine ka hisaab batao" }),
        debts.length ? L(lang, { en: "When is my next EMI?", hi: "अगली EMI कब है?", gu: "આગલી EMI ક્યારે છે?", hn: "Agli EMI kab hai?" }) : L(lang, { en: "Where did most of my money go?", hi: "सबसे ज़्यादा खर्च कहां हुआ?", gu: "સૌથી વધુ ખર્ચ ક્યાં થયો?", hn: "Sabse zyada kharcha kahan hua?" }),
        inp.actor.role === "admin" ? L(lang, { en: "How many users are there?", hi: "कितने यूज़र हैं?", gu: "કેટલા યુઝર છે?", hn: "Kitne users hain?" }) : L(lang, { en: "How can I save more?", hi: "ज़्यादा बचत कैसे करूं?", gu: "વધુ બચત કેવી રીતે કરું?", hn: "Zyada bachat kaise karun?" }),
      ];
      const text = L(lang, {
        en: `I didn't quite get that, ${first}. I can tell you your balance, spending, savings, EMIs and goals, give saving advice, or add entries when you say things like “500 petrol”. Try one of these:`,
        hi: `${first}, ये बात मैं ठीक से समझ नहीं पाई। मैं आपका बैलेंस, खर्च, बचत, EMI और गोल बता सकती हूं, बचत की सलाह दे सकती हूं, या “500 का पेट्रोल” जैसा बोलने पर एंट्री जोड़ सकती हूं। ये पूछकर देखिए:`,
        gu: `${first}, આ વાત હું બરાબર સમજી નહીં. હું તમારું બેલેન્સ, ખર્ચ, બચત, EMI અને ગોલ કહી શકું, બચતની સલાહ આપી શકું, અથવા “500 નું પેટ્રોલ” જેવું બોલો તો એન્ટ્રી ઉમેરી શકું. આ પૂછી જુઓ:`,
        hn: `${first}, ye baat main theek se samajh nahi paayi. Main aapka balance, kharcha, bachat, EMI aur goals bata sakti hoon, bachat ki salah de sakti hoon, ya “500 ka petrol” jaisa bolne pe entry add kar sakti hoon. Ye poochkar dekhiye:`,
      });
      const lead = guesses.length ? L(lang, { en: "Did you mean one of these? ", hi: "क्या आपका मतलब इनमें से कुछ था? ", gu: "શું તમારો મતલબ આમાંથી કંઈક હતો? ", hn: "Kya aapka matlab inme se kuch tha? " }) : "";
      out = reply(lang, lead + text, { speak: (lead || text.split(/[.।]/)[0]), suggestions: personal.slice(0, 3) });
      return { reply: out, ctx };
    }
  }
  // ---------- 9. think: one short line of context (vs. your usual, money set aside in goals, …) ----------
  if (["expense", "balance", "income", "savings"].includes(intent)) {
    const extra = await thinkAbout(lang, intent, t, cur, period, category, today);
    if (extra) out.text = `${out.text}\n${extra}`;
  }
  if (t.note) out.text = `${t.note}\n${out.text}`;
  if (QUERY_INTENTS.includes(intent)) {
    ctx.lastIntent = intent;
    ctx.lastPeriod = serial(period);
    ctx.lastCategory = category;
  }
  return { reply: out, ctx, updateMessage };
}

export function undoText(lang: Lang, ok: boolean, summary?: string, err?: unknown): string {
  if (!ok && err) return errorText(lang, err);
  if (!ok)
    return L(lang, {
      en: "There's nothing recent to undo.",
      hi: "हाल में ऐसा कुछ नहीं है जिसे वापस लिया जा सके।",
      gu: "તાજેતરમાં પાછું કરવા જેવું કંઈ નથી.",
      hn: "Haal mein aisa kuch nahi hai jise undo kiya ja sake.",
    });
  return L(lang, {
    en: `↩︎ Undone: ${summary}.`,
    hi: `↩︎ वापस ले लिया: ${summary}।`,
    gu: `↩︎ પાછું કરી દીધું: ${summary}.`,
    hn: `↩︎ Undo kar diya: ${summary}.`,
  });
}

export function cancelText(lang: Lang): string {
  return L(lang, { en: "Okay, cancelled.", hi: "ठीक है, रद्द कर दिया।", gu: "બરાબર, રદ કર્યું.", hn: "Theek hai, cancel kar diya." });
}
