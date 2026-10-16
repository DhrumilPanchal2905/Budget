"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Ban, CheckCircle2, Send, Trash2 } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { StatCard } from "@/components/stat";
import { IncomeExpenseBars } from "@/components/charts-lazy";
import { FinanceManager } from "@/components/finance-page";
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, PageHeader, Select, Skeleton, Tabs, Textarea, cn } from "@/components/ui";
import { api, ApiClientError, timeAgo } from "@/lib/client";
import { PERMISSION_GROUPS, isAdminPermission, type Permission } from "@/lib/permissions";
import type { ResourceKey } from "@/lib/finance-config";
import { limitLabel } from "@/lib/plans";

interface Detail {
  user: {
    id: string;
    name: string;
    email: string;
    role: "user" | "admin";
    plan: "free" | "plus" | "pro" | "unlimited";
    status: "active" | "disabled";
    permissions: string[];
    effectivePermissions: string[];
    createdAt: string;
    lastLoginAt: string | null;
  };
  plan: { name: string; maxFinanceRecords: number | null; maxGoals: number | null; unlimited: boolean };
  usage: { incomes: number; expenses: number; debts: number; goals: number; financeRecords: number };
  activeSessions: number;
  totals: { income: number; expense: number; savings: number; debtRemaining: number; goalSaved: number; emiMonthly: number } | null;
  monthly: { label: string; income: number; expense: number }[];
  notifications: { id: string; type: string; title: string; message: string; read: boolean; createdAt: string }[];
  activity: { id: string; action: string; actorEmail: string; resource: string | null; metadata: Record<string, unknown>; createdAt: string }[];
}

type Tab = "overview" | "finance" | "notifications" | "activity";

function EditUser({ d, onSaved }: { d: Detail; onSaved: () => void }) {
  const { user: me, can } = useSession();
  const toast = useToast();
  const isSelf = me.id === d.user.id;
  const [form, setForm] = useState({ name: d.user.name, email: d.user.email, plan: d.user.plan, role: d.user.role, password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm({ name: d.user.name, email: d.user.email, plan: d.user.plan, role: d.user.role, password: "" }), [d.user.name, d.user.email, d.user.plan, d.user.role]);

  const save = async () => {
    const body: Record<string, unknown> = {};
    if (form.name !== d.user.name) body.name = form.name;
    if (form.email !== d.user.email) body.email = form.email;
    if (!isSelf && form.plan !== d.user.plan) body.plan = form.plan;
    if (!isSelf && form.role !== d.user.role) body.role = form.role;
    if (form.password) body.password = form.password;
    if (!Object.keys(body).length) return toast.info("No changes to save.");
    setSaving(true);
    setErrors({});
    try {
      const r = await api(`/api/admin/users/${d.user.id}`, { method: "PATCH", body });
      toast.success(r.message || "User updated successfully.");
      setForm((f) => ({ ...f, password: "" }));
      onSaved();
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      toast.error("Could not update user", err.message);
    } finally {
      setSaving(false);
    }
  };

  const disabled = !can("users.update");
  return (
    <Card>
      <CardHeader title="Profile, plan & role" subtitle={isSelf ? "You cannot change your own plan, role, status or permissions." : undefined} />
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving) void save();
        }}
      >
        <Field label="Name" error={errors.name}>
          <Input value={form.name} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input value={form.email} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </Field>
        <Field label="Plan">
          <Select value={form.role === "admin" ? "unlimited" : form.plan} disabled={disabled || isSelf || form.role === "admin"} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value as Detail["user"]["plan"] }))}>
            <option value="free">Free</option>
            <option value="plus">Plus</option>
            <option value="pro">Pro</option>
            <option value="unlimited">Unlimited</option>
          </Select>
        </Field>
        <Field label="Role">
          <Select value={form.role} disabled={disabled || isSelf} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Detail["user"]["role"] }))}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Field label="Reset password (optional)" error={errors.password} hint="Signs the user out of all devices." className="sm:col-span-2">
          <Input type="password" value={form.password} disabled={disabled} autoComplete="new-password" onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Leave empty to keep current password" />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={saving} disabled={disabled}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PermissionsEditor({ d, onSaved }: { d: Detail; onSaved: () => void }) {
  const { user: me, can } = useSession();
  const toast = useToast();
  const isSelf = me.id === d.user.id;
  const [selected, setSelected] = useState<Set<string>>(new Set(d.user.permissions));
  const [saving, setSaving] = useState(false);
  useEffect(() => setSelected(new Set(d.user.permissions)), [d.user.permissions]);
  const editable = can("users.update") && !isSelf;
  const dirty = selected.size !== d.user.permissions.length || d.user.permissions.some((p) => !selected.has(p));

  const toggle = (p: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const save = async () => {
    setSaving(true);
    try {
      const r = await api(`/api/admin/users/${d.user.id}`, { method: "PATCH", body: { permissions: [...selected] } });
      toast.success(r.message || "Permissions updated.");
      onSaved();
    } catch (e) {
      toast.error("Could not update permissions", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Permissions"
        subtitle={d.user.role === "admin" ? "Admin permissions apply because this user is an admin." : "Admin permissions only take effect for admin users."}
        action={
          editable ? (
            <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
              Save permissions
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {PERMISSION_GROUPS.map((g) => (
          <div key={g.label} className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-muted">{g.label}</p>
            <div className="space-y-1.5">
              {g.items.map((p: Permission) => {
                const adminOnly = isAdminPermission(p);
                const cannotGrant = adminOnly && !me.permissions.includes(p) && !selected.has(p);
                const inactive = adminOnly && d.user.role !== "admin";
                return (
                  <label key={p} className={cn("flex items-center gap-2 text-xs", (!editable || cannotGrant) && "opacity-60", inactive && "text-muted")}>
                    <input type="checkbox" className="h-3.5 w-3.5 accent-[rgb(var(--primary))]" checked={selected.has(p)} disabled={!editable || cannotGrant} onChange={() => toggle(p)} />
                    <span className="font-mono">{p}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SendNotification({ userId }: { userId: string }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const send = async () => {
    setBusy(true);
    setErrors({});
    try {
      const r = await api("/api/admin/notifications", { method: "POST", body: { userId, title, message, push: true } });
      toast.success(r.message || "Notification sent.");
      setTitle("");
      setMessage("");
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      toast.error("Could not send", err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Send a notification to this user" />
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void send();
        }}
      >
        <Field label="Title" error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
        </Field>
        <Field label="Message" error={errors.message}>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
        </Field>
        <Button type="submit" loading={busy} disabled={!title.trim() || !message.trim()}>
          <Send className="h-4 w-4" /> Send
        </Button>
      </form>
    </Card>
  );
}

function Inner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { can, user: me, money } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [res, setRes] = useState<ResourceKey>("income");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, error, isLoading, mutate } = useSWR<Detail>(`/api/admin/users/${id}`);

  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const u = data.user;
  const isSelf = me.id === u.id;

  const toggleStatus = async () => {
    setBusy(true);
    try {
      const r = await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { status: u.status === "active" ? "disabled" : "active" } });
      toast.success(r.message || "User updated.");
      void mutate();
    } catch (e) {
      toast.error("Could not update status", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    setBusy(true);
    try {
      const r = await api(`/api/admin/users/${u.id}`, { method: "DELETE" });
      toast.success(r.message || "User deleted successfully.");
      router.push("/admin/users");
    } catch (e) {
      toast.error("Could not delete user", (e as Error).message);
      setBusy(false);
    }
  };

  const canFinanceView = can("users.finance.view");
  const canFinanceManage = canFinanceView && can("users.finance.manage");
  const apiBase = `/api/admin/users/${u.id}/finance`;

  return (
    <>
      <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> All users
      </Link>
      <PageHeader
        title={u.name}
        subtitle={`${u.email} · joined ${timeAgo(u.createdAt)} · last sign-in ${u.lastLoginAt ? timeAgo(u.lastLoginAt) : "never"}`}
        actions={
          <>
            {can("users.update") && !isSelf && (
              <Button variant="secondary" onClick={toggleStatus} loading={busy}>
                {u.status === "active" ? (
                  <>
                    <Ban className="h-4 w-4" /> Disable
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Enable
                  </>
                )}
              </Button>
            )}
            {can("users.delete") && !isSelf && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Badge tone={u.plan === "free" ? "default" : u.plan === "unlimited" ? "success" : "primary"}>{u.plan.toUpperCase()}</Badge>
        <Badge tone={u.role === "admin" ? "warning" : "default"}>{u.role}</Badge>
        <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge>
        <Badge>{data.activeSessions} active session{data.activeSessions === 1 ? "" : "s"}</Badge>
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: "overview", label: "Overview" },
          ...(canFinanceView ? [{ value: "finance" as Tab, label: "Finance" }] : []),
          { value: "notifications", label: "Notifications" },
          ...(can("audit.view") ? [{ value: "activity" as Tab, label: "Activity" }] : []),
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Finance records" value={`${data.usage.financeRecords.toLocaleString("en-IN")} / ${limitLabel(data.plan.maxFinanceRecords)}`} hint={`${data.usage.incomes} inc · ${data.usage.expenses} exp · ${data.usage.debts} debt`} />
            <StatCard label="Goals" value={`${data.usage.goals} / ${limitLabel(data.plan.maxGoals)}`} />
            {data.totals && (
              <>
                <StatCard label="Total income" value={money(data.totals.income)} />
                <StatCard label="Total expenses" value={money(data.totals.expense)} />
                <StatCard label="Net savings" value={money(data.totals.savings)} tone={data.totals.savings < 0 ? "danger" : "success"} />
                <StatCard label="Debt remaining" value={money(data.totals.debtRemaining)} />
                <StatCard label="Monthly EMIs" value={money(data.totals.emiMonthly)} />
                <StatCard label="Goal savings" value={money(data.totals.goalSaved)} />
              </>
            )}
          </div>
          {canFinanceView && (
            <Card>
              <CardHeader title="Monthly income vs expenses" subtitle="Last 12 months" />
              <div className="px-3 pb-4 pt-4 sm:px-5">
                <IncomeExpenseBars data={data.monthly} height={260} />
              </div>
            </Card>
          )}
          <EditUser d={data} onSaved={() => mutate()} />
          <PermissionsEditor d={data} onSaved={() => mutate()} />
        </div>
      )}

      {tab === "finance" && canFinanceView && (
        <div className="space-y-4">
          <Tabs
            value={res}
            onChange={setRes}
            items={[
              { value: "income", label: "Income" },
              { value: "expense", label: "Expenses" },
              { value: "debt", label: "Debts" },
              { value: "goal", label: "Goals" },
            ]}
          />
          {!canFinanceManage && <p className="text-xs text-muted">Read-only: you need users.finance.manage to edit this user&apos;s records.</p>}
          <Suspense fallback={<Skeleton className="h-64" />}>
            <FinanceManager key={res} resource={res} apiBase={apiBase} mode="admin" canCreate={canFinanceManage} canUpdate={canFinanceManage} canDelete={canFinanceManage} ownerPlan={u.plan} />
          </Suspense>
        </div>
      )}

      {tab === "notifications" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Recent notifications" />
            {!data.notifications.length ? (
              <EmptyState title="No notifications" />
            ) : (
              <ul className="divide-y divide-border px-5 pb-2 pt-2">
                {data.notifications.map((n) => (
                  <li key={n.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", n.read ? "bg-border" : "bg-primary")} />
                      <p className="text-sm font-medium">{n.title}</p>
                      <span className="text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="pl-4 text-xs text-muted">{n.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {can("admin.notifications.send") && <SendNotification userId={u.id} />}
        </div>
      )}

      {tab === "activity" && (
        <Card>
          <CardHeader title="Audit & activity history" />
          {!data.activity.length ? (
            <EmptyState title="No activity recorded" />
          ) : (
            <ul className="divide-y divide-border px-5 pb-2 pt-2">
              {data.activity.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-xs">{a.action}</p>
                    <p className="truncate text-xs text-muted">
                      by {a.actorEmail}
                      {a.resource ? ` · ${a.resource}` : ""}
                      {typeof a.metadata?.label === "string" ? ` · “${a.metadata.label}”` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={del}
        loading={busy}
        title="Delete this user?"
        message={
          <>
            <span className="font-medium text-fg">{u.email}</span> and all their income, expenses, debts, goals, notifications and sessions will be permanently deleted.
          </>
        }
        typeToConfirm="DELETE"
        confirmLabel="Delete user"
      />
    </>
  );
}

export default function AdminUserDetailPage() {
  return (
    <RequirePerm admin perm="users.view">
      <Inner />
    </RequirePerm>
  );
}
