"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/client";
import { THEMES, THEME_STORAGE_KEY, type ThemeId } from "@/lib/themes";
import { ToastProvider } from "./toast";

// ---------------- Theme ----------------
interface ThemeCtx {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}
const ThemeContext = createContext<ThemeCtx>({ theme: "midnight", setTheme: () => {} });

const STORAGE_KEY = THEME_STORAGE_KEY;

function readStoredTheme(): ThemeId {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t && THEMES.some((x) => x.id === t)) return t as ThemeId;
  } catch {
    /* storage blocked */
  }
  return "midnight";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("midnight");

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        dedupingInterval: 1500,
        keepPreviousData: true,
        shouldRetryOnError: (err: Error) => {
          const status = (err as Error & { status?: number })?.status;
          return !status || status >= 500;
        },
        errorRetryCount: 2,
      }}
    >
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}
