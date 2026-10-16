// Angel AI — wake / sleep phrase detection ("Angel active", "एंजल एक्टिव", "એન્જલ ચાલુ", "hey Angel").
// Used in the browser on live speech transcripts. Pure + tiny so it can run on every interim result.
import { levenshtein, nameKey, normalize, tokenize } from "./text";

const NAME_KEYS = new Set(["angel", "angle", "anjel", "anjal", "enjal", "enjel", "ainjal", "ainjel", "aenjal", "enjl", "anjl", "angl", "ejal", "enjil"]);
const ACTIVATE_KEYS = new Set(["active", "activ", "activate", "activet", "aktiv", "ektiv", "ektive", "ektivet", "calu", "caloo", "start", "on", "jago", "jag", "uto", "suno", "sambal", "samb", "ektivat", "activated", "wake", "wakeup"]);
const PREFIX_KEYS = new Set(["hey", "hi", "ok", "okay", "hello", "he", "hai", "oye", "are"]);
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
  const toks = tokenize(normalize(text));
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
