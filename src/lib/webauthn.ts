import { randomBytes } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { WebAuthnChallenge } from "./models";
import { APP_URL, SECURE_COOKIES, WEBAUTHN_COOKIE } from "./env";
import { Errors } from "./errors";

// Passkeys / WebAuthn: "Auto login" with the device's own lock (fingerprint, Face ID, Windows Hello, device PIN).
// The device keeps the PRIVATE key inside its secure hardware; the server only stores the PUBLIC key.
// No password is ever saved in the browser.

export const RP_NAME = "Budget Pro";

/** Relying-party ID = the site's hostname (budget.dhrumilpanchal.in in production, localhost in dev). */
export function rpID(): string {
  return new URL(APP_URL).hostname;
}

export function expectedOrigin(): string {
  return new URL(APP_URL).origin;
}

export const b64url = {
  encode: (u8: Uint8Array) => Buffer.from(u8).toString("base64url"),
  decode: (s: string) => new Uint8Array(Buffer.from(s, "base64url")),
};

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Stores a single-use challenge server-side and binds it to this browser with a short-lived HttpOnly cookie. */
export async function saveChallenge(res: NextResponse, challenge: string, type: "register" | "login", userId?: string) {
  const key = randomBytes(24).toString("base64url");
  await WebAuthnChallenge.create({ key, challenge, type, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
  res.cookies.set({
    name: WEBAUTHN_COOKIE,
    value: key,
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "strict",
    path: "/",
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

/** Reads AND deletes the challenge (single use). */
export async function consumeChallenge(req: NextRequest, type: "register" | "login", userId?: string): Promise<string> {
  const key = req.cookies.get(WEBAUTHN_COOKIE)?.value;
  if (!key || key.length > 100) throw Errors.badRequest("Device verification expired. Please try again.");
  const filter: Record<string, unknown> = { key, type, expiresAt: { $gt: new Date() } };
  if (userId) filter.userId = userId;
  const doc = await WebAuthnChallenge.findOneAndDelete(filter).lean<{ challenge: string } | null>();
  if (!doc) throw Errors.badRequest("Device verification expired. Please try again.");
  return doc.challenge;
}

export function clearChallengeCookie(res: NextResponse) {
  res.cookies.set({ name: WEBAUTHN_COOKIE, value: "", httpOnly: true, secure: SECURE_COOKIES, sameSite: "strict", path: "/", maxAge: 0 });
}

export function deviceNameFromUA(ua: string): string {
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone/iPad"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows PC"
          : /Linux/.test(ua)
            ? "Linux"
            : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}
