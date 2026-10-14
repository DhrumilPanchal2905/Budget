"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, Tabs, cn } from "@/components/ui";
import { api, qs, timeAgo } from "@/lib/client";

interface N {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_TONE: Record<string, "primary" | "warning" | "success" | "info" | "default" | "danger"> = {
  finance: "primary",
  admin: "warning",
  goal: "success",
  debt: "danger",
  insight: "info",
  system: "default",
};

function Inner() {
  const { can } = useSession();
  const toast = useToast();
  const { mutate: gm } = useSWRConfig();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const key = `/api/notifications${qs({ page, limit: 20, unread: filter === "unread" ? "1" : undefined })}`;
  const { data, error, isLoading, mutate } = useSWR<{ items: N[]; total: number; unread: number; page: number; pages: number }>(key);
  const manage = can("notifications.manage");

  const refresh = () => {
    void mutate();
    void gm((k) => typeof k === "string" && (k.startsWith("/api/notifications") || k.startsWith("/api/dashboard")));
  };

  const run = async (id: string, fn: () => Promise<{ message?: string }>) => {
    setBusy(id);
    try {
      const r = await fn();
      if (r.message) toast.success(r.message);
      refresh();
    } catch (e) {
      toast.error("Action failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={data ? `${data.unread} unread` : undefined}
        actions={
          manage && data?.total ? (
            <>
              <Button variant="secondary" onClick={() => run("all-read", () => api("/api/notifications", { method: "PATCH" }))} loading={busy === "all-read"} disabled={!data.unread}>
                <CheckCheck className="h-4 w-4" /> Mark all read
              </Button>
              <Button variant="danger" onClick={() => setConfirmAll(true)}>
                <Trash2 className="h-4 w-4" /> Delete all
              </Button>
            </>
          ) : undefined
        }
      />
      <Tabs
        className="mb-4"
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setPage(1);
        }}
        items={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread" },
        ]}
      />
      <Card>
        {error ? (
          <ErrorState message={error.message} onRetry={() => mutate()} />
        ) : isLoading || !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !data.items.length ? (
          <EmptyState icon={<Bell className="h-5 w-5" />} title={filter === "unread" ? "No unread notifications" : "No notifications yet"} />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {data.items.map((n) => (
                <li key={n.id} className={cn("flex gap-3 px-4 py-3.5 sm:px-5", !n.read && "bg-primary/[0.04]")}>
                  <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-border" : "bg-primary")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{n.title}</p>
                      <Badge tone={TYPE_TONE[n.type] ?? "default"}>{n.type}</Badge>
                      <span className="text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{n.message}</p>
                    {n.link && (
                      <Link href={n.link} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                        Open
                      </Link>
                    )}
                  </div>
                  {manage && (
                    <div className="flex shrink-0 items-start gap-1">
                      {!n.read && (
                        <Button size="icon" variant="ghost" aria-label="Mark as read" loading={busy === `r-${n.id}`} onClick={() => run(`r-${n.id}`, () => api(`/api/notifications/${n.id}`, { method: "PATCH" }))}>
                          {busy !== `r-${n.id}` && <CheckCheck className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="hover:text-danger" aria-label="Delete" loading={busy === `d-${n.id}`} onClick={() => run(`d-${n.id}`, () => api(`/api/notifications/${n.id}`, { method: "DELETE" }))}>
                        {busy !== `d-${n.id}` && <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} onChange={setPage} total={data.total} />
          </>
        )}
      </Card>
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        loading={busy === "all-del"}
        title="Delete all notifications?"
        message="Every notification in your inbox will be permanently deleted."
        confirmLabel="Delete all"
        onConfirm={async () => {
          await run("all-del", () => api("/api/notifications", { method: "DELETE" }));
          setConfirmAll(false);
        }}
      />
    </>
  );
}

export default function NotificationsPage() {
  return (
    <RequirePerm perm="notifications.read">
      <Inner />
    </RequirePerm>
  );
}
