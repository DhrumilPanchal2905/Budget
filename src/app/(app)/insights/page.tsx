"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Bot, Lock, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { InsightRow, type InsightView } from "@/components/insight-card";
import { useAngelOptional } from "@/components/angel/angel-provider";
import { useSession } from "@/components/session";
import { Button, Card, ErrorState, PageHeader, Select, Skeleton } from "@/components/ui";
import { timeAgo } from "@/lib/client";

interface Resp {
  insights: (InsightView & { ask?: string; href?: string })[];
  lockedCount: number;
  generatedAt: string;
  advancedEnabled: boolean;
  plan: string;
  lang: string;
}

const LANGS = [
  { v: "en", l: "English" },
  { v: "hi", l: "हिंदी" },
  { v: "gu", l: "ગુજરાતી" },
  { v: "hn", l: "Hinglish" },
];

function Inner() {
  const { user } = useSession();
  const angel = useAngelOptional();
  const [lang, setLang] = useState<string>(user.language && user.language !== "auto" ? user.language : "en");
  useEffect(() => {
    try {
      const v = localStorage.getItem("bp_insights_lang");
      if (v && LANGS.some((x) => x.v === v)) setLang(v);
    } catch {
      /* storage blocked */
    }
  }, []);
  const { data, error, isLoading, mutate, isValidating } = useSWR<Resp>(`/api/insights?lang=${lang}`);

  const changeLang = (v: string) => {
    setLang(v);
    try {
      localStorage.setItem("bp_insights_lang", v);
    } catch {
      /* ignore */
    }
  };

  const ask = (q: string) => {
    if (!angel?.eligible) return;
    angel.setOpen(true);
    void angel.send(q, "text");
  };

  return (
    <>
      <PageHeader
        title="Angel AI suggestions"
        subtitle={data ? `Thought through from your real numbers · updated ${timeAgo(data.generatedAt)}` : "Personal suggestions from Budget Pro's own AI, based on your real data."}
        actions={
          <>
            <Select value={lang} onChange={(e) => changeLang(e.target.value)} className="w-36" aria-label="Language">
              {LANGS.map((x) => (
                <option key={x.v} value={x.v}>
                  {x.l}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={() => mutate()} loading={isValidating}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </>
        }
      />
      <Card className="mb-4 flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <Bot className="h-5 w-5" />
        </span>
        <p className="text-sm text-muted">
          These come from <span className="font-medium text-fg">Angel</span>, Budget Pro&apos;s own AI (no third-party AI). It compares this month with your usual, checks budgets, goals, EMIs and your emergency cushion, and tells you what to do next.
          {angel?.eligible ? " Tap “Ask Angel” on any card to go deeper." : ""}
        </p>
      </Card>
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
            <div key={i.id} className="space-y-1.5">
              <InsightRow insight={i} />
              {(i.ask || i.href) && (
                <div className="flex flex-wrap gap-2 pl-12">
                  {i.ask && angel?.eligible && (
                    <Button size="sm" variant="ghost" onClick={() => ask(i.ask!)}>
                      <MessageCircle className="h-3.5 w-3.5" /> Ask Angel: {i.ask}
                    </Button>
                  )}
                  {i.href && (
                    <Link href={i.href}>
                      <Button size="sm" variant="ghost">
                        Open →
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </div>
          ))}
          {!data.advancedEnabled && (
            <Card className="glow flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                {data.lockedCount ? <Lock className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{data.lockedCount ? `${data.lockedCount} advanced suggestion${data.lockedCount === 1 ? "" : "s"} available` : "Advanced suggestions"}</p>
                <p className="text-sm text-muted">Your 50/30/20 split, category anomalies, subscriptions review, debt-free date and more are included in Plus, Pro and Unlimited.</p>
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
