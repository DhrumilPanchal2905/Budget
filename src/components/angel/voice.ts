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

export interface ListenOptions {
  lang: string; // "hi-IN" | "en-IN" | "gu-IN"
  continuous: boolean;
  onText: (text: string, isFinal: boolean) => void;
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
  rec.maxAlternatives = 1;
  let stopped = false;
  rec.onresult = (e: any) => {
    // concatenate the results of THIS utterance (from resultIndex)
    let finalText = "";
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (finalText.trim()) opts.onText(finalText.trim(), true);
    else if (interim.trim()) opts.onText(interim.trim(), false);
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
const VOICE_LANG: Record<string, string[]> = {
  en: ["en-IN", "en-GB", "en-US", "en"],
  hn: ["en-IN", "hi-IN", "en"],
  hi: ["hi-IN", "hi"],
  gu: ["gu-IN", "gu"],
};
// Natural-sounding female voices first (Angel is "she").
const PREFERRED = /(google|natural|neural|online|heera|swara|kalpana|neerja|dhwani|lekha|veena|female|aditi|raveena|priya)/i;

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

export function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const all = voices();
  for (const code of VOICE_LANG[lang] ?? ["en-IN"]) {
    const matches = all.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(code.toLowerCase()));
    if (matches.length) return matches.find((v) => PREFERRED.test(v.name)) ?? matches[0];
  }
  return null;
}

export function canSpeak(lang: string): boolean {
  return ttsSupported() && pickVoice(lang) !== null;
}

/** Speaks text sentence by sentence (avoids Chrome's 15-second cut-off). Resolves when finished or stopped. */
export function speak(text: string, lang: string, onBoundary?: () => void): { done: Promise<void>; stop: () => void } {
  if (!ttsSupported() || !text.trim()) return { done: Promise.resolve(), stop: () => {} };
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(lang);
  const parts = text
    .split(/[.!?।](?=\s|$)|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  let stopped = false;
  const done = new Promise<void>((resolve) => {
    let i = 0;
    const next = () => {
      if (stopped || i >= parts.length) return resolve();
      const u = new SpeechSynthesisUtterance(parts[i++]);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else u.lang = (VOICE_LANG[lang] ?? ["en-IN"])[0];
      u.rate = lang === "en" ? 1.02 : 0.98;
      u.pitch = 1.05;
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
