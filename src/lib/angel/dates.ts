// Angel AI — periods ("pichle mahine", "આ વર્ષે", "last 3 months", "October") and dates ("kal", "5 tarikh").
// All dates are UTC-midnight calendar days, exactly like the rest of Budget Pro stores them.
import { phonetic } from "./text";
import { smallNumber } from "./numbers";

export type PeriodKind = "today" | "yesterday" | "week" | "lastWeek" | "month" | "lastMonth" | "year" | "lastYear" | "lastNMonths" | "lastNDays" | "namedMonth" | "all";

export interface Period {
  kind: PeriodKind;
  start: Date; // inclusive
  end: Date; // exclusive
  n?: number;
  monthKey?: string; // YYYY-MM for month periods
}

const DAY = 86400000;
export const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
const monthKeyOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

const MONTHS: string[][] = [
  ["january", "jan", "जनवरी", "જાન્યુઆરી", "janvari"],
  ["february", "feb", "फरवरी", "फ़रवरी", "ફેબ્રુઆરી", "farvari", "febuary"],
  ["march", "मार्च", "માર્ચ"],
  ["april", "apr", "अप्रैल", "એપ્રિલ", "aprail"],
  ["=may", "मई", "=મે"],
  ["june", "jun", "जून", "જૂન"],
  ["july", "jul", "जुलाई", "જુલાઈ", "જુલાઇ", "julai"],
  ["august", "aug", "अगस्त", "ઓગસ્ટ", "agast", "ogast"],
  ["september", "sep", "sept", "सितंबर", "सितम्बर", "સપ્ટેમ્બર", "sitambar"],
  ["october", "oct", "अक्टूबर", "अक्तूबर", "ઓક્ટોબર", "aktubar", "octobar"],
  ["november", "nov", "नवंबर", "नवम्बर", "નવેમ્બર", "navambar"],
  ["december", "dec", "दिसंबर", "दिसम्बर", "ડિસેમ્બર", "disambar"],
];
const MONTH_LOOKUP = new Map<string, { m: number; strict: boolean }>();
MONTHS.forEach((names, m) =>
  names.forEach((n) => {
    const strict = n.startsWith("=");
    MONTH_LOOKUP.set(phonetic(n.replace(/^=/, "")), { m, strict });
  }),
);

const w = (arr: string[]) => new Set(arr.map(phonetic));
const MONTH_WORD = w(["month", "months", "mahina", "mahine", "mahino", "mahinon", "mahinao", "mahinama", "mahinanu", "महीना", "महीने", "महीनों", "माह", "મહિનો", "મહિને", "મહિના", "મહિનામાં", "મહિનાઓ", "mahinane"]);
const YEAR_WORD = w(["year", "years", "saal", "sal", "varsh", "varas", "बरस", "साल", "वर्ष", "વર્ષ", "વર્ષે", "વર્ષમાં", "varshe"]);
const DAY_WORD = w(["day", "days", "din", "dino", "divas", "दिन", "दिनों", "દિવસ", "દિવસમાં"]);
const WEEK_WORD = w(["week", "weeks", "hafta", "hafte", "saptah", "athvadiya", "athvadiye", "हफ्ता", "हफ्ते", "हफ़्ते", "सप्ताह", "અઠવાડિયું", "અઠવાડિયે", "અઠવાડિયા"]);
const THIS = w(["this", "is", "iss", "current", "chalu", "is", "इस", "આ", "aa", "a", "ye", "yeh", "abhi", "આજના"]);
const LAST = w(["last", "previous", "pichle", "pichhle", "pichla", "pichhla", "pichli", "gaya", "gaye", "gayu", "chhella", "chhelle", "chhelli", "पिछले", "पिछला", "पिछली", "ગયા", "ગયો", "ગયું", "છેલ્લા", "છેલ્લે", "past", "pehle"]);
const TODAY = w(["today", "aaj", "aaje", "आज", "આજે", "આજ"]);
const YESTERDAY = w(["yesterday", "kal", "kaal", "gaikal", "gaikale", "कल", "ગઈકાલે", "ગઇકાલે", "ગઈકાલ"]);
const DAY_BEFORE = w(["parso", "parson", "परसों", "परसो", "પરમદિવસે", "parmdivase"]);
const ALL_TIME = w(["total", "overall", "lifetime", "kul", "कुल", "કુલ"]);
const ALL_PHRASES = [["all", "time"], ["ab", "tak"], ["aaj", "tak"], ["abhi", "tak"], ["ajtak"], ["atyar", "sudhi"], ["aaj", "sudhi"], ["अब", "तक"], ["आज", "तक"], ["અત્યાર", "સુધી"], ["આજ", "સુધી"], ["so", "far"], ["till", "now"], ["till", "date"]].map((p) => p.map(phonetic));
const DATE_WORD = w(["tarikh", "tareekh", "tarik", "date", "तारीख", "तारीख़", "તારીખ", "taarikh"]);
const BY_WORD = w(["tak", "by", "before", "sudhi", "sudhima", "तक", "સુધી", "સુધીમાં", "until", "till"]);
const IN_WORD = w(["in", "mein", "me", "main", "ma", "maa", "within", "में", "માં", "મા"]);
const PER_MONTH = [["per", "month"], ["har", "mahine"], ["har", "mahina"], ["dar", "mahine"], ["monthly"], ["mahina", "ka"], ["every", "month"], ["a", "month"], ["हर", "महीने"], ["प्रति", "माह"], ["दર", "મહિને"], ["દર", "મહિને"], ["મહિને"], ["har", "month"]].map((p) => p.map(phonetic));

function hasPhrase(p: string[], phrase: string[]): number {
  outer: for (let i = 0; i + phrase.length <= p.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (p[i + j] !== phrase[j]) continue outer;
    return i;
  }
  return -1;
}

export interface DateInfo {
  period: Period | null;
  /** explicit day for an action ("kal", "5 tarikh"), YYYY-MM-DD */
  date: string | null;
  /** relative deadline in months ("6 mahine mein", "1 saal mein") */
  months: number | null;
  /** absolute deadline ("december tak") YYYY-MM-DD */
  deadline: string | null;
  perMonth: boolean;
  /** token indexes that belong to dates — never amounts */
  used: Set<number>;
}

export function parseDates(tokens: string[], todayStr: string): DateInfo {
  const p = tokens.map(phonetic);
  const today = parseYmd(todayStr);
  const y = today.getUTCFullYear();
  const mo = today.getUTCMonth();
  const used = new Set<number>();
  let period: Period | null = null;
  let date: string | null = null;
  let months: number | null = null;
  let deadline: string | null = null;

  const monthPeriod = (yy: number, mm: number, kind: PeriodKind): Period => {
    const start = utc(yy, mm, 1);
    return { kind, start, end: utc(yy, mm + 1, 1), monthKey: monthKeyOf(start) };
  };

  // --- "pichle 3 mahine", "last 7 days", "6 mahine mein", "1 saal mein" ---
  for (let i = 0; i < p.length; i++) {
    const n = smallNumber(tokens[i]);
    if (n === null || n === 0) continue;
    const unit = p[i + 1];
    if (unit === undefined) continue;
    const isMonth = MONTH_WORD.has(unit);
    const isYear = YEAR_WORD.has(unit);
    const isDay = DAY_WORD.has(unit);
    const isWeek = WEEK_WORD.has(unit);
    if (!isMonth && !isYear && !isDay && !isWeek) continue;
    const prevLast = i > 0 && LAST.has(p[i - 1]);
    const nextIn = p[i + 2] !== undefined && (IN_WORD.has(p[i + 2]) || BY_WORD.has(p[i + 2]));
    const attachedIn = /(માં|મા|में)$/.test(tokens[i + 1]);
    used.add(i).add(i + 1);
    if (prevLast) used.add(i - 1);
    if (prevLast || (!nextIn && !attachedIn && (isDay || isMonth) && !months)) {
      // a look-back window (only when clearly "last N")
      if (prevLast) {
        if (isMonth) {
          const start = utc(y, mo - (n - 1), 1);
          period = { kind: "lastNMonths", start, end: new Date(today.getTime() + DAY), n };
        } else if (isDay || isWeek) {
          const days = isWeek ? n * 7 : n;
          period = { kind: "lastNDays", start: new Date(today.getTime() - (days - 1) * DAY), end: new Date(today.getTime() + DAY), n: days };
        } else if (isYear) {
          period = { kind: "lastNMonths", start: utc(y, mo - (n * 12 - 1), 1), end: new Date(today.getTime() + DAY), n: n * 12 };
        }
        continue;
      }
    }
    if (nextIn || attachedIn || isMonth || isYear) {
      months = isYear ? n * 12 : isMonth ? n : isWeek ? Math.max(1, Math.round((n * 7) / 30)) : Math.max(1, Math.round(n / 30));
      if (nextIn) used.add(i + 2);
    }
  }

  // --- explicit relative days ---
  const idx = (set: Set<string>) => p.findIndex((t) => set.has(t));
  const iToday = idx(TODAY);
  const iYest = idx(YESTERDAY);
  const iBefore = idx(DAY_BEFORE);
  const allIdx = ALL_PHRASES.map((ph) => hasPhrase(p, ph)).find((x) => x >= 0) ?? -1;

  // "this/last week|month|year"
  for (let i = 0; i < p.length; i++) {
    const t = p[i];
    const prev = p[i - 1];
    const isThis = prev !== undefined && THIS.has(prev);
    const isLast = prev !== undefined && LAST.has(prev);
    if (MONTH_WORD.has(t) && (isThis || isLast) && !(period && period.kind === "lastNMonths")) {
      period = isLast ? monthPeriod(y, mo - 1, "lastMonth") : monthPeriod(y, mo, "month");
      used.add(i).add(i - 1);
    } else if (YEAR_WORD.has(t) && (isThis || isLast)) {
      period = isLast ? { kind: "lastYear", start: utc(y - 1, 0, 1), end: utc(y, 0, 1) } : { kind: "year", start: utc(y, 0, 1), end: utc(y + 1, 0, 1) };
      used.add(i).add(i - 1);
    } else if (WEEK_WORD.has(t) && (isThis || isLast)) {
      const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
      const monday = new Date(today.getTime() - dow * DAY);
      period = isLast
        ? { kind: "lastWeek", start: new Date(monday.getTime() - 7 * DAY), end: monday }
        : { kind: "week", start: monday, end: new Date(monday.getTime() + 7 * DAY) };
      used.add(i).add(i - 1);
    }
  }
  // gujarati attached forms: "આ મહિને" handled above; "ગયા મહિને" too. "mahine" alone after "is" handled.

  // --- named months ("October", "अक्टूबर 2025", "5 november") ---
  for (let i = 0; i < p.length; i++) {
    const hit = MONTH_LOOKUP.get(p[i]);
    if (!hit) continue;
    const yearTok = [tokens[i + 1], tokens[i - 1]].find((t) => t && /^(19|20)\d{2}$/.test(t));
    const nearMonthWord = MONTH_WORD.has(p[i + 1] ?? "") || MONTH_WORD.has(p[i - 1] ?? "");
    const dayBefore = i > 0 ? smallNumber(tokens[i - 1]) : null;
    const dayAfter = smallNumber(tokens[i + 1] ?? "");
    if (hit.strict && !yearTok && !nearMonthWord && dayBefore === null && dayAfter === null && !BY_WORD.has(p[i + 1] ?? "")) continue;
    used.add(i);
    let yy = yearTok ? Number(yearTok) : y;
    if (yearTok) used.add(tokens.indexOf(yearTok, Math.max(0, i - 1)));
    const isDeadline = BY_WORD.has(p[i + 1] ?? "") || BY_WORD.has(p[i + 2] ?? "");
    if (isDeadline) {
      [i + 1, i + 2].forEach((k) => BY_WORD.has(p[k] ?? "") && used.add(k));
      if (!yearTok && hit.m < mo) yy = y + 1; // "march tak" in October → next March
      deadline = ymd(utc(yy, hit.m + 1, 0));
      continue;
    }
    if (!yearTok && hit.m > mo) yy = y - 1; // "December" asked in October → last December
    const day = dayBefore !== null && dayBefore >= 1 && dayBefore <= 31 ? dayBefore : dayAfter !== null && dayAfter >= 1 && dayAfter <= 31 ? dayAfter : null;
    if (day !== null) {
      const d = utc(yy, hit.m, day);
      if (d.getUTCMonth() === hit.m) {
        date = ymd(d);
        used.add(dayBefore === day ? i - 1 : i + 1);
      }
    }
    period = monthPeriod(yy, hit.m, "namedMonth");
  }

  // --- "5 tarikh", "5th" ---
  for (let i = 0; i < tokens.length; i++) {
    const ord = /^(\d{1,2})(st|nd|rd|th)$/.exec(tokens[i]);
    let day: number | null = null;
    if (ord) day = Number(ord[1]);
    else if (DATE_WORD.has(p[i + 1] ?? "")) day = smallNumber(tokens[i]);
    else if (DATE_WORD.has(p[i - 1] ?? "") && smallNumber(tokens[i]) !== null) day = smallNumber(tokens[i]);
    if (day === null || day < 1 || day > 31 || date) continue;
    let d = utc(y, mo, day);
    if (d.getTime() > today.getTime()) d = utc(y, mo - 1, day);
    date = ymd(d);
    used.add(i);
    if (DATE_WORD.has(p[i + 1] ?? "")) used.add(i + 1);
    if (DATE_WORD.has(p[i - 1] ?? "")) used.add(i - 1);
  }

  // --- year alone: "2025 mein kitna kharcha" ---
  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i) || !/^(19|20)\d{2}$/.test(tokens[i])) continue;
    const yy = Number(tokens[i]);
    if (yy < 2000 || yy > y + 5) continue;
    const near = [p[i + 1], p[i - 1]].some((t) => t !== undefined && (YEAR_WORD.has(t) || IN_WORD.has(t) || BY_WORD.has(t)));
    if (!near && tokens.length > 3) continue;
    used.add(i);
    if (BY_WORD.has(p[i + 1] ?? "")) deadline = ymd(utc(yy, 11, 31));
    else if (!period) period = { kind: "lastYear", start: utc(yy, 0, 1), end: utc(yy + 1, 0, 1) };
  }

  if (iToday >= 0 && !(allIdx >= 0 && p[allIdx] === p[iToday])) {
    used.add(iToday);
    if (!date) date = todayStr;
    if (!period) period = { kind: "today", start: today, end: new Date(today.getTime() + DAY) };
  }
  if (iYest >= 0) {
    used.add(iYest);
    const d = new Date(today.getTime() - DAY);
    if (!date) date = ymd(d);
    if (!period || period.kind === "today") period = { kind: "yesterday", start: d, end: today };
  }
  if (iBefore >= 0) {
    used.add(iBefore);
    const d = new Date(today.getTime() - 2 * DAY);
    if (!date) date = ymd(d);
    if (!period) period = { kind: "yesterday", start: d, end: new Date(d.getTime() + DAY) };
  }
  if (allIdx >= 0) {
    period = { kind: "all", start: utc(1970, 0, 1), end: utc(2101, 0, 1) };
    // "aaj tak" is all-time, not today
    if (date === todayStr && iToday === allIdx) date = null;
  } else if (!period && p.some((t) => ALL_TIME.has(t))) {
    period = { kind: "all", start: utc(1970, 0, 1), end: utc(2101, 0, 1) };
  }

  const perMonth = PER_MONTH.some((ph) => hasPhrase(p, ph) >= 0);
  return { period, date, months, deadline, perMonth, used };
}

export function thisMonth(todayStr: string): Period {
  const t = parseYmd(todayStr);
  const start = utc(t.getUTCFullYear(), t.getUTCMonth(), 1);
  return { kind: "month", start, end: utc(t.getUTCFullYear(), t.getUTCMonth() + 1, 1), monthKey: monthKeyOf(start) };
}

export function addMonths(dateStr: string, n: number): string {
  const d = parseYmd(dateStr);
  const target = utc(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
  const last = utc(target.getUTCFullYear(), target.getUTCMonth() + 1, 0).getUTCDate();
  return ymd(utc(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), last)));
}

export function monthsBetween(fromStr: string, toStr: string): number {
  const a = parseYmd(fromStr);
  const b = parseYmd(toStr);
  return Math.max(1, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + (b.getUTCDate() >= a.getUTCDate() ? 0 : -1) || 1);
}
