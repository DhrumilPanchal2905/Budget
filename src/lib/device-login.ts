// Browser helpers for "Remember me" + "Auto login" (passkeys).
// SECURITY: nothing secret is stored in the browser. We only remember the email + display name
// (to pre-fill the form / greet the user) and whether this device has a passkey. The session itself
// lives in an HttpOnly cookie that JavaScript cannot read; the passkey's private key stays inside
// the device's secure hardware and is unlocked only by fingerprint / face / device PIN.

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "./client";

const KEY = "bp-device";

export interface RememberedDevice {
  email: string;
  name: string;
  passkey: boolean;
}

export function getRememberedDevice(): RememberedDevice | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<RememberedDevice>;
    if (typeof v.email !== "string" || !v.email) return null;
    return { email: v.email, name: typeof v.name === "string" ? v.name : "", passkey: Boolean(v.passkey) };
  } catch {
    return null;
  }
}

export function rememberDevice(d: RememberedDevice) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ email: d.email, name: d.name.slice(0, 80), passkey: d.passkey }));
  } catch {
    /* storage blocked — feature degrades gracefully */
  }
}

export function forgetDevice() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** True when this device has a built-in authenticator (Touch ID, Face ID, Windows Hello, Android fingerprint/PIN). */
export async function deviceLoginSupported(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function friendlyWebAuthnError(e: unknown): Error {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError") return new Error("Device verification was cancelled or timed out.");
  if (name === "InvalidStateError") return new Error("This device is already set up for auto login.");
  if (name === "SecurityError") return new Error("Auto login only works on the official site address (HTTPS).");
  return e instanceof Error ? e : new Error("Device verification failed.");
}

/** Registers this device for auto login (user must be signed in). Prompts for fingerprint / face / PIN. */
export async function enableDeviceLogin(): Promise<void> {
  const { data } = await api<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("/api/auth/passkey/register/options", { method: "POST", body: {} });
  let response;
  try {
    response = await startRegistration({ optionsJSON: data.options });
  } catch (e) {
    throw friendlyWebAuthnError(e);
  }
  await api("/api/auth/passkey/register/verify", { method: "POST", body: { response } });
}

/** Signs in with the device lock. Returns the signed-in user. */
export async function loginWithDevice(email?: string): Promise<{ id: string; email: string; name: string }> {
  const { data } = await api<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("/api/auth/passkey/login/options", {
    method: "POST",
    body: email ? { email } : {},
  });
  let response;
  try {
    response = await startAuthentication({ optionsJSON: data.options });
  } catch (e) {
    throw friendlyWebAuthnError(e);
  }
  const res = await api<{ user: { id: string; email: string; name: string } }>("/api/auth/passkey/login/verify", { method: "POST", body: { response } });
  return res.data.user;
}
