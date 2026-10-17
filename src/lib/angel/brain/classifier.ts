// Angel AI — the learning part of the brain: a small, fully self-contained text classifier.
// No third-party AI and no network. It "learns" from the multilingual example sentences in corpus.ts
// (English, हिंदी, ગુજરાતી, Hinglish, romanised Gujarati) and recognises NEW phrasings it has never seen,
// because it compares meaning-bearing features instead of exact keywords:
//   • words in a phonetic form (kharcha / kharchaa / kharch → one feature)
//   • Hindi / Gujarati script words ALSO in transliterated form, so "खर्चा क्यों बढ़ा" matches "kharcha kyu badha"
//   • word pairs (bigrams) for word order ("kitna bacha" ≠ "bacha kitna"... close, but weighted)
//   • character 4-grams of long words → typo tolerance ("expence", "balence", "categry")
//   • slots: any amount → #num, any date/period → #date, any category word → #cat, any email → #email
// Model: TF-IDF vectors + nearest neighbours (cosine). Score per intent = blend of its best and 2nd-best example.

export interface Example {
  intent: string;
  features: Map<string, number>;
}

export interface Prediction {
  intent: string;
  score: number; // 0..1 cosine similarity
  margin: number; // distance to the best OTHER intent
  ranked: { intent: string; score: number }[];
}

interface Trained {
  idf: Map<string, number>;
  vecs: { intent: string; v: Map<string, number> }[];
  index: Map<string, number[]>; // feature → example ids (inverted index for speed)
}

function norm(v: Map<string, number>): Map<string, number> {
  let s = 0;
  for (const x of v.values()) s += x * x;
  const n = Math.sqrt(s) || 1;
  const out = new Map<string, number>();
  for (const [k, x] of v) out.set(k, x / n);
  return out;
}

export function train(examples: Example[]): Trained {
  const df = new Map<string, number>();
  for (const e of examples) for (const k of e.features.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const N = examples.length;
  const idf = new Map<string, number>();
  for (const [k, d] of df) idf.set(k, Math.log((N + 1) / (d + 0.5)));
  const vecs = examples.map((e) => {
    const v = new Map<string, number>();
    for (const [k, tf] of e.features) v.set(k, (1 + Math.log(tf)) * (idf.get(k) ?? 0) * weightOf(k));
    return { intent: e.intent, v: norm(v) };
  });
  const index = new Map<string, number[]>();
  vecs.forEach((x, i) => {
    for (const k of x.v.keys()) {
      const arr = index.get(k);
      if (arr) arr.push(i);
      else index.set(k, [i]);
    }
  });
  return { idf, vecs, index };
}

/** Feature-type weights: whole words matter most, typo n-grams least. */
function weightOf(k: string): number {
  if (k.startsWith("c:")) return 0.35;
  if (k.startsWith("b:")) return 0.8;
  if (k.startsWith("#")) return 0.9;
  if (k.startsWith("t:")) return 0.9; // transliterated form of a native-script word
  return 1;
}

export function predict(model: Trained, features: Map<string, number>, allowed?: (intent: string) => boolean): Prediction {
  const q = new Map<string, number>();
  for (const [k, tf] of features) {
    const idf = model.idf.get(k);
    if (idf === undefined) continue; // unseen feature (e.g. a person's name) carries no meaning
    q.set(k, (1 + Math.log(tf)) * idf * weightOf(k));
  }
  const qv = norm(q);
  const sims = new Map<number, number>();
  for (const [k, w] of qv) {
    const ids = model.index.get(k);
    if (!ids) continue;
    for (const i of ids) sims.set(i, (sims.get(i) ?? 0) + w * (model.vecs[i].v.get(k) ?? 0));
  }
  const best = new Map<string, [number, number]>(); // intent → [top1, top2]
  for (const [i, s] of sims) {
    const intent = model.vecs[i].intent;
    if (allowed && !allowed(intent)) continue;
    const cur = best.get(intent) ?? [0, 0];
    if (s > cur[0]) best.set(intent, [s, cur[0]]);
    else if (s > cur[1]) best.set(intent, [cur[0], s]);
  }
  const ranked = [...best.entries()]
    .map(([intent, [a, b]]) => ({ intent, score: a * 0.75 + b * 0.25 }))
    .sort((x, y) => y.score - x.score);
  const top = ranked[0];
  if (!top) return { intent: "unknown", score: 0, margin: 0, ranked: [] };
  return { intent: top.intent, score: top.score, margin: top.score - (ranked[1]?.score ?? 0), ranked: ranked.slice(0, 5) };
}
