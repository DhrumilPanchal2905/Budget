import { route, ok, searchParams } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";

const cache = new Map<string, { at: number; rates: Record<string, number>; updated: string }>();

/** Live exchange rates for the free currency converter (ExchangeRate-API open endpoint, cached for 1 hour). */
export const GET = route({ auth: false }, async ({ req, ip }) => {
  await rateLimit(`fx:${ip}`, 60, 60);
  const base = (searchParams(req).get("base") || "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) throw new ApiError(400, "Invalid currency.");
  let hit = cache.get(base);
  if (!hit || Date.now() - hit.at > 3600_000) {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
      const d = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
      if (d.result !== "success" || !d.rates) throw new Error("bad response");
      hit = { at: Date.now(), rates: d.rates, updated: d.time_last_update_utc ?? new Date().toUTCString() };
      cache.set(base, hit);
    } catch {
      if (!hit) throw new ApiError(503, "Live rates are unavailable right now. Please try again shortly.");
    }
  }
  return ok({ base, rates: hit.rates, updated: hit.updated, source: "ExchangeRate-API" });
});
