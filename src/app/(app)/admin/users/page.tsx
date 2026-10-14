"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ChevronRight, Plus, Search, UserPlus } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, Select, Skeleton } from "@/components/ui";
import { api, ApiClientError, qs, timeAgo } from "@/lib/client";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  plan: "free" | "plus" | "pro" | "unlimited";
  status: "active" | "disabled";
  currency: string;
  permissions: string[];
  effectivePermissions: string[];
  createdAt: string;
  lastLoginAt: string | null;
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user", plan: "free" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ name: "", email: "", password: "", role: "user", plan: "free" });
      setErrors({});
    }
  }, [open]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setErrors({});
    try {
      const r = await api("/api/admin/users", { method: "POST", body: form });
      toast.success(r.message || "User created successfully.");
      onCreated();
      onClose();
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      toast.error("Could not create user", err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Create user"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            <UserPlus className="h-4 w-4" /> Create user
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Full name" error={errors.name} className="sm:col-span-2">
          <Input value={form.name} onChange={set("name")} invalid={Boolean(errors.name)} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={set("email")} invalid={Boolean(errors.email)} autoComplete="off" />
        </Field>
        <Field label="Temporary password" error={errors.password} hint="8+ chars with a letter and a number">
          <Input type="password" value={form.password} onChange={set("password")} invalid={Boolean(errors.password)} autoComplete="new-password" />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={set("role")}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Field label="Plan">
          <Select value={form.plan} onChange={set("plan")}>
            <option value="free">Free</option>
            <option value="plus">Plus</option>
            <option value="pro">Pro</option>
            <option value="unlimited">Unlimited</option>
          </Select>
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function Inner() {
  const { can } = useSession();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [dq, plan, status, role]);

  const key = `/api/admin/users${qs({ q: dq, plan, status, role, page, limit: 20 })}`;
  const { data, error, isLoading, mutate } = useSWR<{ items: AdminUser[]; total: number; page: number; pages: number }>(key);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={data ? `${data.total} user${data.total === 1 ? "" : "s"}` : undefined}
        actions={
          can("users.create") ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create user
            </Button>
          ) : undefined
        }
      />
      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Select value={plan} onChange={(e) => setPlan(e.target.value)} className="sm:w-32" aria-label="Plan">
              <option value="">All plans</option>
              <option value="free">Free</option>
              <option value="plus">Plus</option>
              <option value="pro">Pro</option>
              <option value="unlimited">Unlimited</option>
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-32" aria-label="Status">
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
            <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-32" aria-label="Role">
              <option value="">All roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
        </div>
        {error ? (
          <ErrorState message={error.message} onRetry={() => mutate()} />
        ) : isLoading || !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !data.items.length ? (
          <EmptyState title="No users found" message="Try a different search or filter." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-5 py-2.5 font-medium">User</th>
                    <th className="px-3 py-2.5 font-medium">Plan</th>
                    <th className="px-3 py-2.5 font-medium">Role</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-2/40">
                      <td className="px-5 py-3">
                        <Link href={`/admin/users/${u.id}`} className="block">
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-muted">{u.email}</p>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={u.plan === "free" ? "default" : u.plan === "unlimited" ? "success" : "primary"}>{u.plan.toUpperCase()}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={u.role === "admin" ? "warning" : "default"}>{u.role}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/admin/users/${u.id}`}>
                          <Button size="sm" variant="secondary">
                            Manage <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {data.items.map((u) => (
                <li key={u.id}>
                  <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.name}</p>
                      <p className="truncate text-xs text-muted">{u.email}</p>
                      <div className="mt-1.5 flex gap-1.5">
                        <Badge tone={u.plan === "free" ? "default" : u.plan === "unlimited" ? "success" : "primary"}>{u.plan.toUpperCase()}</Badge>
                        <Badge tone={u.role === "admin" ? "warning" : "default"}>{u.role}</Badge>
                        <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} onChange={setPage} total={data.total} />
          </>
        )}
      </Card>
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => mutate()} />
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <RequirePerm admin perm="users.view">
      <Inner />
    </RequirePerm>
  );
}
