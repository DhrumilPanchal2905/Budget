// Browser half of the encrypted API channel (see lib/secure-channel.ts for the design).
// Uses only the built-in WebCrypto API. If WebCrypto is unavailable (very old browser / plain-http dev on a LAN IP)
// requests fall back to normal JSON over HTTPS, so the app never breaks.

interface Channel {
  pub: string; // our public key, base64url
  key: CryptoKey; // shared AES-GCM key
}

let chan: Promise<Channel | null> | null = null;

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

// Fetched once per page load (no long-lived cache), so a new server key after a deploy is picked up immediately.
async function serverPub(): Promise<string> {
  const res = await fetch("/api/secure/key", { cache: "no-store", credentials: "same-origin" });
  const json = (await res.json()) as { data?: { key?: string } };
  const k = json.data?.key;
  if (!k) throw new Error("no server key");
  return k;
}

async function build(): Promise<Channel | null> {
  if (typeof window === "undefined" || !window.crypto?.subtle) return null;
  const subtle = window.crypto.subtle;
  const [spk, pair] = await Promise.all([serverPub(), subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])]);
  const serverKey = await subtle.importKey("raw", fromB64url(spk), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await subtle.deriveBits({ name: "ECDH", public: serverKey }, pair.privateKey, 256);
  const hk = await subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("budgetpro-e2e-v1"), info: new TextEncoder().encode("aes-256-gcm") },
    hk,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const pub = b64url(await subtle.exportKey("raw", pair.publicKey));
  return { pub, key };
}

export function secureChannel(): Promise<Channel | null> {
  chan ??= build().catch(() => {
    chan = null; // retry on the next request
    return null;
  });
  return chan;
}

/** Forget the cached server key (e.g. after a decrypt failure caused by a server key rotation). */
export function resetSecureChannel() {
  chan = null;
  try {
    sessionStorage.removeItem("bp_spk"); // old versions cached the key here
  } catch {
    /* ignore */
  }
}

export async function sealText(c: Channel, text: string): Promise<string> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, c.key, new TextEncoder().encode(text)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64url(out);
}

export async function openText(c: Channel, payload: string): Promise<string> {
  const buf = fromB64url(payload);
  const pt = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, c.key, buf.subarray(12));
  return new TextDecoder().decode(pt);
}
