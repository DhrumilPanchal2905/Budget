"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Globe, Laptop, MapPin, Monitor, Radio, Smartphone, Tablet, Users } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { StatCard } from "@/components/stat";
import { SimpleBars } from "@/components/charts-lazy";
import { Badge, Card, CardHeader, ErrorState, PageHeader, Skeleton, Tabs } from "@/components/ui";
import { timeAgo } from "@/lib/client";
import { flag } from "@/lib/geo";

interface Resp {
  range: string;
  onlineNow: number;
  totals: { views: number; visitors: number; signedIn: number };
  countries: { country: string; code: string | null; visitors: number; views: number }[];
  cities: { place: string; code: string | null; visitors: number; lat: number | null; lon: number | null }[];
  devices: { name: string; n: number }[];
  browsers: { name: string; n: number }[];
  pages: { path: string; n: number }[];
  referrers: { source: string; n: number }[];
  daily: { label: string; views: number; visitors: number }[];
  recent: { id: string; at: string; path: string; place: string; code: string | null; device: string; browser: string; os: string; ip: string | null; referrer: string | null; user: { id: string; name: string; email: string } | null; visitor: string }[];
}

const DeviceIcon = ({ d }: { d: string }) => (d === "mobile" ? <Smartphone className="h-3.5 w-3.5" /> : d === "tablet" ? <Tablet className="h-3.5 w-3.5" /> : d === "desktop" ? <Monitor className="h-3.5 w-3.5" /> : <Laptop className="h-3.5 w-3.5" />);

/** Tiny dependency-free world dot map (equirectangular). Bigger dot = more visitors. */
function DotMap({ cities }: { cities: Resp["cities"] }) {
  const pts = cities.filter((c) => c.lat !== null && c.lon !== null);
  const max = Math.max(1, ...pts.map((p) => p.visitors));
  return (
    <svg viewBox="0 0 360 180" className="h-auto w-full rounded-xl border border-border bg-surface-2/40" role="img" aria-label="Visitor locations map">
      {Array.from({ length: 11 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 36} y1={0} x2={i * 36} y2={180} stroke="rgb(var(--border))" strokeWidth={0.4} />
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={i * 30} x2={360} y2={i * 30} stroke="rgb(var(--border))" strokeWidth={0.4} />
      ))}
      {pts.map((p) => {
        const x = (p.lon! + 180);
        const y = 90 - p.lat!;
        const r = 2 + (p.visitors / max) * 6;
        return (
          <g key={p.place}>
            <circle cx={x} cy={y} r={r + 3} fill="rgb(var(--primary))" opacity={0.15} />
            <circle cx={x} cy={y} r={r} fill="rgb(var(--primary))" opacity={0.85}>
              <title>{`${p.place}: ${p.visitors} visitor${p.visitors === 1 ? "" : "s"}`}</title>
            </circle>
          </g>
        );
      })}
      {!pts.length && (
        <text x={180} y={95} textAnchor="middle" fontSize={9} fill="rgb(var(--muted))">
          Locations appear here once the site is live on Vercel
        </text>
      )}
    </svg>
  );
}

function Inner() {
  const [range, setRange] = useState<"today" | "7d" | "30d" | "90d">("7d");
  const { data, error, isLoading, mutate } = useSWR<Resp>(`/api/admin/visitors?range=${range}`, { refreshInterval: 30_000 });
  return (
    <>
      <PageHeader
        title="Visitors"
        subtitle="Who opens Budget Pro, from where and on what device — updates live."
        actions={<Tabs value={range} onChange={setRange} items={[{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }]} />}
      />
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Online now" value={data.onlineNow} icon={<Radio className="h-4 w-4 text-success" />} hint="active in the last 5 minutes" tone={data.onlineNow ? "success" : "default"} />
            <StatCard label="Unique visitors" value={data.totals.visitors.toLocaleString("en-IN")} icon={<Users className="h-4 w-4" />} />
            <StatCard label="Page views" value={data.totals.views.toLocaleString("en-IN")} icon={<Globe className="h-4 w-4" />} />
            <StatCard label="Signed-in users" value={data.totals.signedIn.toLocaleString("en-IN")} hint="visited while logged in" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Where visitors are" subtitle="Approximate city from the visitor's IP (no GPS, no permission prompt)" />
              <div className="p-4">
                <DotMap cities={data.cities} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Top countries" />
              <ul className="divide-y divide-border px-5 pb-3">
                {data.countries.length ? (
                  data.countries.map((c) => (
                    <li key={`${c.country}-${c.code}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="truncate">
                        {flag(c.code ?? undefined)} {c.country}
                      </span>
                      <span className="tabular text-muted">{c.visitors}</span>
                    </li>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-muted">No visits yet.</p>
                )}
              </ul>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Daily visitors" />
              <div className="px-3 pb-4 pt-4 sm:px-5">
                <SimpleBars data={data.daily} dataKey="visitors" name="Visitors" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Top cities" />
              <ul className="divide-y divide-border px-5 pb-3">
                {data.cities.map((c) => (
                  <li key={c.place} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" /> {c.place}
                    </span>
                    <span className="tabular text-muted">{c.visitors}</span>
                  </li>
                ))}
                {!data.cities.length && <p className="py-6 text-center text-sm text-muted">No city data yet.</p>}
              </ul>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader title="Devices" />
              <ul className="space-y-2 px-5 pb-5 pt-3 text-sm">
                {data.devices.map((d) => (
                  <li key={d.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 capitalize">
                      <DeviceIcon d={d.name} /> {d.name}
                    </span>
                    <span className="tabular text-muted">{d.n}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Browsers" />
              <ul className="space-y-2 px-5 pb-5 pt-3 text-sm">
                {data.browsers.map((d) => (
                  <li key={d.name} className="flex items-center justify-between">
                    <span>{d.name}</span>
                    <span className="tabular text-muted">{d.n}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Top pages & sources" />
              <ul className="space-y-2 px-5 pb-5 pt-3 text-sm">
                {data.pages.slice(0, 5).map((p) => (
                  <li key={p.path} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs">{p.path}</span>
                    <span className="tabular text-muted">{p.n}</span>
                  </li>
                ))}
                {data.referrers.slice(0, 3).map((r) => (
                  <li key={r.source} className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted">↗ {r.source}</span>
                    <span className="tabular text-muted">{r.n}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card>
            <CardHeader title="Latest visits" subtitle="Live — newest first. IPs are partly masked." />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-5 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Who</th>
                    <th className="px-3 py-2 font-medium">Page</th>
                    <th className="px-3 py-2 font-medium">Device</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recent.map((v) => (
                    <tr key={v.id} className="hover:bg-surface-2/40">
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs text-muted">{timeAgo(v.at)}</td>
                      <td className="px-3 py-2.5">
                        <span className="whitespace-nowrap">
                          {flag(v.code ?? undefined)} {v.place}
                        </span>
                        {v.ip && <span className="block font-mono text-[10px] text-muted">{v.ip}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {v.user ? (
                          <Link href={`/admin/users/${v.user.id}`} className="font-medium text-primary hover:underline">
                            {v.user.name}
                          </Link>
                        ) : (
                          <Badge>guest · {v.visitor}</Badge>
                        )}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 font-mono text-xs">{v.path}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <DeviceIcon d={v.device} /> {v.browser} · {v.os}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.recent.length && <p className="py-8 text-center text-sm text-muted">No visits in this period.</p>}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

export default function VisitorsPage() {
  return (
    <RequirePerm admin perm="users.view">
      <Inner />
    </RequirePerm>
  );
}
