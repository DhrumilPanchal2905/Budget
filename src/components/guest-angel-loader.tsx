"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const GuestAngel = dynamic(() => import("./angel/guest-angel"), { ssr: false });

/** Loads the guest Angel only after the page is idle, so public pages stay fast (and SEO scores high). */
export function GuestAngelLoader() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => setReady(true), { timeout: 3000 });
    else setTimeout(() => setReady(true), 1500);
  }, []);
  return ready ? <GuestAngel /> : null;
}
