// Browser-side API helper. Cookies are HttpOnly → JS never sees the session token.

export class ApiClientError extends Error {
  status: number;
  errors?: Record<string, string>;
  constructor(status: number, message: string, errors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export interface ApiResult<T> {
  data: T;
  message?: string;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(0, "Network error — check your connection and try again.");
  }
  let json: { success?: boolean; message?: string; data?: T; errors?: Record<string, string> } = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/register")) {
    window.location.href = "/api/auth/logout?reason=expired";
  }
  if (!res.ok || json.success === false) {
    throw new ApiClientError(res.status, json.message || "Something went wrong. Please try again.", json.errors);
  }
  return { data: json.data as T, message: json.message };
}

/** SWR fetcher → returns `data` only. */
export const fetcher = async <T = unknown>(path: string): Promise<T> => (await api<T>(path)).data;

export { THEMES, type ThemeId } from "./themes";

export function qs(params: Record<string, string | number | undefined | null | false>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function timeAgo(date: string | Date): string {
  const d = new Date(date).getTime();
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: s.length === 10 ? "UTC" : undefined });
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
