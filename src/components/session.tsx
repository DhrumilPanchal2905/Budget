"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { PublicUser } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { useToast } from "./toast";
import { useTheme } from "./providers";
import type { ThemeId } from "@/lib/themes";

// ---------------- Session ----------------
interface SessionCtx {
  user: PublicUser;
  can: (p: Permission) => boolean;
  isAdmin: boolean;
  refresh: () => void;
  money: (v: number, compact?: boolean) => string;
}
const SessionContext = createContext<SessionCtx | null>(null);

export function SessionProvider({ initialUser, children }: { initialUser: PublicUser; children: ReactNode }) {
  const { data, mutate } = useSWR<{ user: PublicUser }>("/api/auth/me", { fallbackData: { user: initialUser }, revalidateOnMount: false });
  const user = data?.user ?? initialUser;
  const { setTheme, theme } = useTheme();

  // Server-stored theme follows the user across devices.
  const syncedTheme = useRef(false);
  useEffect(() => {
    if (!syncedTheme.current && user.theme && user.theme !== theme) setTheme(user.theme as ThemeId);
    syncedTheme.current = true;
  }, [user.theme, theme, setTheme]);

  const value = useMemo<SessionCtx>(
    () => ({
      user,
      can: (p) => user.permissions.includes(p),
      isAdmin: user.role === "admin",
      refresh: () => void mutate(),
      money: (v, compact) => formatMoney(v, user.currency, compact),
    }),
    [user, mutate],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

// ---------------- Realtime ----------------
type Mode = "connecting" | "live" | "offline";
interface RealtimeCtx {
  mode: Mode;
  transport: "sse" | "pusher";
}
const RealtimeContext = createContext<RealtimeCtx>({ mode: "connecting", transport: "sse" });
export const useRealtime = () => useContext(RealtimeContext);

const startsWithAny = (prefixes: string[]) => (key: unknown) => typeof key === "string" && prefixes.some((p) => key.startsWith(p));

/**
 * Connects to the realtime layer and keeps every SWR cache in sync:
 *  - Pusher WebSockets when NEXT_PUBLIC_PUSHER_KEY is configured,
 *  - otherwise Server-Sent Events from /api/realtime/stream (Vercel-compatible, auto-reconnect).
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("connecting");
  const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  const transport: "sse" | "pusher" = pusherKey && pusherCluster ? "pusher" : "sse";

  const handle = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      switch (event) {
        case "finance:changed":
          void mutate(startsWithAny(["/api/finance", "/api/dashboard", "/api/analytics", "/api/insights", "/api/plan", "/api/admin/users"]));
          break;
        case "notification:new":
          void mutate(startsWithAny(["/api/notifications", "/api/dashboard"]));
          if (!payload.silent && payload.id !== "sync" && typeof payload.title === "string") toast.info(payload.title, typeof payload.message === "string" ? payload.message : undefined);
          break;
        case "admin:activity":
          void mutate(startsWithAny(["/api/admin/stats", "/api/admin/audit", "/api/admin/users", "/api/admin/database"]));
          break;
        case "profile:changed":
          void mutate(startsWithAny(["/api/auth/me", "/api/plan", "/api/insights", "/api/dashboard"]));
          break;
        case "session:revoked":
          window.location.href = "/api/auth/logout?reason=expired";
          break;
      }
    },
    [mutate, toast],
  );

  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    const events = ["finance:changed", "notification:new", "admin:activity", "profile:changed", "session:revoked"];
    const parse = (s: string) => {
      try {
        return JSON.parse(s) as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    if (transport === "pusher") {
      let cancelled = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let client: any;
      void import("pusher-js").then(({ default: Pusher }) => {
        if (cancelled) return;
        client = new Pusher(pusherKey!, { cluster: pusherCluster!, channelAuthorization: { endpoint: "/api/realtime/pusher-auth", transport: "ajax" } });
        client.connection.bind("state_change", (s: { current: string }) => setMode(s.current === "connected" ? "live" : s.current === "connecting" ? "connecting" : "offline"));
        const names = [`private-user-${user.id}`];
        if (user.role === "admin") names.push("private-admin");
        for (const n of names) {
          const ch = client.subscribe(n);
          for (const ev of events) ch.bind(ev, (data: Record<string, unknown>) => handleRef.current(ev, data ?? {}));
        }
      });
      return () => {
        cancelled = true;
        client?.disconnect();
      };
    }

    // Performance: the stream is paused while the tab is hidden (no server polling for a tab nobody looks at)
    // and reopened when it becomes visible again; SWR refetches on focus, so nothing is missed.
    let es: EventSource | null = null;
    let lastId = "";
    const open = () => {
      if (es) return;
      setMode("connecting");
      // resume from the last event we saw, so short hidden periods don't drop events
      const s = new EventSource(lastId ? `/api/realtime/stream?lastEventId=${encodeURIComponent(lastId)}` : "/api/realtime/stream");
      s.addEventListener("ready", () => setMode("live"));
      // Streams are recycled every ~55s (serverless limit); EventSource reconnects by itself and
      // resumes from Last-Event-ID, so only a CLOSED stream is reported as offline.
      s.onerror = () => {
        if (s.readyState === EventSource.CLOSED) setMode("offline");
      };
      for (const ev of events)
        s.addEventListener(ev, (e) => {
          const m = e as MessageEvent;
          if (m.lastEventId) lastId = m.lastEventId;
          handleRef.current(ev, parse(m.data));
        });
      es = s;
    };
    const close = () => {
      es?.close();
      es = null;
    };
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const onVisibility = () => {
      clearTimeout(hideTimer);
      if (document.hidden) hideTimer = setTimeout(close, 30_000); // short tab switches keep the stream
      else open();
    };
    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(hideTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [transport, pusherKey, pusherCluster, user.id, user.role]);

  return <RealtimeContext.Provider value={{ mode, transport }}>{children}</RealtimeContext.Provider>;
}
