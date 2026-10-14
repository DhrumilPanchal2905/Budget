import { RateLimit } from "./models";
import { Errors } from "./errors";

/**
 * Fixed-window rate limiter stored in MongoDB, so it works across all serverless instances.
 * Throws a 429 ApiError when the limit is exceeded.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Date.now(); 
  const windowIndex = Math.floor(now / (windowSeconds * 1000));
  const bucket = `${key}:${windowIndex}`;
  const doc = await RateLimit.findOneAndUpdate(
    { key: bucket },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((windowIndex + 1) * windowSeconds * 1000 + 60_000) } },
    { upsert: true, new: true },
  ).lean<{ count: number } | null>();
  if (doc && doc.count > limit) throw Errors.tooMany();
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return (headers.get("x-real-ip") || "unknown").slice(0, 64);
}
