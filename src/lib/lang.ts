import type { Lang } from "./angel/parse";

const LANGS = ["en", "hi", "gu", "hn"];

/** Language for Angel suggestions: explicit ?lang= → the user's saved preference → English. */
export function insightLang(query: string | null | undefined, pref: string | null | undefined): Lang {
  if (query && LANGS.includes(query)) return query as Lang;
  if (pref && LANGS.includes(pref)) return pref as Lang;
  return "en";
}
