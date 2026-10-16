"use client";

// Angel AI — controller: open/close, voice session (wake word → listen → think → speak → listen again),
// chat state and history actions. The heavy chat UI is loaded only when Angel is first opened.
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { api } from "@/lib/client";
import { afterWake, isNameOnly, isSleepPhrase, isWakePhrase, startsWithName, stripWake } from "@/lib/angel/wake";
import { forSpeech } from "@/lib/angel/i18n";
import type { AngelLangPref, AngelMessageDTO, ActionView } from "@/lib/angel/types";
import { useSession } from "../session";
import { useToast } from "../toast";
import { AngelOrb, type OrbState } from "./orb";
import { captureUtterance, chime, listen, speak, speechRecognitionSupported, startMicMeter, type Heard, type MicMeter } from "./voice";

const AngelPanel = dynamic(() => import("./angel-panel").then((m) => m.AngelPanel), { ssr: false });

export type VoiceLang = "hi-IN" | "en-IN" | "gu-IN";
export interface AngelSettings {
  wake: boolean;
  voiceLang: VoiceLang;
  replyLang: AngelLangPref;
  speakReplies: boolean;
  /** how long Angel waits after you stop talking before sending (ms) */
  pauseMs: number;
}
const DEFAULTS: AngelSettings = { wake: false, voiceLang: "hi-IN", replyLang: "auto", speakReplies: true, pauseMs: 1200 };
const KEY = "angel-settings-v1";

function loadSettings(): AngelSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage blocked */
  }
  return DEFAULTS;
}

interface AngelCtx {
  eligible: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  mode: OrbState;
  levelRef: MutableRefObject<number>;
  transcript: string;
  voiceSession: boolean;
  voiceSupported: boolean;
  messages: AngelMessageDTO[];
  conversationId: string | null;
  sending: boolean;
  settings: AngelSettings;
  updateSettings: (patch: Partial<AngelSettings>) => void;
  send: (text: string, source?: "voice" | "text", alts?: string[]) => Promise<void>;
  activate: () => void;
  endVoice: () => void;
  decide: (messageId: string, decision: "confirm" | "cancel" | "undo") => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  newChat: () => void;
  deleteMessage: (id: string) => Promise<void>;
  speakText: (text: string, lang: string) => void;
  historyVersion: number;
  bumpHistory: () => void;
}

const Ctx = createContext<AngelCtx | null>(null);
export const useAngel = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAngel must be used inside AngelProvider");
  return c;
};
/** Safe variant for components that may render outside the provider. */
export const useAngelOptional = () => useContext(Ctx);

const GREETING: Record<string, string> = { "hi-IN": "जी, बोलिए", "en-IN": "Yes, I'm listening", "gu-IN": "હા, બોલો" };
const BYE: Record<string, string> = { "hi-IN": "ठीक है, बाय", "en-IN": "Okay, bye", "gu-IN": "બરાબર, આવજો" };
const ttsLang = (v: VoiceLang) => (v === "hi-IN" ? "hi" : v === "gu-IN" ? "gu" : "en");

export function AngelProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const toast = useToast();
  const eligible = user.role === "admin" || user.plan === "unlimited";

  const [open, setOpenState] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [mode, setMode] = useState<OrbState>("idle");
  const [transcript, setTranscript] = useState("");
  const [voiceSession, setVoiceSession] = useState(false);
  const [messages, setMessages] = useState<AngelMessageDTO[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [settings, setSettings] = useState<AngelSettings>(DEFAULTS);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const levelRef = useRef(0);
  const meterRef = useRef<MicMeter | null>(null);
  const noMeter = useRef(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const wakeRef = useRef<{ stop: () => void } | null>(null);
  const ttsRef = useRef<{ stop: () => void } | null>(null);
  const sessionRef = useRef(false);
  const silenceCount = useRef(0);
  const genRef = useRef(0); // bumps on every new listen; stale async work checks it and bails out
  const sendingRef = useRef(false);
  const convRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  convRef.current = conversationId;

  useEffect(() => {
    setSettings(loadSettings());
    setVoiceSupported(speechRecognitionSupported());
  }, []);

  const updateSettings = useCallback((patch: Partial<AngelSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    if (v) setEverOpened(true);
  }, []);

  // ---------- level animation loop (mic while listening, synthetic while speaking) ----------
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const m = modeRef.current;
      if (m === "listening" && meterRef.current) levelRef.current = meterRef.current.level();
      else if (m === "speaking") levelRef.current = Math.max(0.15, levelRef.current * 0.92) + Math.abs(Math.sin(performance.now() / 160)) * 0.08;
      else levelRef.current *= 0.9;
      raf = requestAnimationFrame(tick);
    };
    if (eligible) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [eligible]);

  const stopMeter = () => {
    meterRef.current?.stop();
    meterRef.current = null;
  };
  const stopRec = () => {
    recRef.current?.stop();
    recRef.current = null;
  };
  const stopTts = () => {
    ttsRef.current?.stop();
    ttsRef.current = null;
  };

  // ---------- voice session ----------
  const endVoice = useCallback((sayBye = false) => {
    const wasActive = sessionRef.current;
    sessionRef.current = false;
    genRef.current++;
    setVoiceSession(false);
    stopRec();
    stopMeter();
    stopTts();
    setTranscript("");
    setMode("idle");
    if (wasActive) chime("off");
    if (sayBye && settingsRef.current.speakReplies) {
      const v = settingsRef.current.voiceLang;
      speak(BYE[v], ttsLang(v));
    }
  }, []);

  const speakThen = useCallback(async (text: string, lang: string) => {
    if (!settingsRef.current.speakReplies || !text) return;
    setMode("speaking");
    const s = speak(text, lang, () => (levelRef.current = 0.85));
    ttsRef.current = s;
    await s.done;
    ttsRef.current = null;
  }, []);

  const handleFinalRef = useRef<(t: string, alts: string[]) => void>(() => {});

  const startCommandListening = useCallback(async () => {
    if (!sessionRef.current) return;
    const gen = ++genRef.current;
    stopRec();
    setTranscript("");
    setMode("listening");
    // Start listening right away; the loudness meter for the orb opens in parallel (never blocks recognition).
    if (!noMeter.current && !meterRef.current) {
      void startMicMeter().then((meter) => {
        if (gen !== genRef.current || !sessionRef.current || meterRef.current) meter?.stop(); // never leak a mic stream
        else meterRef.current = meter;
      });
    }
    // Our own pause detection: you talk, stop for ~1.2 s, and it is sent automatically.
    recRef.current = captureUtterance({
      lang: settingsRef.current.voiceLang,
      silenceMs: settingsRef.current.pauseMs || 1200,
      onInterim: (text) => {
        setTranscript(text);
        if (!meterRef.current) levelRef.current = Math.min(1, 0.4 + Math.random() * 0.5);
      },
      onDone: (text, alts) => {
        if (gen !== genRef.current || !sessionRef.current) return;
        silenceCount.current = 0;
        handleFinalRef.current(text, alts);
      },
      onNoSpeech: () => {
        if (gen !== genRef.current || !sessionRef.current) return;
        silenceCount.current += 1;
        if (silenceCount.current >= 2) endVoice();
        else void startCommandListening();
      },
      onError: (code) => {
        if (code === "not-allowed" || code === "service-not-allowed") {
          toast.error("Microphone blocked", "Allow microphone access for this site to talk to Angel.");
          endVoice();
        } else if (code === "audio-capture" && meterRef.current) {
          // some phones can't share the mic between the meter and recognition → drop the meter and retry
          noMeter.current = true;
          stopMeter();
          void startCommandListening();
        } else if (code === "language-not-supported") {
          toast.error("Voice language not supported", "Choose another voice language in Angel settings.");
          endVoice();
        }
      },
    });
  }, [endVoice, toast]);

  // ---------- sending ----------
  const applyUpdated = (u: { id: string; action: ActionView | null } | null | undefined) => {
    if (!u) return;
    setMessages((ms) => ms.map((m) => (m.id === u.id ? { ...m, action: u.action } : m)));
  };

  const send = useCallback(
    async (raw: string, source: "voice" | "text" = "text", alts: string[] = []) => {
      const text = raw.trim();
      if (!text || sendingRef.current) return; // one message at a time per chat
      sendingRef.current = true;
      stopTts();
      setSending(true);
      setMode("thinking");
      const tempId = `tmp-${Date.now()}`;
      setMessages((ms) => [...ms, { id: tempId, role: "user", text, lang: "en", source, createdAt: new Date().toISOString() }]);
      try {
        const { data } = await api<{ conversation: { id: string }; messages: AngelMessageDTO[]; updated: { id: string; action: ActionView | null } | null; speak: string; lang: string }>("/api/angel/chat", {
          method: "POST",
          body: { message: text, conversationId: convRef.current, source, lang: settingsRef.current.replyLang, ...(alts.length ? { alts: alts.slice(0, 3) } : {}) },
        });
        setConversationId(data.conversation.id);
        convRef.current = data.conversation.id;
        setMessages((ms) => [...ms.filter((m) => m.id !== tempId), ...data.messages]);
        applyUpdated(data.updated);
        setHistoryVersion((v) => v + 1);
        sendingRef.current = false;
        setSending(false);
        if (sessionRef.current) {
          await speakThen(data.speak, data.lang);
          if (sessionRef.current) void startCommandListening();
          else setMode("idle");
        } else setMode("idle");
      } catch (err) {
        sendingRef.current = false;
        setSending(false);
        setMessages((ms) => [
          ...ms,
          { id: `err-${Date.now()}`, role: "angel", text: (err as Error).message || "Something went wrong. Please try again.", lang: "en", source: "system", createdAt: new Date().toISOString() },
        ]);
        setMode("idle");
        if (sessionRef.current) endVoice();
      }
    },
    [speakThen, startCommandListening, endVoice],
  );

  handleFinalRef.current = (t: string, alts: string[]) => {
    stopRec();
    stopMeter();
    if (isSleepPhrase(t)) {
      endVoice(true);
      return;
    }
    const clean = (x: string) => (isWakePhrase(x) ? afterWake(x) || stripWake(x) : x).trim();
    const cmd = clean(t);
    if (!cmd || isNameOnly(t)) {
      void startCommandListening();
      return;
    }
    void send(cmd, "voice", alts.map(clean).filter((a) => a && a !== cmd));
  };

  const activate = useCallback(
    async (initial?: string) => {
      if (!eligible) return;
      setOpen(true);
      if (sessionRef.current) return; // already talking — never start a second recogniser
      if (!speechRecognitionSupported()) {
        toast.info("Voice not supported here", "Use Chrome, Edge or Safari for voice. You can still type to Angel.");
        return;
      }
      wakeRef.current?.stop();
      wakeRef.current = null;
      sessionRef.current = true;
      silenceCount.current = 0;
      setVoiceSession(true);
      chime("on");
      if (initial && initial.trim()) {
        void send(initial, "voice");
        return;
      }
      const v = settingsRef.current.voiceLang;
      await speakThen(GREETING[v], ttsLang(v));
      void startCommandListening();
    },
    [eligible, setOpen, toast, send, speakThen, startCommandListening],
  );

  // ---------- wake word ("Angel active") ----------
  useEffect(() => {
    if (!eligible || !settings.wake || voiceSession || !voiceSupported) {
      wakeRef.current?.stop();
      wakeRef.current = null;
      if (!voiceSession && mode === "wake") setMode("idle");
      return;
    }
    let cancelled = false;
    let backoff = 300;
    let hardErrors = 0;
    const start = () => {
      if (cancelled || document.hidden || sessionRef.current) return;
      setMode((m) => (m === "idle" ? "wake" : m));
      wakeRef.current = listen({
        lang: settingsRef.current.voiceLang,
        continuous: true,
        onText: (h: Heard) => {
          backoff = 300;
          hardErrors = 0;
          // look at what was said most recently (+ the browser's alternative guesses)
          const tail = (x: string) => x.split(" ").slice(-10).join(" ");
          const candidates = [h.text, tail(h.full), ...h.alts.map(tail)];
          const hit = candidates.find((c) => isWakePhrase(c) || (h.isFinal && (isNameOnly(c) || startsWithName(c))));
          if (!hit) return;
          wakeRef.current?.stop();
          wakeRef.current = null;
          const rest = h.isFinal ? afterWake(hit) : "";
          void activate(rest.split(" ").length >= 2 ? rest : undefined);
        },
        onError: (code) => {
          if (code === "not-allowed" || code === "service-not-allowed") {
            cancelled = true;
            updateSettings({ wake: false });
            toast.error("Microphone blocked", "“Angel active” needs microphone permission for this site.");
          } else if (code !== "no-speech" && code !== "aborted") {
            // e.g. network / language-not-supported / audio-capture: slow down, and give up after a few
            backoff = Math.min(15000, backoff * 2);
            hardErrors += 1;
            if (hardErrors >= 6) {
              cancelled = true;
              updateSettings({ wake: false });
              toast.warning("Wake word paused", "“Angel active” stopped after repeated microphone errors. You can turn it on again in Angel settings.");
            }
          }
        },
        onEnd: () => {
          if (!cancelled) setTimeout(start, backoff);
        },
      });
    };
    const onVis = () => {
      if (document.hidden) {
        wakeRef.current?.stop();
        wakeRef.current = null;
      } else if (!wakeRef.current) start();
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      wakeRef.current?.stop();
      wakeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, settings.wake, voiceSession, voiceSupported]);

  // stop everything on unmount
  useEffect(() => () => endVoice(), [endVoice]);

  // ---------- history & actions ----------
  const decide = useCallback(async (messageId: string, decision: "confirm" | "cancel" | "undo") => {
    try {
      const { data } = await api<{ updated: { id: string; action: ActionView | null }; message: AngelMessageDTO; speak: string; lang: string }>(`/api/angel/messages/${messageId}/action`, { method: "POST", body: { decision } });
      applyUpdated(data.updated);
      setMessages((ms) => [...ms, data.message]);
      if (sessionRef.current) {
        await speakThen(data.speak, data.lang);
        if (sessionRef.current) void startCommandListening();
        else setMode("idle");
      }
    } catch (err) {
      toast.error("Angel", (err as Error).message);
    }
  }, [speakThen, startCommandListening, toast]);

  const openConversation = useCallback(async (id: string) => {
    try {
      const { data } = await api<{ messages: AngelMessageDTO[] }>(`/api/angel/conversations/${id}`);
      setConversationId(id);
      setMessages(data.messages);
    } catch (err) {
      toast.error("Could not open chat", (err as Error).message);
    }
  }, [toast]);

  const newChat = useCallback(() => {
    setConversationId(null);
    setMessages([]);
  }, []);

  const deleteMessage = useCallback(async (id: string) => {
    if (id.startsWith("tmp-") || id.startsWith("err-")) {
      setMessages((ms) => ms.filter((m) => m.id !== id));
      return;
    }
    try {
      const { data } = await api<{ conversationDeleted: boolean }>(`/api/angel/messages/${id}`, { method: "DELETE" });
      setMessages((ms) => ms.filter((m) => m.id !== id));
      if (data.conversationDeleted) setConversationId(null);
      setHistoryVersion((v) => v + 1);
    } catch (err) {
      toast.error("Could not delete", (err as Error).message);
    }
  }, [toast]);

  const speakText = useCallback((text: string, lang: string) => {
    stopTts();
    setMode("speaking");
    const s = speak(forSpeech(text), lang, () => (levelRef.current = 0.85));
    ttsRef.current = s;
    void s.done.then(() => {
      if (!sessionRef.current) setMode("idle");
    });
  }, []);

  const value = useMemo<AngelCtx>(
    () => ({
      eligible,
      open,
      setOpen,
      mode,
      levelRef,
      transcript,
      voiceSession,
      voiceSupported,
      messages,
      conversationId,
      sending,
      settings,
      updateSettings,
      send,
      activate: () => void activate(),
      endVoice: () => endVoice(),
      decide,
      openConversation,
      newChat,
      deleteMessage,
      speakText,
      historyVersion,
      bumpHistory: () => setHistoryVersion((v) => v + 1),
    }),
    [eligible, open, setOpen, mode, transcript, voiceSession, voiceSupported, messages, conversationId, sending, settings, updateSettings, send, activate, endVoice, decide, openConversation, newChat, deleteMessage, speakText, historyVersion],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {eligible && (
        <>
          {!open && <AngelLauncher />}
          {everOpened && <AngelPanel />}
        </>
      )}
    </Ctx.Provider>
  );
}

/** Floating live orb — tap to open Angel. Shows a small "ear" when it is listening for “Angel active”. */
function AngelLauncher() {
  const { setOpen, mode, levelRef, settings } = useAngel();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open Angel AI assistant"
      title={settings.wake ? "Angel — say “Angel active”" : "Angel AI"}
      className="group fixed bottom-[76px] right-4 mb-[env(safe-area-inset-bottom)] lg:mb-0 z-[44] flex h-14 w-14 items-center justify-center rounded-full bg-black/60 shadow-[0_8px_30px_-6px_rgb(var(--primary)/0.55)] ring-1 ring-white/10 backdrop-blur transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:bottom-6 lg:right-6"
    >
      <AngelOrb size={56} state={mode === "wake" ? "wake" : "idle"} levelRef={levelRef} halo />
      {mode === "wake" && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-bg" aria-hidden />}
    </button>
  );
}
