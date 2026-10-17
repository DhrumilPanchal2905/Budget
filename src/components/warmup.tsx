"use client";

import { useEffect } from "react";

/**
 * Speed: wakes the API + database in the background as soon as a public page is open, so by the time the
 * visitor signs in, the server is already warm (removes the slow "first request" delay on serverless).
 */
export function WarmUp() {
  useEffect(() => {
    const go = () => void fetch("/api/health", { cache: "no-store", keepalive: true }).catch(() => null);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2500 });
    else setTimeout(go, 800);
  }, []);
  return null;
}
