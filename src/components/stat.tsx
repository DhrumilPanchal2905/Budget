"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card, cn } from "./ui";

export function StatCard({
  label,
  value,
  icon,
  change,
  changeGoodWhenUp = true,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  change?: number | null;
  changeGoodWhenUp?: boolean;
  hint?: ReactNode;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const up = (change ?? 0) >= 0;
  const good = change === null || change === undefined ? null : up === changeGoodWhenUp;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted">{icon}</span>}
      </div>
      <p
        className={cn(
          "tabular mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
      <div className="mt-1.5 flex min-h-[18px] flex-wrap items-center gap-2 text-xs text-muted">
        {change !== null && change !== undefined && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-danger")}>
            {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(change)}%
          </span>
        )}
        {hint}
      </div>
    </Card>
  );
}
