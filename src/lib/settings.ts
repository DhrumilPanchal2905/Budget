// Admin-editable app settings stored in MongoDB (collection `appsettings`).
// Secrets (e.g. the Gmail app password) are encrypted at rest with AES-256-GCM using a key derived from the
// server secret — the database alone is not enough to read them, and they are never sent back to the browser.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { AppSetting } from "./models";

function key(): Buffer {
  const secret = process.env.PAYLOAD_SECRET || process.env.APP_ENCRYPTION_KEY || process.env.CRON_SECRET || process.env.MONGODB_URI || "budget-pro-local-dev-secret";
  return createHash("sha256").update(`bp-settings|${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64url")}`;
}

export function decryptSecret(enc: string | null | undefined): string | null {
  if (!enc || !enc.startsWith("v1.")) return null;
  try {
    const buf = Buffer.from(enc.slice(3), "base64url");
    const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(buf.length - 16));
    return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 30_000;

export async function getSetting<T = unknown>(k: string): Promise<T | null> {
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = await AppSetting.findOne({ key: k }).lean();
  const value = (doc?.value ?? null) as T | null;
  cache.set(k, { at: Date.now(), value });
  return value;
}

export async function setSetting(k: string, value: unknown, updatedBy?: unknown) {
  await AppSetting.updateOne({ key: k }, { $set: { value, updatedBy, updatedAt: new Date() } }, { upsert: true });
  cache.delete(k);
}
