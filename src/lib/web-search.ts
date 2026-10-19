// Web look-up for Angel AI — used only for questions that are NOT about the user's own Budget Pro data
// (general knowledge, live rates, news, "google karo …"). Answers are taken word-for-word from the sources
// (no AI rewriting) and always shown with links, so the user can check them.
//
// Providers, best first (set any ONE key for Google-quality results; without keys the free sources are used):
//   SERPER_API_KEY        → Google results via serper.dev (2,500 free searches)
//   BRAVE_SEARCH_API_KEY  → Brave Search API
//   TAVILY_API_KEY        → Tavily search (1,000 free credits / month)
//   GOOGLE_CSE_KEY + GOOGLE_CSE_CX → Google Programmable Search (old accounts only)
//   (always available)    → Wikipedia (English, हिंदी, ગુજરાતી) + DuckDuckGo instant answers — free, no key

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface WebAnswer {
  /** a short answer in the source's own words (null when only links were found) */
  answer: string | null;
  results: WebResult[];
  provider: string;
  query: string;
}

const UA = `BudgetPro/2.0 (+${(process.env.APP_URL || "https://budget.dhrumilpanchal.in").replace(/\/$/, "")})`;
const TIMEOUT = 4500;
type Lang = "en" | "hi" | "gu" | "hn";

// ---------------- small cache (per warm server instance) ----------------
const cache = new Map<string, { at: number; v: WebAnswer | null }>();
const TTL = 10 * 60 * 1000;
function cached(k: string): WebAnswer | null | undefined {
  const hit = cache.get(k);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL) {
    cache.delete(k);
    return undefined;
  }
  return hit.v;
}
function remember(k: string, v: WebAnswer | null) {
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  cache.set(k, { at: Date.now(), v });
}

async function getJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const safeUrl = (u: unknown): string | null => {
  try {
    const x = new URL(String(u));
    return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : null;
  } catch {
    return null;
  }
};
function result(title: unknown, url: unknown, snippet: unknown): WebResult | null {
  const u = safeUrl(url);
  if (!u) return null;
  return { title: clean(title).slice(0, 140) || host(u), url: u, snippet: clean(snippet).slice(0, 400), source: host(u) };
}

// ---------------- query clean-up ----------------
// Filler words people add around a question in English / Hindi / Gujarati / Hinglish.
const FILLER = new Set(
  "angel please pls plz google search karo kar karke karna kariye kijiye dekho dekh batao bata bataiye bolo tell me find look up internet online web net pe par par se mujhe muje hame mane maane jara zara ek baar kya hai hain h che chhe shu su what is are the a an about on of for to me ka ki ke ko se mein me ma nu ni no na ne thi do".split(" "),
);
const QWORDS: Record<string, string> = { kaun: "who", kon: "who", kaunsa: "which", kab: "when", kyare: "when", kahan: "where", kaha: "where", kya: "", kitna: "how much", kitne: "how many", ketla: "how much", kaise: "how", kevi: "how", kem: "why", kyu: "why", kyon: "why", aaj: "today", aajka: "today", today: "today" };

export function cleanQuery(text: string): string {
  const words = text
    .replace(/[?？!।.,"“”]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (lw in QWORDS) {
      if (QWORDS[lw] && !out.includes(QWORDS[lw])) out.push(QWORDS[lw]);
      continue;
    }
    if (FILLER.has(lw)) continue;
    out.push(w);
  }
  const q = out.join(" ").trim();
  return q.length >= 2 ? q : text.trim();
}

// ---------------- extractive answer ----------------
function bestSentences(query: string, texts: string[], max = 2): string | null {
  const terms = new Set(
    query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 2),
  );
  const sents: { s: string; score: number; i: number }[] = [];
  texts.forEach((t, ti) => {
    t.split(/(?<=[.!?।])\s+/).forEach((s, si) => {
      const st = s.trim();
      if (st.length < 25 || st.length > 400) return;
      const lw = st.toLowerCase();
      let score = 0;
      terms.forEach((x) => lw.includes(x) && (score += 1));
      if (/\d/.test(st)) score += 0.3; // facts usually have numbers
      score -= ti * 0.15 + si * 0.05; // prefer the top results / first sentences
      sents.push({ s: st, score, i: ti * 100 + si });
    });
  });
  const top = sents.filter((x) => x.score > 0.5).sort((a, b) => b.score - a.score).slice(0, max).sort((a, b) => a.i - b.i);
  return top.length ? top.map((x) => x.s).join(" ") : null;
}

// ---------------- providers ----------------
async function serper(q: string, lang: Lang): Promise<WebAnswer | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await getJson("https://google.serper.dev/search", { method: "POST", headers: { "X-API-KEY": key, "Content-Type": "application/json" }, body: JSON.stringify({ q, gl: "in", hl: lang === "hi" ? "hi" : lang === "gu" ? "gu" : "en", num: 6 }) });
  const results = ((d.organic ?? []) as unknown[]).map((r) => {
    const x = r as { title?: string; link?: string; snippet?: string };
    return result(x.title, x.link, x.snippet);
  }).filter(Boolean) as WebResult[];
  const box = d.answerBox ?? {};
  const kg = d.knowledgeGraph ?? {};
  const answer = clean(box.answer || box.snippet || (box.snippetHighlighted ?? []).join(" ") || kg.description) || bestSentences(q, results.map((r) => r.snippet));
  return { answer: answer || null, results: results.slice(0, 5), provider: "Google", query: q };
}

async function brave(q: string, lang: Lang): Promise<WebAnswer | null> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await getJson(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=6&country=in&search_lang=${lang === "hi" ? "hi" : lang === "gu" ? "gu" : "en"}`, { headers: { "X-Subscription-Token": key } });
  const results = ((d.web?.results ?? []) as unknown[]).map((r) => {
    const x = r as { title?: string; url?: string; description?: string };
    return result(x.title, x.url, x.description);
  }).filter(Boolean) as WebResult[];
  return { answer: bestSentences(q, results.map((r) => r.snippet)), results: results.slice(0, 5), provider: "Brave Search", query: q };
}

async function tavily(q: string): Promise<WebAnswer | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await getJson("https://api.tavily.com/search", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q, search_depth: "basic", max_results: 6, include_answer: false }) });
  const results = ((d.results ?? []) as unknown[]).map((r) => {
    const x = r as { title?: string; url?: string; content?: string };
    return result(x.title, x.url, x.content);
  }).filter(Boolean) as WebResult[];
  return { answer: bestSentences(q, results.map((r) => r.snippet)), results: results.slice(0, 5), provider: "Tavily", query: q };
}

async function googleCse(q: string, lang: Lang): Promise<WebAnswer | null> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await getJson(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(q)}&num=6&gl=in&hl=${lang === "hi" ? "hi" : lang === "gu" ? "gu" : "en"}`);
  const results = ((d.items ?? []) as unknown[]).map((r) => {
    const x = r as { title?: string; link?: string; snippet?: string };
    return result(x.title, x.link, x.snippet);
  }).filter(Boolean) as WebResult[];
  return { answer: bestSentences(q, results.map((r) => r.snippet)), results: results.slice(0, 5), provider: "Google", query: q };
}

async function wikipedia(q: string, wl: "en" | "hi" | "gu"): Promise<WebAnswer | null> {
  const base = `https://${wl}.wikipedia.org`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = await getJson(`${base}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&format=json&utf8=1`);
  const hits = (s.query?.search ?? []) as { title: string; snippet: string }[];
  if (!hits.length) return null;
  const top = hits[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sum: any = await getJson(`${base}/api/rest_v1/page/summary/${encodeURIComponent(top.title.replace(/ /g, "_"))}`).catch(() => null);
  const extract = clean(sum?.extract);
  const url = safeUrl(sum?.content_urls?.desktop?.page) ?? `${base}/wiki/${encodeURIComponent(top.title.replace(/ /g, "_"))}`;
  const results = hits.map((h, i) => result(h.title, i === 0 ? url : `${base}/wiki/${encodeURIComponent(h.title.replace(/ /g, "_"))}`, i === 0 && extract ? extract : h.snippet)).filter(Boolean) as WebResult[];
  const answer = extract ? extract.split(/(?<=[.!?।])\s+/).slice(0, 3).join(" ").slice(0, 600) : null;
  return { answer, results, provider: "Wikipedia", query: q };
}

async function duckduckgo(q: string): Promise<WebAnswer | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await getJson(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&no_redirect=1`);
  const answer = clean(d.Answer || d.AbstractText || d.Definition);
  const results: WebResult[] = [];
  const main = result(d.Heading || q, d.AbstractURL || d.DefinitionURL, d.AbstractText || d.Definition);
  if (main) results.push(main);
  for (const t of (d.RelatedTopics ?? []) as { Text?: string; FirstURL?: string }[]) {
    if (results.length >= 4) break;
    const r = t.FirstURL ? result(t.Text?.split(" - ")[0], t.FirstURL, t.Text) : null;
    if (r) results.push(r);
  }
  if (!answer && !results.length) return null;
  return { answer: answer || null, results, provider: "DuckDuckGo", query: q };
}

/** A Google search link — always offered so the user can open the full results. */
export function googleLink(q: string): WebResult {
  return { title: `Search Google for “${q.slice(0, 80)}”`, url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, snippet: "", source: "google.com" };
}

export function webSearchConfigured(): string | null {
  if (process.env.SERPER_API_KEY) return "Google (Serper)";
  if (process.env.BRAVE_SEARCH_API_KEY) return "Brave Search";
  if (process.env.TAVILY_API_KEY) return "Tavily";
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) return "Google Programmable Search";
  return null;
}

/**
 * Searches the web. Never throws — returns null when nothing useful was found (or the network is down).
 * `live` = the question needs fresh data (prices, news); encyclopedia sources are skipped for those.
 */
export async function webSearch(text: string, lang: Lang, opts: { live?: boolean } = {}): Promise<WebAnswer | null> {
  const q = cleanQuery(text);
  const key = `${lang}|${opts.live ? 1 : 0}|${q.toLowerCase()}`;
  const hit = cached(key);
  if (hit !== undefined) return hit;
  const tryAll = async (fns: (() => Promise<WebAnswer | null>)[]) => {
    for (const fn of fns) {
      try {
        const r = await fn();
        if (r && (r.answer || r.results.length)) return r;
      } catch (e) {
        console.warn("[web] provider failed:", (e as Error).message);
      }
    }
    return null;
  };
  let out = await tryAll([() => serper(q, lang), () => brave(q, lang), () => tavily(q), () => googleCse(q, lang)]);
  if (!out && !opts.live) {
    const wl: "en" | "hi" | "gu" = lang === "hi" && /[ऀ-ॿ]/.test(text) ? "hi" : lang === "gu" && /[઀-૿]/.test(text) ? "gu" : "en";
    // free sources: DuckDuckGo instant answer and Wikipedia in parallel; prefer a direct answer
    const [ddg, wiki, wikiEn] = await Promise.all([
      duckduckgo(q).catch(() => null),
      wikipedia(q, wl).catch(() => null),
      wl !== "en" ? wikipedia(q, "en").catch(() => null) : Promise.resolve(null),
    ]);
    out = (ddg?.answer ? ddg : null) ?? (wiki?.answer ? wiki : null) ?? (wikiEn?.answer ? wikiEn : null) ?? ddg ?? wiki ?? wikiEn;
  }
  remember(key, out);
  return out;
}
