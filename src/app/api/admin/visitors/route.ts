import { route, ok } from "@/lib/api";
import { Visit } from "@/lib/models";
import { placeLabel } from "@/lib/geo";
import { APP_TIMEZONE } from "@/lib/env";

export const runtime = "nodejs";

const RANGES: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

function startOfTodayIST(): Date {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000; // timezone offset in ms
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
}

function maskIp(ip?: string | null): string | null {
  if (!ip) return null;
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + ":…";
  return ip.replace(/(\d+\.\d+)\.\d+\.\d+$/, "$1.x.x");
}

/** Admin → Visitors: who opens the website, from where (approximate, IP-based), on what device — live. */
export const GET = route({ admin: true, perms: ["users.view"] }, async ({ req }) => {
  const range = req.nextUrl.searchParams.get("range") || "7d";
  const days = RANGES[range] ?? 7;
  const from = days === 1 ? startOfTodayIST() : new Date(Date.now() - days * 86400000);
  const match = { createdAt: { $gte: from } };
  const fiveMin = new Date(Date.now() - 5 * 60 * 1000);

  const [totals, online, countries, cities, devices, browsers, pages, daily, recent, referrers] = await Promise.all([
    Visit.aggregate([{ $match: match }, { $group: { _id: null, views: { $sum: 1 }, visitors: { $addToSet: "$visitorId" }, users: { $addToSet: "$userId" } } }, { $project: { views: 1, visitors: { $size: "$visitors" }, users: { $size: { $setDifference: ["$users", [null]] } } } }]),
    Visit.aggregate([{ $match: { createdAt: { $gte: fiveMin } } }, { $group: { _id: "$visitorId" } }, { $count: "n" }]),
    Visit.aggregate([{ $match: match }, { $group: { _id: { c: "$country", cc: "$countryCode" }, views: { $sum: 1 }, visitors: { $addToSet: "$visitorId" } } }, { $project: { views: 1, visitors: { $size: "$visitors" } } }, { $sort: { visitors: -1 } }, { $limit: 12 }]),
    Visit.aggregate([{ $match: { ...match, city: { $exists: true, $ne: null } } }, { $group: { _id: { city: "$city", region: "$region", country: "$country", cc: "$countryCode" }, visitors: { $addToSet: "$visitorId" }, lat: { $first: "$lat" }, lon: { $first: "$lon" } } }, { $project: { lat: 1, lon: 1, visitors: { $size: "$visitors" } } }, { $sort: { visitors: -1 } }, { $limit: 15 }]),
    Visit.aggregate([{ $match: match }, { $group: { _id: "$device", n: { $addToSet: "$visitorId" } } }, { $project: { n: { $size: "$n" } } }, { $sort: { n: -1 } }]),
    Visit.aggregate([{ $match: match }, { $group: { _id: "$browser", n: { $addToSet: "$visitorId" } } }, { $project: { n: { $size: "$n" } } }, { $sort: { n: -1 } }, { $limit: 6 }]),
    Visit.aggregate([{ $match: match }, { $group: { _id: "$path", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]),
    Visit.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - Math.max(days, 7) * 86400000) } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: APP_TIMEZONE } }, views: { $sum: 1 }, visitors: { $addToSet: "$visitorId" } } },
      { $project: { views: 1, visitors: { $size: "$visitors" } } },
      { $sort: { _id: 1 } },
    ]),
    Visit.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $limit: 60 },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "u", pipeline: [{ $project: { name: 1, email: 1 } }] } },
    ]),
    Visit.aggregate([{ $match: { ...match, referrer: { $nin: ["", null] } } }, { $group: { _id: "$referrer", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
  ]);
  const t = totals[0] ?? { views: 0, visitors: 0, users: 0 };
  return ok({
    range,
    onlineNow: online[0]?.n ?? 0,
    totals: { views: t.views, visitors: t.visitors, signedIn: t.users },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countries: countries.map((c: any) => ({ country: c._id.c ?? "Unknown", code: c._id.cc ?? null, visitors: c.visitors, views: c.views })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cities: cities.map((c: any) => ({ place: placeLabel({ city: c._id.city, region: c._id.region, country: c._id.country }), code: c._id.cc ?? null, visitors: c.visitors, lat: c.lat ?? null, lon: c.lon ?? null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    devices: devices.map((d: any) => ({ name: d._id ?? "other", n: d.n })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browsers: browsers.map((d: any) => ({ name: d._id ?? "Other", n: d.n })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pages: pages.map((p: any) => ({ path: p._id, n: p.n })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    referrers: referrers.map((r: any) => ({ source: r._id, n: r.n })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    daily: daily.map((d: any) => ({ label: String(d._id).slice(5), views: d.views, visitors: d.visitors })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recent: recent.map((v: any) => ({
      id: String(v._id),
      at: v.createdAt,
      path: v.path,
      place: placeLabel(v),
      code: v.countryCode ?? null,
      device: v.device,
      browser: v.browser,
      os: v.os,
      ip: maskIp(v.ip),
      referrer: v.referrer || null,
      user: v.u?.[0] ? { id: String(v.u[0]._id), name: v.u[0].name, email: v.u[0].email } : null,
      visitor: String(v.visitorId).slice(0, 6),
    })),
  });
});
