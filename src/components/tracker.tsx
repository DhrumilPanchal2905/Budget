"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { api } from "@/lib/client";

/**
 * Sends one lightweight page-view beacon per page (admin → Visitors: live visitors and their approximate city,
 * from the hosting edge's IP lookup). Runs after the page is idle so it never slows the page down.
 */
export function VisitTracker() {
  const pathname = usePathname();
  const last = useRef<string>("");
  useEffect(() => {
    if (!pathname || pathname === last.current || pathname.startsWith("/api/")) return;
    last.current = pathname;
    const send = () => void api("/api/track", { method: "POST", body: { path: pathname, referrer: document.referrer || "" }, keepalive: true }).catch(() => null);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(send, { timeout: 4000 });
    else setTimeout(send, 1500);
  }, [pathname]);
  return null;
}
