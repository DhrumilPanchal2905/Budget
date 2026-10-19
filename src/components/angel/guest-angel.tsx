"use client";

import { AngelProvider } from "./angel-provider";

/** Angel for visitors on the public pages (no account): money questions, calculators and web answers. */
export default function GuestAngel() {
  return <AngelProvider guest>{null}</AngelProvider>;
}
