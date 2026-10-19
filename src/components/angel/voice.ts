"use client";

// Angel AI — browser voice layer: speech recognition (wake word + commands), text-to-speech and a live
// microphone level for the orb animation. Uses only what the browser itself provides (no AI service).

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any;

export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export interface Heard {
  /** current utterance (best guess) */
  text: string;
  /** everything heard in this recognition session (best guess) */
  full: string;
  /** other guesses the browser offered for the whole session (alternative spellings) */
  alts: string[];
  isFinal: boolean;
}

export interface ListenOptions {
  lang: string; // "hi-IN" | "en-IN" | "gu-IN"
  continuous: boolean;
  onText: (h: Heard) => void;
  onEnd?: () => void;
  onError?: (code: string) => void;
  onSound?: () => void;
}

/** One recognition session. Call stop() to end it; onEnd fires when the browser closes it. */
export function listen(opts: ListenOptions): { stop: () => void } {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec: Rec = new Ctor();
  rec.lang = opts.lang;
  rec.continuous = opts.continuous;
  rec.interimResults = true;
  rec.maxAlternatives = 5; // more guesses → the server picks the one that makes the most sense
  let stopped = false;
  rec.onresult = (e: any) => {
    const results = Array.from(e.results as ArrayLike<any>);
    const pick = (r: any, k: number) => String((r[k] ?? r[0])?.transcript ?? "");
    // Merge results; Android Chrome often repeats earlier words in each new result ("mera", "mera balance", ...)
    const join = (parts: string[]) => {
      let acc = "";
      for (const raw of parts) {
        const r = raw.replace(/\s+/g, " ").trim();
        if (!r) continue;
        const a = acc.toLowerCase();
        const b = r.toLowerCase();
        if (!acc || b.startsWith(a)) acc = r;
        else if (!a.endsWith(b)) acc = `${acc} ${r}`;
      }
      return acc;
    };
    const current = results.slice(e.resultIndex);
    const text = join(current.map((r) => pick(r, 0)));
    const full = join(results.map((r) => pick(r, 0)));
    const alts: string[] = [];
    for (let k = 1; k < 5; k++) {
      const alt = join(results.map((r) => pick(r, k)));
      if (alt && alt !== full && !alts.includes(alt)) alts.push(alt);
    }
    const isFinal = current.length > 0 && current.every((r) => r.isFinal);
    if (text || full) opts.onText({ text, full, alts, isFinal });
  };
  rec.onsoundstart = () => opts.onSound?.();
  rec.onspeechstart = () => opts.onSound?.();
  rec.onerror = (e: any) => opts.onError?.(String(e?.error ?? "unknown"));
  rec.onend = () => {
    if (!stopped) opts.onEnd?.();
  };
  try {
    rec.start();
  } catch {
    // already started — ignore
  }
  return {
    stop: () => {
      stopped = true;
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    },
  };
}

/** Words that mean "I'm not done yet" in English / Hindi / Gujarati. */
const CONTINUES = new Set(["ka", "ki", "ke", "ko", "se", "me", "mein", "main", "aur", "ya", "par", "pe", "to", "and", "or", "of", "for", "the", "a", "in", "on", "with", "my", "nu", "ni", "ma", "ane", "का", "की", "के", "को", "से", "में", "और", "या", "पर", "पे", "तो", "नु", "નું", "ના", "ની", "નો", "માં", "અને", "કે", "થી", "પર"]);

export interface CaptureOptions {
  lang: string;
  /** how long you must stay quiet before the sentence is sent (ms) */
  silenceMs: number;
  onInterim: (text: string) => void;
  onDone: (text: string, alts: string[]) => void;
  onNoSpeech: () => void;
  onError?: (code: string) => void;
  onSound?: () => void;
}

/**
 * Listens for ONE sentence and sends it automatically when you pause.
 * Browsers' own end-of-speech detection is slow/unreliable (esp. on Android), so we run our own pause timer:
 * after `silenceMs` without new words the sentence is finished. Long thinking pauses (> 8 s before speaking)
 * or very long speech (> 25 s) also end it.
 */
export function captureUtterance(o: CaptureOptions): { stop: () => void; finish: () => void } {
  let text = "";
  let alts: string[] = [];
  let finished = false;
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(pauseTimer);
    clearTimeout(noSpeechTimer);
    clearTimeout(maxTimer);
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    clear();
    handle.stop();
    if (text.trim()) o.onDone(text.trim(), alts);
    else o.onNoSpeech();
  };
  const noSpeechTimer = setTimeout(() => !text && finish(), 8000);
  const maxTimer = setTimeout(finish, 25000);
  const handle = listen({
    lang: o.lang,
    continuous: true, // don't let the browser cut you off at the first short pause
    onText: (h) => {
      if (finished) return;
      text = h.full;
      alts = h.alts;
      o.onInterim(text);
      clearTimeout(pauseTimer);
      // when the browser already marked the words final, the pause has partly passed → shorter wait
      // If the sentence clearly isn't finished ("…petrol ka", "…aur", "…mein"), wait longer before sending.
      const lastWord = (text.trim().split(/\s+/).pop() ?? "").toLowerCase();
      const wait = CONTINUES.has(lastWord) ? Math.max(o.silenceMs, 2400) : h.isFinal ? Math.max(500, o.silenceMs - 500) : o.silenceMs;
      pauseTimer = setTimeout(finish, wait);
    },
    onSound: o.onSound,
    onError: (code) => {
      if (code === "no-speech" || code === "aborted") return;
      o.onError?.(code);
    },
    onEnd: finish, // browser closed the session → use whatever we have
  });
  return {
    stop: () => {
      finished = true;
      clear();
      handle.stop();
    },
    finish,
  };
}

// ---------------- microphone level (for the orb) ----------------
export interface MicMeter {
  level: () => number; // 0..1
  stop: () => void;
}

export async function startMicMeter(): Promise<MicMeter | null> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let smooth = 0;
    return {
      level: () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const target = Math.min(1, rms * 5.5);
        smooth = smooth * 0.7 + target * 0.3;
        return smooth;
      },
      stop: () => {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => {});
      },
    };
  } catch {
    return null;
  }
}

// ---------------- text-to-speech ----------------
// The browser's own voices are used (no audio is sent anywhere). Quality differs a lot between devices, so Angel
// RANKS every installed voice and picks the most natural one for the language:
//   Edge "… Online (Natural)" neural voices (Swara / Neerja / Dhwani …) → Google voices (Chrome) →
//   Apple "Enhanced / Premium" voices (Lekha, Veena …) → anything else. Robotic engines (eSpeak) come last.
// The user can also choose a voice in Angel settings (saved per device).
const VOICE_LANG: Record<string, string[]> = {
  en: ["en-IN", "en-GB", "en-US", "en"],
  hn: ["en-IN", "hi-IN", "en"],
  hi: ["hi-IN", "hi"],
  gu: ["gu-IN", "gu"],
};
const FEMALE = /(swara|neerja|dhwani|kalpana|heera|lekha|veena|aditi|raveena|priya|kajal|ananya|aarohi|zira|aria|jenny|sonia|libby|samantha|karen|moira|tessa|female|woman)/i;
const NATURAL = /(natural|neural|online|enhanced|premium|wavenet|studio)/i;
const ROBOTIC = /(espeak|compact|mbrola|festival|pico)/i;

let voicesCache: SpeechSynthesisVoice[] = [];
function voices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) voicesCache = v;
  return voicesCache;
}
if (typeof window !== "undefined" && ttsSupported()) {
  window.speechSynthesis.onvoiceschanged = () => voices();
}

const norm = (l: string) => l.toLowerCase().replace("_", "-");

function voiceScore(v: SpeechSynthesisVoice, lang: string): number {
  const codes = VOICE_LANG[lang] ?? ["en-IN"];
  const vl = norm(v.lang);
  let score = -1;
  codes.forEach((c, i) => {
    const cl = c.toLowerCase();
    if (vl === cl) score = Math.max(score, 100 - i * 12);
    else if (vl.startsWith(cl) || (cl.length === 2 && vl.startsWith(`${cl}-`))) score = Math.max(score, 80 - i * 12);
  });
  if (score < 0) return -1;
  if (NATURAL.test(v.name)) score += 45;
  if (/google/i.test(v.name)) score += 28;
  if (FEMALE.test(v.name)) score += 12; // Angel is "she"
  if (ROBOTIC.test(v.name)) score -= 60;
  if (!v.localService) score += 4; // network voices are usually higher quality
  return score;
}

/** Voices for a language, best first (for the settings picker). */
export function listVoices(lang: string): { name: string; label: string; natural: boolean }[] {
  return voices()
    .map((v) => ({ v, s: voiceScore(v, lang) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map(({ v }) => ({ name: v.name, label: `${v.name.replace(/^Microsoft\s+/, "").replace(/\s*-\s*.*$/, "")} (${v.lang})`, natural: NATURAL.test(v.name) || /google/i.test(v.name) }));
}

export function pickVoice(lang: string, preferred?: string | null): SpeechSynthesisVoice | null {
  const all = voices();
  if (preferred) {
    const p = all.find((v) => v.name === preferred);
    if (p && voiceScore(p, lang) >= 0) return p;
  }
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const v of all) {
    const sc = voiceScore(v, lang);
    if (sc > bestScore) {
      best = v;
      bestScore = sc;
    }
  }
  return best;
}

/** Preferred voice names per reply language (set from Angel settings). */
const chosen: Record<string, string | null> = {};
export function setPreferredVoice(lang: string, name: string | null) {
  chosen[lang] = name;
}

export function canSpeak(lang: string): boolean {
  return ttsSupported() && pickVoice(lang) !== null;
}

/** Speaks text sentence by sentence (avoids Chrome's 15-second cut-off). Resolves when finished or stopped. */
export function speak(text: string, lang: string, onBoundary?: () => void): { done: Promise<void>; stop: () => void } {
  if (!ttsSupported() || !text.trim()) return { done: Promise.resolve(), stop: () => {} };
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(lang, chosen[lang] ?? null);
  const natural = !!voice && (NATURAL.test(voice.name) || /google/i.test(voice.name));
  const parts = text
    .split(/[.!?।](?=\s|$)|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  let stopped = false;
  const done = new Promise<void>((resolve) => {
    let i = 0;
    // Some devices never fire "end" for speech (no voices installed, OS bugs) → never wait forever.
    const safety = setTimeout(() => {
      stopped = true;
      synth.cancel();
      resolve();
    }, Math.min(30000, 2500 + text.length * 90));
    const next = () => {
      if (stopped || i >= parts.length) {
        clearTimeout(safety);
        return resolve();
      }
      const u = new SpeechSynthesisUtterance(parts[i++]);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else u.lang = (VOICE_LANG[lang] ?? ["en-IN"])[0];
      // natural voices sound best untouched; basic voices get a slightly calmer, warmer delivery
      u.rate = natural ? 1 : lang === "en" ? 0.98 : 0.95;
      u.pitch = natural ? 1 : 1.06;
      u.onboundary = () => onBoundary?.();
      u.onend = next;
      u.onerror = next;
      synth.speak(u);
    };
    next();
  });
  return {
    done,
    stop: () => {
      stopped = true;
      synth.cancel();
    },
  };
}

// ---------------- small activation chime (Web Audio, no files) ----------------
export function chime(kind: "on" | "off" = "on") {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    const now = ctx.currentTime;
    const notes = kind === "on" ? [660, 990] : [880, 520];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.09);
      g.gain.linearRampToValueAtTime(0.12, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.09);
      o.stop(now + i * 0.09 + 0.25);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 700);
    if ((navigator as any).userActivation?.hasBeenActive) navigator.vibrate?.(25);
  } catch {
    /* audio blocked — ignore */
  }
}
