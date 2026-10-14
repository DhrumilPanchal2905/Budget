"use client";

import { useState } from "react";
import useSWR from "swr";
import { Database, Trash2 } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";

interface Coll {
  name: string;
  count: number;
  purgeable: boolean;
  label: string;
  note: string;
}

function PurgeModal({ coll, onClose, onDone }: { coll: Coll | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [older, setOlder] = useState("0");
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const expected = coll ? `DELETE ${coll.name}` : "";

  const run = async () => {
    if (!coll) return;
    setBusy(true);
    setErrors({});
    try {
      const r = await api("/api/admin/database", { method: "DELETE", body: { collection: coll.name, olderThanDays: Number(older), confirm, password } });
      toast.success(r.message || "Deleted.");
      onDone();
      onClose();
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      toast.error("Purge failed", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(coll)}
      onClose={() => !busy && onClose()}
      title={coll ? `Purge ${coll.label}` : ""}
      description={coll?.note}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={run} loading={busy} disabled={confirm !== expected || !password}>
            <Trash2 className="h-4 w-4" /> Purge
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm === expected && password && !busy) void run();
        }}
      >
        <Field label="Which records">
          <Select value={older} onChange={(e) => setOlder(e.target.value)}>
            <option value="0">All records in this collection</option>
            <option value="7">Older than 7 days</option>
            <option value="30">Older than 30 days</option>
            <option value="90">Older than 90 days</option>
            <option value="365">Older than 1 year</option>
          </Select>
        </Field>
        <Field label={`Type "${expected}" to confirm`} error={errors.confirm}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Your admin password" error={errors.password}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">This action is permanent and is recorded in the audit log.</p>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function Inner() {
  const { can } = useSession();
  const { data, error, isLoading, mutate } = useSWR<{ collections: Coll[] }>("/api/admin/database");
  const [target, setTarget] = useState<Coll | null>(null);
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !data) return <Skeleton className="h-96" />;
  return (
    <>
      <Card>
        <ul className="divide-y divide-border">
          {data.collections.map((c) => (
            <li key={c.name} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted">
                  <Database className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-sm">{c.name}</p>
                  <p className="truncate text-xs text-muted">{c.note}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:justify-end">
                <span className="tabular text-sm font-semibold">{c.count.toLocaleString("en-IN")}</span>
                {c.purgeable ? (
                  can("database.delete") ? (
                    <Button size="sm" variant="outline" className="hover:border-danger hover:text-danger" onClick={() => setTarget(c)}>
                      <Trash2 className="h-3.5 w-3.5" /> Purge
                    </Button>
                  ) : (
                    <Badge>view only</Badge>
                  )
                ) : (
                  <Badge>protected</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-3 text-xs text-muted">Users and finance data are protected from bulk deletion. Delete individual users from the Users page. Database credentials are never exposed to the browser.</p>
      <PurgeModal coll={target} onClose={() => setTarget(null)} onDone={() => mutate()} />
    </>
  );
}

export default function DatabasePage() {
  return (
    <RequirePerm admin perm="database.view">
      <PageHeader title="Database" subtitle="Collection overview and protected maintenance actions." />
      <Inner />
    </RequirePerm>
  );
}
