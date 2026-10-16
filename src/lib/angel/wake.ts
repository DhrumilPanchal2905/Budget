// Angel AI — wake / sleep phrase detection ("Angel active", "एंजल एक्टिव", "એન્જલ ચાલુ", "hey Angel").
// Used in the browser on live speech transcripts. Pure + tiny so it can run on every interim result.
import { levenshtein, nameKey, normalize, tokenize } from "./text";

const NAME_KEYS = new Set(["angel", "angle", "anjel", "anjal", "enjal", "enjel", "ainjal", "ainjel", "aenjal", "aenjel", "enjl", "anjl", "angl", "ejal", "enjil", "angil", "enjol", "ainjel", "ejel", "enjle", "angels", "enjals", "injal", "enjala", "angela"]);
const ACTIVATE_KEYS = new Set(["saru", "suru", "shuru", "sanbal", "active", "activ", "activate", "activet", "activa", "actif", "aktiv", "aktive", "ektiv", "ektive", "ektivet", "ektivat", "ektif", "aiktiv", "aiktive", "ectiv", "activated", "calu", "caloo", "calo", "cal", "start", "on", "jago", "jag", "uto", "suno", "sambal", "samb", "sambalo", "wake", "wakeup", "aktivet", "aktivat"]);
const PREFIX_KEYS = new Set(["hey", "hi", "ok", "okay", "hello", "he", "hai", "oye", "are", "hay", "e", "ey"]);
const SLEEP_KEYS = new Set(["band", "bandh", "bye", "goodbye", "stop", "deactivate", "deactivet", "alvida", "avjo", "avajo", "cup", "so", "bas", "ruko", "rako"]);

function key(tok: string): string {
  return nameKey(tok);
}

export function isNameToken(tok: string): boolean {
  const k = key(tok);
  if (!k) return false;
  if (NAME_KEYS.has(k)) return true;
  return k.length >= 5 && (levenshtein(k, "enjal", 1) <= 1 || levenshtein(k, "angel", 1) <= 1);
}

/** "Angel active" / "hey Angel" / "एंजल एक्टिव" / "એન્જલ ચાલુ" → true. "angel" alone → false. */
export function isWakePhrase(text: string): boolean {
  const raw = tokenize(normalize(text));
  // speech engines sometimes split the name: "and gel active", "an gel active" → join neighbours that form the name
  const toks: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (i + 1 < raw.length && !isNameToken(raw[i]) && isNameToken(raw[i] + raw[i + 1])) {
      toks.push(raw[i] + raw[i + 1]);
      i++;
    } else toks.push(raw[i]);
  }
  for (let i = 0; i < toks.length; i++) {
    if (!isNameToken(toks[i])) continue;
    const prev = toks[i - 1] ? key(toks[i - 1]) : "";
    if (PREFIX_KEYS.has(prev) || PREFIX_KEYS.has(toks[i - 1] ?? "") || ["हे", "हाय", "ओके", "હે", "ઓકે", "હાય"].includes(toks[i - 1] ?? "")) return true;
    for (let j = Math.max(0, i - 2); j <= Math.min(toks.length - 1, i + 3); j++) {
      if (j === i) continue;
      const k = key(toks[j]);
      if (ACTIVATE_KEYS.has(k) || [...ACTIVATE_KEYS].some((a) => a.length >= 5 && k.startsWith(a))) return true;
    }
  }
  return false;
}

/**
 * Ends a voice session: "Angel band karo", "bye Angel", "एंजल बंद करो", "એન્જલ બંધ કરો" — or a short phrase that is
 * ONLY a stop command ("bye", "band karo", "stop", "बंद करो", "બંધ કરો"). "loan band karo" is NOT a stop phrase.
 */
const STOP_ONLY = new Set(
  ["bye", "goodbye", "bye bye", "stop", "band karo", "band kar do", "bas karo", "bas", "deactivate", "alvida", "aavjo", "avjo", "chup", "chup raho", "so jao", "बंद करो", "बंद कर दो", "बस", "अलविदा", "बाय", "चुप", "બંધ કરો", "બંધ કરી દો", "આવજો", "બસ", "બાય", "thank you bye", "ok bye"].map((x) => normalize(x)),
);
export function isSleepPhrase(text: string): boolean {
  const norm = normalize(text);
  const toks = tokenize(norm);
  if (!toks.length || toks.length > 6) return false;
  if (STOP_ONLY.has(norm)) return true;
  const named = toks.some(isNameToken);
  return named && toks.some((t) => SLEEP_KEYS.has(key(t)) || ["बंद", "बन्द", "अलविदा", "બંધ", "આવજો"].includes(t));
}

/** Removes the wake words from a transcript so "Angel active mera balance batao" still works as a command. */
export function stripWake(text: string): string {
  const toks = tokenize(normalize(text));
  const out = toks.filter((t) => {
    if (isNameToken(t)) return false;
    const k = key(t);
    return !(ACTIVATE_KEYS.has(k) || PREFIX_KEYS.has(k));
  });
  return out.join(" ");
}

/**
 * The words spoken AFTER the wake phrase: "angel active mera balance batao" → "mera balance batao".
 * Anything said before "Angel" (TV, other people) is ignored.
 */
export function afterWake(text: string): string {
  const toks = tokenize(normalize(text));
  let last = -1;
  toks.forEach((t, i) => {
    if (isNameToken(t)) last = i;
  });
  if (last < 0) return "";
  let rest = toks.slice(last + 1);
  while (rest.length && (ACTIVATE_KEYS.has(key(rest[0])) || PREFIX_KEYS.has(key(rest[0])) || ["karo", "kar", "ho", "jao", "करो", "हो", "જા", "કરો", "थाओ", "થાઓ", "ji", "जी"].includes(rest[0]))) rest = rest.slice(1);
  return rest.join(" ");
}

/** "Angel mera balance batao" — the name said first, followed by a real request (no "active" needed). */
export function startsWithName(text: string): boolean {
  const toks = tokenize(normalize(text));
  const i = toks.findIndex((t) => !PREFIX_KEYS.has(key(t)));
  return i >= 0 && isNameToken(toks[i]) && toks.length - i - 1 >= 2;
}

/** The whole utterance is just the name ("Angel", "hey Angel", "एंजल") — treat as a call when it is a final result. */
export function isNameOnly(text: string): boolean {
  const toks = tokenize(normalize(text));
  return toks.length > 0 && toks.length <= 3 && toks.some(isNameToken) && toks.every((t) => isNameToken(t) || PREFIX_KEYS.has(key(t)) || ["हे", "ओके", "હે", "ઓકે", "जी", "ji"].includes(t));
}
