// Approximate visitor location from the hosting edge (Vercel adds these headers to every request for free —
// no third-party geo service, no browser permission prompt). Accuracy: country reliable, city approximate.
// On other hosts the Cloudflare headers are used when present; locally everything is simply unknown.

export interface Geo {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
}

const decode = (v: string | null) => {
  if (!v) return undefined;
  try {
    return decodeURIComponent(v).slice(0, 80);
  } catch {
    return v.slice(0, 80);
  }
};

let regionNames: Intl.DisplayNames | null = null;
function countryName(code?: string): string | undefined {
  if (!code || code.length !== 2) return undefined;
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function geoFromHeaders(h: Headers): Geo {
  const cc = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "").toUpperCase() || undefined;
  const lat = Number(h.get("x-vercel-ip-latitude") || h.get("cf-iplatitude"));
  const lon = Number(h.get("x-vercel-ip-longitude") || h.get("cf-iplongitude"));
  return {
    countryCode: cc && cc !== "XX" ? cc : undefined,
    country: cc && cc !== "XX" ? countryName(cc) : undefined,
    region: decode(h.get("x-vercel-ip-country-region") || h.get("cf-region")),
    city: decode(h.get("x-vercel-ip-city") || h.get("cf-ipcity")),
    lat: Number.isFinite(lat) && lat !== 0 ? Math.round(lat * 100) / 100 : undefined,
    lon: Number.isFinite(lon) && lon !== 0 ? Math.round(lon * 100) / 100 : undefined,
    timezone: decode(h.get("x-vercel-ip-timezone") || h.get("cf-timezone")),
  };
}

export function placeLabel(g: { city?: string; region?: string; country?: string } | null | undefined): string {
  if (!g) return "Unknown";
  return [g.city, g.region, g.country].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ") || "Unknown";
}

/** Small, dependency-free user-agent summary for the admin visitors list. */
export function parseUA(ua: string): { device: string; browser: string; os: string } {
  const s = ua || "";
  const device = /ipad|tablet/i.test(s) ? "tablet" : /mobi|iphone|android/i.test(s) ? "mobile" : /bot|crawl|spider|slurp|preview/i.test(s) ? "bot" : "desktop";
  const browser = /edg\//i.test(s)
    ? "Edge"
    : /opr\/|opera/i.test(s)
      ? "Opera"
      : /samsungbrowser/i.test(s)
        ? "Samsung Internet"
        : /chrome|crios/i.test(s)
          ? "Chrome"
          : /firefox|fxios/i.test(s)
            ? "Firefox"
            : /safari/i.test(s)
              ? "Safari"
              : /bot|crawl|spider/i.test(s)
                ? "Bot"
                : "Other";
  const os = /windows/i.test(s) ? "Windows" : /android/i.test(s) ? "Android" : /iphone|ipad|ios/i.test(s) ? "iOS" : /mac os/i.test(s) ? "macOS" : /linux/i.test(s) ? "Linux" : "Other";
  return { device, browser, os };
}

/** 🇮🇳 from "IN" */
export function flag(cc?: string): string {
  if (!cc || cc.length !== 2) return "🌐";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
