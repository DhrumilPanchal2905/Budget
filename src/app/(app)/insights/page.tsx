"use client";

import Link from "next/link";
import useSWR from "swr";
import { Lock, RefreshCw, Sparkles } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { InsightRow, type InsightView } from "@/components/insight-card";
import { Button, Card, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { timeAgo } from "@/lib/client";

interface Resp {
  insights: InsightView[];
  lockedCount: number;
  generatedAt: string;
  advancedEnabled: boolean;
  plan: string;
}

function Inner() {
  const { data, error, isLoading, mutate, isValidating } = useSWR<Resp>("/api/insights");
  return (
    <>
      <PageHeader
        title="Financial insights"
        subtitle={data ? `Generated from your real data · updated ${timeAgo(data.generatedAt)}` : "Personalised suggestions from your real data."}
        actions={
          <Button variant="secondary" onClick={() => mutate()} loading={isValidating}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {data.insights.map((i) => (
            <InsightRow key={i.id} insight={i} />
          ))}
          {!data.advancedEnabled && (
            <Card className="glow flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                {data.lockedCount ? <Lock className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {data.lockedCount ? `${data.lockedCount} advanced insight${data.lockedCount === 1 ? "" : "s"} available` : "Advanced insights"}
                </p>
                <p className="text-sm text-muted">Category anomalies, goal feasibility, debt-free projections and more are included in Plus and Pro.</p>
              </div>
              <Link href="/plan">
                <Button>View plans</Button>
              </Link>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

export default function InsightsPage() {
  return (
    <RequirePerm perm={["insights.view", "finance.read"]}>
      <Inner />
    </RequirePerm>
  );
}
