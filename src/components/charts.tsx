"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useId, useState } from "react";
import { useSession } from "./session";
import { cn } from "./ui";

// Categorical palette (validated, theme-aware via CSS variables). Assigned in fixed order.
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];
export const INCOME_COLOR = SERIES[0];
export const EXPENSE_COLOR = SERIES[1];
export const SAVINGS_COLOR = SERIES[2];

interface TooltipRow {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

function ChartTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: TooltipRow[]; label?: string | number; formatter: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] rounded-xl border border-border bg-surface/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur">
      {label !== undefined && label !== "" && <p className="mb-1.5 font-medium text-fg">{label}</p>}
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tabular font-medium text-fg">{formatter(Number(p.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted", className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

const axisProps = { tickLine: false, axisLine: false, fontSize: 11, tickMargin: 8 } as const;

// ---------- Income vs expense (grouped bars) ----------
export function IncomeExpenseBars({
  data,
  height = 280,
  showSavings = false,
  xKey = "label",
}: {
  data: { income: number; expense: number; savings?: number; [k: string]: unknown }[];
  height?: number;
  showSavings?: boolean;
  xKey?: string;
}) {
  const { money } = useSession();
  return (
    <div>
      <Legend
        className="mb-3"
        items={[
          { label: "Income", color: INCOME_COLOR },
          { label: "Expenses", color: EXPENSE_COLOR },
          ...(showSavings ? [{ label: "Net savings", color: SAVINGS_COLOR }] : []),
        ]}
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...axisProps} width={56} tickFormatter={(v: number) => money(v, true)} />
            <Tooltip cursor={{ fill: "rgb(var(--fg) / 0.04)" }} content={<ChartTooltip formatter={(v) => money(v)} />} />
            <ReferenceLine y={0} stroke="rgb(var(--border))" />
            <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Bar dataKey="expense" name="Expenses" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={26} />
            {showSavings && <Bar dataKey="savings" name="Net savings" fill={SAVINGS_COLOR} radius={[4, 4, 0, 0]} maxBarSize={26} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- Area trend (income & expense lines) ----------
export function TrendArea({ data, height = 260 }: { data: { label: string; income: number; expense: number }[]; height?: number }) {
  const { money } = useSession();
  const id = useId().replace(/:/g, "");
  return (
    <div>
      <Legend className="mb-3" items={[{ label: "Income", color: INCOME_COLOR }, { label: "Expenses", color: EXPENSE_COLOR }]} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`inc-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.28} />
                <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`exp-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.22} />
                <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={56} tickFormatter={(v: number) => money(v, true)} />
            <Tooltip cursor={{ stroke: "rgb(var(--muted))", strokeDasharray: "3 3" }} content={<ChartTooltip formatter={(v) => money(v)} />} />
            <Area type="monotone" dataKey="income" name="Income" stroke={INCOME_COLOR} strokeWidth={2} fill={`url(#inc-${id})`} activeDot={{ r: 4, strokeWidth: 2, stroke: "rgb(var(--surface))" }} />
            <Area type="monotone" dataKey="expense" name="Expenses" stroke={EXPENSE_COLOR} strokeWidth={2} fill={`url(#exp-${id})`} activeDot={{ r: 4, strokeWidth: 2, stroke: "rgb(var(--surface))" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- Single-series line (savings, balance) ----------
export function SingleLine({
  data,
  dataKey,
  name,
  height = 240,
  color = SAVINGS_COLOR,
  xKey = "label",
  currency = true,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  name: string;
  height?: number;
  color?: string;
  xKey?: string;
  currency?: boolean;
}) {
  const { money } = useSession();
  const fmt = (v: number) => (currency ? money(v) : `${v}`);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" minTickGap={10} />
          <YAxis {...axisProps} width={56} tickFormatter={(v: number) => (currency ? money(v, true) : String(v))} />
          <Tooltip cursor={{ stroke: "rgb(var(--muted))", strokeDasharray: "3 3" }} content={<ChartTooltip formatter={fmt} />} />
          <ReferenceLine y={0} stroke="rgb(var(--border))" />
          <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "rgb(var(--surface))" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Simple bars (single series, e.g. signups) ----------
export function SimpleBars({ data, dataKey, name, height = 220, color = SERIES[0], currency = false }: { data: Record<string, unknown>[]; dataKey: string; name: string; height?: number; color?: string; currency?: boolean }) {
  const { money } = useSession();
  const fmt = (v: number) => (currency ? money(v) : v.toLocaleString("en-IN"));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} width={40} allowDecimals={false} tickFormatter={(v: number) => (currency ? money(v, true) : String(v))} />
          <Tooltip cursor={{ fill: "rgb(var(--fg) / 0.04)" }} content={<ChartTooltip formatter={fmt} />} />
          <Bar dataKey={dataKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Donut with legend list ----------
export function CategoryDonut({ data, height = 220, emptyText = "No data yet" }: { data: { category: string; total: number; share: number }[]; height?: number; emptyText?: string }) {
  const { money } = useSession();
  const [active, setActive] = useState<number | null>(null);
  // Never more than 8 hues: fold the tail into "Other".
  const rows = data.length > 8 ? [...data.slice(0, 7), data.slice(7).reduce((acc, r) => ({ category: "Other", total: acc.total + r.total, share: Math.round((acc.share + r.share) * 10) / 10 }), { category: "Other", total: 0, share: 0 })] : data;
  const total = rows.reduce((s, r) => s + r.total, 0);
  if (!rows.length || total <= 0) return <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>{emptyText}</div>;
  const focus = active !== null ? rows[active] : null;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="total"
              nameKey="category"
              innerRadius="64%"
              outerRadius="92%"
              paddingAngle={rows.length > 1 ? 1.5 : 0}
              stroke="rgb(var(--surface))"
              strokeWidth={2}
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
              isAnimationActive
            >
              {rows.map((r, i) => (
                <Cell key={r.category} fill={SERIES[i % SERIES.length]} opacity={active === null || active === i ? 1 : 0.35} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-muted">{focus ? focus.category : "Total"}</span>
          <span className="tabular text-base font-semibold">{money(focus ? focus.total : total, true)}</span>
          {focus && <span className="text-[11px] text-muted">{focus.share}%</span>}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.category} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors", active === i && "bg-surface-2")}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="min-w-0 flex-1 truncate text-muted">{r.category}</span>
            <span className="tabular font-medium">{money(r.total, true)}</span>
            <span className="tabular w-11 text-right text-muted">{r.share}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Category comparison (horizontal bars, current vs previous) ----------
export function CategoryComparison({ data, height }: { data: { category: string; current: number; previous: number }[]; height?: number }) {
  const { money } = useSession();
  const rows = data.slice(0, 8);
  const h = height ?? Math.max(160, rows.length * 44);
  return (
    <div>
      <Legend className="mb-3" items={[{ label: "This month", color: EXPENSE_COLOR }, { label: "Last month", color: "rgb(var(--muted) / 0.45)" }]} />
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" barGap={2} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" {...axisProps} tickFormatter={(v: number) => money(v, true)} />
            <YAxis type="category" dataKey="category" {...axisProps} width={110} />
            <Tooltip cursor={{ fill: "rgb(var(--fg) / 0.04)" }} content={<ChartTooltip formatter={(v) => money(v)} />} />
            <Bar dataKey="current" name="This month" fill={EXPENSE_COLOR} radius={[0, 4, 4, 0]} maxBarSize={14} />
            <Bar dataKey="previous" name="Last month" fill="rgb(var(--muted) / 0.45)" radius={[0, 4, 4, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
