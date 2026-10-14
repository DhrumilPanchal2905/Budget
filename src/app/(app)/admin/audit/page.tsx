"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ChevronDown, Search } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { Badge, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Skeleton, cn } from "@/components/ui";
import { qs } from "@/lib/client";

interface Entry {
  id: string;
  action: string;
  actorEmail: string;
  actorRole: string | null;
  resource: string | null;
  resourceId: string | null;
  targetUserId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

const tone = (a: string) => (a.includes("delete") ? "danger" : a.startsWith("admin.") ? "warning" : a.startsWith("auth.") ? "info" : "default");

function Inner() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [dq, action]);
  const { data, error, isLoading, mutate } = useSWR<{ items: Entry[]; total: number; page: number; pages: number }>(`/api/admin/audit${qs({ q: dq, action, page, limit: 30 })}`);

  return (
    <Card>
      <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search actor email or action…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="sm:w-56">
          <option value="">All actions</option>
          <option value="auth.">Authentication</option>
          <option value="finance.">User finance changes</option>
          <option value="admin.finance.">Admin finance changes</option>
          <option value="admin.user.">Admin user changes</option>
          <option value="admin.database.">Database operations</option>
          <option value="admin.notification.">Notifications</option>
          <option value="profile.">Profile updates</option>
          <option value="reports.">Exports</option>
          <option value="system.">System jobs</option>
        </Select>
      </div>
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : !data.items.length ? (
        <EmptyState title="No audit entries" />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {data.items.map((e) => (
              <li key={e.id}>
                <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={tone(e.action)} className="font-mono">
                        {e.action}
                      </Badge>
                      {e.resource && <span className="text-xs text-muted">{e.resource}</span>}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {e.actorEmail}
                      {e.actorRole ? ` (${e.actorRole})` : ""} · {new Date(e.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open === e.id && "rotate-180")} />
                </button>
                {open === e.id && (
                  <pre className="mx-5 mb-3 overflow-x-auto rounded-lg border border-border bg-surface-2/60 p-3 text-[11px] text-muted">
                    {JSON.stringify({ resourceId: e.resourceId, targetUserId: e.targetUserId, ip: e.ip, metadata: e.metadata }, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} total={data.total} />
        </>
      )}
    </Card>
  );
}

export default function AuditPage() {
  return (
    <RequirePerm admin perm="audit.view">
      <PageHeader title="Audit log" subtitle="Every security-relevant action. Secrets are never recorded." />
      <Inner />
    </RequirePerm>
  );
}
