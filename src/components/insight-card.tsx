"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "./ui";

export interface InsightView {
  id: string;
  severity: "positive" | "info" | "warning" | "critical";
  title: string;
  message: string;
  advanced: boolean;
  metric?: string;
}

const meta = {
  positive: { icon: CheckCircle2, cls: "text-success bg-success/10 border-success/20", label: "Good" },
  info: { icon: Info, cls: "text-info bg-info/10 border-info/20", label: "Info" },
  warning: { icon: AlertTriangle, cls: "text-warning bg-warning/10 border-warning/20", label: "Attention" },
  critical: { icon: AlertOctagon, cls: "text-danger bg-danger/10 border-danger/20", label: "Critical" },
};

export function InsightRow({ insight, compact }: { insight: InsightView; compact?: boolean }) {
  const m = meta[insight.severity];
  const Icon = m.icon;
  return (
    <div className={cn("flex gap-3", compact ? "py-3" : "rounded-xl border border-border bg-surface p-4")}>
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", m.cls)} aria-label={m.label}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{insight.title}</p>
          {insight.metric && <span className="tabular rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{insight.metric}</span>}
          {insight.advanced && !compact && <span className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">ADVANCED</span>}
        </div>
        <p className="mt-0.5 text-sm text-muted">{insight.message}</p>
      </div>
    </div>
  );
}
