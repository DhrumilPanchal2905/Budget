// Server + edge safe env helpers (no secrets are exported to the client from here).

export const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** Secure cookies whenever the app is served over HTTPS (always true on Vercel production). */
export const SECURE_COOKIES = APP_URL.startsWith("https://") || process.env.VERCEL === "1";

/** `__Host-` prefix forces Secure + Path=/ + no Domain → cookie is locked to the exact host. */
export const SESSION_COOKIE = SECURE_COOKIES ? "__Host-bp_session" : "bp_session";

export const SESSION_IDLE_DAYS = Math.max(1, Math.min(30, Number(process.env.SESSION_DAYS) || 7));
export const SESSION_ABSOLUTE_DAYS = 30;

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

export const IS_PROD = process.env.NODE_ENV === "production";
