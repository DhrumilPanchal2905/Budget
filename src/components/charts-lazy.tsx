"use client";

// Charts loaded on demand: the chart library (recharts) is the heaviest part of the app, so pages now
// show their numbers first and the charts stream in a moment later instead of blocking the whole page.
import dynamic from "next/dynamic";

export { SERIES, INCOME_COLOR, EXPENSE_COLOR, SAVINGS_COLOR } from "./chart-colors";

const placeholder = (height: number) =>
  function ChartPlaceholder() {
    return <div className="w-full animate-pulse rounded-xl bg-surface-2/60" style={{ height }} aria-hidden />;
  };

export const TrendArea = dynamic(() => import("./charts").then((m) => m.TrendArea), { ssr: false, loading: placeholder(288) });
export const CategoryDonut = dynamic(() => import("./charts").then((m) => m.CategoryDonut), { ssr: false, loading: placeholder(200) });
export const IncomeExpenseBars = dynamic(() => import("./charts").then((m) => m.IncomeExpenseBars), { ssr: false, loading: placeholder(300) });
export const SingleLine = dynamic(() => import("./charts").then((m) => m.SingleLine), { ssr: false, loading: placeholder(240) });
export const SimpleBars = dynamic(() => import("./charts").then((m) => m.SimpleBars), { ssr: false, loading: placeholder(220) });
export const CategoryComparison = dynamic(() => import("./charts").then((m) => m.CategoryComparison), { ssr: false, loading: placeholder(220) });
