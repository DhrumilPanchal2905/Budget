"use client";

// Angel AI — the conversation panel: live orb + voice stage, chat, history (with delete) and settings.
import { forwardRef, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUp, Check, Copy, History, Mic, MicOff, MessageSquarePlus, Settings2, Trash2, Undo2, Volume2, X } from "lucide-react";
import { api, timeAgo } from "@/lib/client";
import type { AngelMessageDTO, Card, ConversationDTO } from "@/lib/angel/types";
import { useSession } from "../session";
import { useToast } from "../toast";
import { Button, ConfirmDialog, cn } from "../ui";
import { AngelOrb } from "./orb";
import { useAngel, type VoiceLang } from "./angel-provider";
import { canSpeak } from "./voice";

const STATUS: Record<string, string> = {
  idle: "Ready",
  wake: "Listening for “Angel active”",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  off: "Off",
};

type View = "chat" | "history" | "settings";

export function AngelPanel() {
  const a = useAngel();
  const [view, setView] = useState<View>("chat");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!a.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal="true"]')) a.setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [a]);

  if (!a.open) return null;

  return (
    <section
      aria-label="Angel AI assistant"
      className="fixed inset-0 z-[45] flex animate-slide-in flex-col bg-surface pb-[env(safe-area-inset-bottom)] lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[440px] lg:border-l lg:border-border lg:shadow-2xl"
    >
      {/* header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <AngelOrb size={40} state={a.mode} levelRef={a.levelRef} halo={false} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">Angel</p>
          <p className="truncate text-xs text-muted" aria-live="polite">
            {STATUS[a.mode] ?? "Ready"}
          </p>
        </div>
        <IconBtn label="New chat" onClick={() => { a.newChat(); setView("chat"); }}>
          <MessageSquarePlus className="h-4 w-4" />
        </IconBtn>
        <IconBtn label="Chat history" active={view === "history"} onClick={() => setView(view === "history" ? "chat" : "history")}>
          <History className="h-4 w-4" />
        </IconBtn>
        <IconBtn label="Angel settings" active={view === "settings"} onClick={() => setView(view === "settings" ? "chat" : "settings")}>
          <Settings2 className="h-4 w-4" />
        </IconBtn>
        <IconBtn ref={closeRef} label="Close Angel" onClick={() => { a.endVoice(); a.setOpen(false); }}>
          <X className="h-4 w-4" />
        </IconBtn>
      </header>

      {view === "history" ? <HistoryView onOpen={() => setView("chat")} /> : view === "settings" ? <SettingsView /> : <ChatView />}
    </section>
  );
}

const IconBtn = forwardRef<HTMLButtonElement, { label: string; onClick: () => void; children: ReactNode; active?: boolean }>(function IconBtn({ label, onClick, children, active }, ref) {
  return (
    <button ref={ref} type="button" onClick={onClick} aria-label={label} title={label} className={cn("flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60", active && "bg-surface-2 text-fg")}>
      {children}
    </button>
  );
});

// ======================= chat =======================
function ChatView() {
  const a = useAngel();
  const { user } = useSession();
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const first = user.name.split(" ")[0];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [a.messages.length, a.sending, a.voiceSession]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || a.sending) return;
    void a.send(text, "text");
    setText("");
  };

  const lastAngel = [...a.messages].reverse().find((m) => m.role === "angel");
  const empty = a.messages.length === 0;

  return (
    <>
      <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {a.voiceSession ? (
          <VoiceStage />
        ) : empty ? (
          <div className="flex min-h-full flex-col items-center justify-center pb-6 text-center">
            <AngelOrb size={150} state={a.mode} levelRef={a.levelRef} />
            <h2 className="mt-4 text-xl font-semibold tracking-tight">Hi {first}, I&apos;m Angel.</h2>
            <p className="mt-1 max-w-[30ch] text-sm text-muted">Ask about your money, get saving advice, or tell me what you spent — in English, हिंदी or ગુજરાતી.</p>
            {a.voiceSupported && (
              <Button className="mt-5" size="lg" onClick={a.activate}>
                <Mic className="h-4 w-4" /> Tap to talk
              </Button>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {["Mera balance kitna hai?", "Is mahine kitna kharcha hua?", "500 ka petrol add karo", "1 lakh kaise bachaun?"].map((s) => (
                <Chip key={s} onClick={() => void a.send(s, "text")}>{s}</Chip>
              ))}
            </div>
          </div>
        ) : null}

        {!empty && (
          <ol className={cn("space-y-4", a.voiceSession && "mt-6")}>
            {a.messages.map((m) => (
              <Message key={m.id} m={m} />
            ))}
            {a.sending && (
              <li className="flex items-center gap-2 text-sm text-muted">
                <AngelOrb size={22} state="thinking" halo={false} />
                <span className="animate-pulse">Angel is thinking…</span>
              </li>
            )}
          </ol>
        )}
      </div>

      {/* quick replies */}
      {!a.sending && lastAngel?.suggestions?.length && !lastAngel.action?.needsConfirm && lastAngel === a.messages[a.messages.length - 1] ? (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2">
          {lastAngel.suggestions.map((s) => (
            <Chip key={s} onClick={() => void a.send(s, "text")}>{s}</Chip>
          ))}
        </div>
      ) : null}

      {/* composer */}
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border px-3 py-3">
        <label className="sr-only" htmlFor="angel-input">Message Angel</label>
        <textarea
          id="angel-input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          maxLength={1000}
          placeholder="Ask Angel anything…"
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted/70 focus:border-primary/60"
        />
        {a.voiceSupported && (
          <button
            type="button"
            onClick={a.voiceSession ? a.endVoice : a.activate}
            aria-label={a.voiceSession ? "Stop voice" : "Talk to Angel"}
            title={a.voiceSession ? "Stop voice" : "Talk to Angel"}
            className={cn(
              "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              a.voiceSession ? "border-danger/40 bg-danger/15 text-danger" : "border-border bg-surface-2 text-fg hover:border-primary/50",
            )}
          >
            {a.voiceSession ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <button type="submit" disabled={!text.trim() || a.sending} aria-label="Send" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg transition-opacity disabled:opacity-40">
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </>
  );
}

function VoiceStage() {
  const a = useAngel();
  const hint =
    a.mode === "listening"
      ? a.transcript || "Boliye… / Speak now"
      : a.mode === "thinking"
        ? a.transcript
        : a.mode === "speaking"
          ? ""
          : "";
  return (
    <div className="flex flex-col items-center pt-2 text-center">
      <AngelOrb size={176} state={a.mode} levelRef={a.levelRef} />
      <p className="mt-3 text-sm font-medium" aria-live="polite">{STATUS[a.mode]}</p>
      <p className={cn("mt-2 min-h-[1.5rem] max-w-[34ch] text-[15px] leading-snug", a.transcript ? "text-fg" : "text-muted")}>{hint}</p>
      <p className="mt-3 text-[11px] text-muted/80">Pause for a moment and it sends by itself. Say “Angel band karo” or tap the mic to stop.</p>
    </div>
  );
}

function Chip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-fg transition-colors hover:border-primary/50">
      {children}
    </button>
  );
}

function Message({ m }: { m: AngelMessageDTO }) {
  const a = useAngel();
  const mine = m.role === "user";
  const ttsLang = m.lang;
  return (
    <li className={cn("group flex gap-2.5", mine ? "justify-end" : "justify-start")}>
      {!mine && <AngelOrb size={26} state="idle" halo={false} className="mt-0.5 shrink-0" />}
      <div className={cn("min-w-0 max-w-[85%]", mine && "flex flex-col items-end")}>
        <div className={cn("whitespace-pre-wrap break-words text-[14px] leading-relaxed", mine ? "rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2 text-fg" : "text-fg")}>
          {m.source === "voice" && mine && <Mic className="mr-1 inline h-3 w-3 align-[-1px] text-muted" aria-label="spoken" />}
          {m.text}
        </div>
        {m.cards?.map((c, i) => <CardView key={i} c={c} />)}
        {m.action && <ActionBar id={m.id} action={m.action} />}
        <div className={cn("mt-1 flex items-center gap-1 text-[11px] text-muted/70 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100", mine && "flex-row-reverse")}>
          <span>{timeAgo(m.createdAt)}</span>
          {!mine && canSpeak(ttsLang) && (
            <button type="button" onClick={() => a.speakText(m.text, ttsLang)} className="rounded p-1 hover:bg-surface-2 hover:text-fg" aria-label="Read aloud" title="Read aloud">
              <Volume2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => void a.deleteMessage(m.id)} className="rounded p-1 hover:bg-surface-2 hover:text-danger" aria-label="Delete message" title="Delete message">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function CardView({ c }: { c: Card }) {
  const toneCls = (t?: string) => (t === "pos" ? "text-success" : t === "neg" ? "text-danger" : "text-fg");
  if (c.type === "stats")
    return (
      <div className="mt-2 grid grid-cols-3 gap-2">
        {c.items.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface-2/60 px-2.5 py-2">
            <p className="text-[11px] text-muted">{s.label}</p>
            <p className={cn("tabular mt-0.5 truncate text-sm font-semibold", toneCls(s.tone))}>{s.value}</p>
          </div>
        ))}
      </div>
    );
  if (c.type === "bars")
    return (
      <div className="mt-2 space-y-2 rounded-xl border border-border bg-surface-2/60 p-3">
        {c.title && <p className="text-xs font-medium text-muted">{c.title}</p>}
        {c.items.map((b) => (
          <div key={b.label}>
            <div className="flex justify-between gap-2 text-xs">
              <span className="truncate">{b.label}</span>
              <span className="tabular text-muted">{b.display} · {b.value}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.min(100, b.value))}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  if (c.type === "list")
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-border bg-surface-2/60">
        {c.title && <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted">{c.title}</p>}
        <ul className="divide-y divide-border">
          {c.items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{it.title}</p>
                {it.subtitle && <p className="truncate text-[11px] text-muted">{it.subtitle}</p>}
              </div>
              {it.value && <span className={cn("tabular shrink-0 text-[13px] font-semibold", toneCls(it.tone))}>{it.value}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  return <SecretCard title={c.title} value={c.value} note={c.note} />;
}

function SecretCard({ title, value, note }: { title: string; value: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
      <p className="text-xs font-medium text-warning">{title}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="flex-1 select-all break-all rounded-lg bg-surface px-2.5 py-1.5 text-sm">{value}</code>
        <button
          type="button"
          className="rounded-lg border border-border p-2 hover:bg-surface-2"
          aria-label="Copy password"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{note}</p>
    </div>
  );
}

function ActionBar({ id, action }: { id: string; action: NonNullable<AngelMessageDTO["action"]> }) {
  const a = useAngel();
  const [busy, setBusy] = useState(false);
  const run = async (d: "confirm" | "cancel" | "undo") => {
    setBusy(true);
    await a.decide(id, d);
    setBusy(false);
  };
  const label: Record<string, string> = { pending: "Waiting for your OK", running: "Working…", done: "Done", undoing: "Undoing…", cancelled: "Cancelled", undone: "Undone", failed: "Failed" };
  const tone = action.status === "done" ? "text-success border-success/30 bg-success/10" : action.status === "pending" ? "text-warning border-warning/30 bg-warning/10" : "text-muted border-border bg-surface-2";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", tone)}>{label[action.status]}</span>
      {action.needsConfirm && (
        <>
          <Button size="sm" loading={busy} onClick={() => void run("confirm")}>Yes, do it</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run("cancel")}>Cancel</Button>
        </>
      )}
      {action.canUndo && (
        <Button size="sm" variant="ghost" loading={busy} onClick={() => void run("undo")}>
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </Button>
      )}
    </div>
  );
}

// ======================= history =======================
function HistoryView({ onOpen }: { onOpen: () => void }) {
  const a = useAngel();
  const toast = useToast();
  const [items, setItems] = useState<ConversationDTO[] | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<ConversationDTO | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ items: ConversationDTO[] }>("/api/angel/conversations")
      .then((r) => alive && setItems(r.data.items))
      .catch((e) => {
        if (alive) setItems([]);
        toast.error("Could not load chats", (e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [a.historyVersion, toast]);

  const del = async (c: ConversationDTO) => {
    setBusy(true);
    try {
      await api(`/api/angel/conversations/${c.id}`, { method: "DELETE" });
      setItems((xs) => xs?.filter((x) => x.id !== c.id) ?? null);
      if (a.conversationId === c.id) a.newChat();
      setToDelete(null);
    } catch (e) {
      toast.error("Could not delete chat", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const delAll = async () => {
    setBusy(true);
    try {
      await api("/api/angel/conversations", { method: "DELETE" });
      setItems([]);
      a.newChat();
      setConfirmAll(false);
      toast.success("All Angel chats deleted");
    } catch (e) {
      toast.error("Could not delete chats", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      <div className="flex items-center justify-between px-2 py-2">
        <p className="text-sm font-semibold">Your chats with Angel</p>
        {items && items.length > 0 && (
          <button type="button" onClick={() => setConfirmAll(true)} className="text-xs text-danger hover:underline">
            Delete all
          </button>
        )}
      </div>
      {items === null ? (
        <p className="px-2 py-8 text-center text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-muted">No chats yet. Everything you say to Angel is saved here as text.</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((c) => (
            <li key={c.id} className={cn("group flex items-center gap-1 rounded-lg pr-1 hover:bg-surface-2", a.conversationId === c.id && "bg-surface-2")}>
              <button
                type="button"
                className="min-w-0 flex-1 px-3 py-2.5 text-left"
                onClick={async () => {
                  await a.openConversation(c.id);
                  onOpen();
                }}
              >
                <span className="block truncate text-sm font-medium">{c.title}</span>
                <span className="block truncate text-xs text-muted">{c.preview || "—"}</span>
                <span className="mt-0.5 block text-[11px] text-muted/70">{timeAgo(c.lastMessageAt)} · {c.messageCount} messages</span>
              </button>
              <button type="button" onClick={() => setToDelete(c)} className="rounded-md p-2 text-muted hover:bg-danger/10 hover:text-danger" aria-label={`Delete chat ${c.title}`} title="Delete chat">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => { if (toDelete) void del(toDelete); }} loading={busy} title="Delete this chat?" message="The conversation text is removed. Entries Angel added to your budget stay as they are." />
      <ConfirmDialog open={confirmAll} onClose={() => setConfirmAll(false)} onConfirm={delAll} loading={busy} title="Delete all Angel chats?" message="Every conversation with Angel is removed permanently. Your income, expenses and goals are not affected." confirmLabel="Delete all" />
    </div>
  );
}

// ======================= settings =======================
function SettingsView() {
  const a = useAngel();
  const s = a.settings;
  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
      <Row title="Wake word" desc="Listen for “Angel active” (also “एंजल एक्टिव”, “એન્જલ ચાલુ”, “Hey Angel”) while Budget Pro is open. Your browser shows a mic indicator while it listens.">
        <Toggle checked={s.wake} disabled={!a.voiceSupported} onChange={(v) => a.updateSettings({ wake: v })} label="Wake word" />
      </Row>
      <Row title="Voice language" desc="The language you speak in. Hindi also understands Hinglish and English words.">
        <select value={s.voiceLang} onChange={(e) => a.updateSettings({ voiceLang: e.target.value as VoiceLang })} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
          <option value="hi-IN">हिंदी / Hinglish</option>
          <option value="en-IN">English (India)</option>
          <option value="gu-IN">ગુજરાતી</option>
        </select>
      </Row>
      <Row title="Reply language" desc="Auto replies in the language you used.">
        <select value={s.replyLang} onChange={(e) => a.updateSettings({ replyLang: e.target.value as typeof s.replyLang })} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
          <option value="auto">Auto</option>
          <option value="en">English</option>
          <option value="hi">हिंदी</option>
          <option value="gu">ગુજરાતી</option>
          <option value="hn">Hinglish</option>
        </select>
      </Row>
      <Row title="Send after a pause of" desc="When you stop talking for this long, Angel sends what you said — no button needed.">
        <select value={s.pauseMs} onChange={(e) => a.updateSettings({ pauseMs: Number(e.target.value) })} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
          <option value={800}>0.8 s (fast)</option>
          <option value={1200}>1.2 s</option>
          <option value={1800}>1.8 s (relaxed)</option>
        </select>
      </Row>
      <Row title="Speak replies" desc="Angel answers out loud when you talk to her.">
        <Toggle checked={s.speakReplies} onChange={(v) => a.updateSettings({ speakReplies: v })} label="Speak replies" />
      </Row>
      {!a.voiceSupported && <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">This browser has no speech recognition. Use Chrome, Edge or Safari for voice — typing works everywhere.</p>}
      <p className="text-xs leading-relaxed text-muted">
        Angel is Budget Pro&apos;s own assistant: your questions are answered on our server from your Budget Pro data — no outside AI service. Turning speech into text is done by your browser&apos;s built-in voice engine (in Chrome this sends the audio to Google&apos;s speech service; with the wake word on, it listens while Budget Pro is open on screen). Settings here are saved on this device.
      </p>
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40", checked ? "bg-primary" : "bg-surface-2 ring-1 ring-border")}
    >
      <span className={cn("absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}
