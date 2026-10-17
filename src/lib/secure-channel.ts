// End-to-end payload encryption between the browser and our API (on top of HTTPS).
// Every API request body and every API response body travels as AES-256-GCM ciphertext, so the browser's
// Network tab, proxies and browser extensions that read traffic only see `{"__e":"…"}`.
//
// Key agreement: ECDH P-256. The server has a static key pair derived from a server secret; each browser tab
// creates a fresh key pair and sends its PUBLIC key in the `x-bp-key` header. Both sides derive the same
// AES key with HKDF-SHA256 — the key itself is never sent anywhere. Fresh random IV for every message.
//
// Note (honest): this protects data in transit and hides it from casual inspection. Code running inside the
// page itself (e.g. someone stepping through the JavaScript in a debugger on their own device) can still see
// their own decrypted data — that is true for every web app.
import { createCipheriv, createDecipheriv, createECDH, createHash, hkdfSync, randomBytes, type ECDH } from "crypto";

const SALT = Buffer.from("budgetpro-e2e-v1");
const INFO = Buffer.from("aes-256-gcm");

let warned = false;
function secret(): string {
  if (!process.env.PAYLOAD_SECRET && process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn("[secure-channel] PAYLOAD_SECRET is not set — using a derived fallback. Set PAYLOAD_SECRET so rotating other secrets never breaks encryption.");
  }
  return process.env.PAYLOAD_SECRET || process.env.APP_ENCRYPTION_KEY || process.env.CRON_SECRET || process.env.MONGODB_URI || "budget-pro-local-dev-secret";
}

let server: ECDH | null = null;
function serverKey(): ECDH {
  if (!server) {
    const e = createECDH("prime256v1");
    e.setPrivateKey(createHash("sha256").update(`bp-ecdh|${secret()}`).digest());
    server = e;
  }
  return server;
}

/** Uncompressed P-256 public key (65 bytes) as base64url — public, safe to publish. */
export function serverPublicKey(): string {
  return serverKey().getPublicKey().toString("base64url");
}

const cache = new Map<string, Buffer>();

/** AES key shared with the browser that owns `clientPub` (null when the header is missing / invalid). */
export function keyFor(clientPub: string | null | undefined): Buffer | null {
  if (!clientPub || clientPub.length < 80 || clientPub.length > 100 || !/^[A-Za-z0-9_-]+$/.test(clientPub)) return null;
  const hit = cache.get(clientPub);
  if (hit) return hit;
  try {
    const pub = Buffer.from(clientPub, "base64url");
    if (pub.length !== 65 || pub[0] !== 4) return null;
    const shared = serverKey().computeSecret(pub);
    const key = Buffer.from(hkdfSync("sha256", shared, SALT, INFO, 32));
    if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
    cache.set(clientPub, key);
    return key;
  } catch {
    return null;
  }
}

/** base64url( iv[12] | ciphertext | tag[16] ) — the same layout WebCrypto AES-GCM produces. */
export function seal(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64url");
}

export function open(key: Buffer, payload: string): string {
  const buf = Buffer.from(payload, "base64url");
  if (buf.length < 29) throw new Error("bad payload");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

/** Re-wraps a JSON Response as an encrypted one (status, cookies and other headers are kept). */
export async function sealResponse(res: Response, key: Buffer): Promise<Response> {
  const type = res.headers.get("content-type") || "";
  if (!type.includes("application/json")) return res;
  const text = await res.text();
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  headers.set("x-bp-enc", "1");
  headers.set("Cache-Control", headers.get("Cache-Control") || "no-store");
  return new Response(JSON.stringify({ __e: seal(key, text) }), { status: res.status, statusText: res.statusText, headers });
}
