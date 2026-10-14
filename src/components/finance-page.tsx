"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { Download, HandCoins, Pencil, PiggyBank, Plus, Search, Trash2, Repeat } from "lucide-react";
import { api, ApiClientError, fmtDate, monthStr, qs, todayStr } from "@/lib/client";
import { RESOURCES, type FieldDef, type ResourceKey } from "@/lib/finance-config";
import { getPlan } from "@/lib/plans";
import { useSession } from "./session";
import { useToast } from "./toast";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Progress,
  Select,
  Skeleton,
  Textarea,
  cn,
} from "./ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any> & { id: string };
interface ListResponse {
  items: Row[];
  total: number;
  page: number;
  pages: number;
  sum: number;
}

const STATUS_TONE: Record<string, "success" | "warning" | "default" | "primary" | "danger"> = {
  active: "primary",
  paused: "warning",
  closed: "success",
  achieved: "success",
  cancelled: "default",
};

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function defaultsFor(resource: ResourceKey): Record<string, string> {
  switch (resource) {
    case "income":
      return { title: "", type: "salary", category: "Salary", amount: "", date: todayStr(), recurring: "monthly", notes: "" };
    case "expense":
      return { title: "", category: "Food & Dining", amount: "", date: todayStr(), recurring: "none", notes: "" };
    case "debt":
      return { title: "", totalAmount: "", remainingAmount: "", emiAmount: "", interestRate: "", dueDate: todayStr(), status: "active", notes: "" };
    case "goal":
      return { name: "", targetAmount: "", currentAmount: "0", targetDate: "", status: "active", notes: "" };
  }
}

function toForm(resource: ResourceKey, row: Row): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of RESOURCES[resource].fields) out[f.name] = row[f.name] === null || row[f.name] === undefined ? "" : String(row[f.name]);
  return out;
}

export function FinanceManager({
  resource,
  apiBase = "/api/finance",
  mode = "self",
  canCreate,
  canUpdate,
  canDelete,
  ownerPlan,
}: {
  resource: ResourceKey;
  apiBase?: string;
  mode?: "self" | "admin";
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  ownerPlan?: string;
}) {
  const def = RESOURCES[resource];
  const { money, can, user } = useSession();
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const searchParams = useSearchParams();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState("");
  const [sort, setSort] = useState(def.dateField);
  const [order, setOrder] = useState<"desc" | "asc">(resource === "debt" || resource === "goal" ? "asc" : "desc");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  useEffect(() => setPage(1), [dq, category, status, month, sort, order]);

  const key = `${apiBase}/${resource}${qs({ q: dq, category, status, month, sort, order, page, limit: 15 })}`;
  const { data, error, isLoading, mutate } = useSWR<ListResponse>(key);
  const planKey = mode === "self" ? "/api/plan" : null;
  const { data: planData } = useSWR<{ current: { maxFinanceRecords: number; maxGoals: number; name: string }; usage: { financeRecords: number; goals: number } }>(planKey);

  // ---- form state ----
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>(defaultsFor(resource));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // ---- delete / actions ----
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionRow, setActionRow] = useState<Row | null>(null);
  const [actionAmount, setActionAmount] = useState("");
  const [actionDate, setActionDate] = useState(todayStr());
  const [actionErr, setActionErr] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultsFor(resource));
    setErrors({});
    setFormOpen(true);
  };

  useEffect(() => {
    if (mode === "self" && searchParams.get("new") === "1" && canCreate) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEdit = (row: Row) => {
    setEditing(row);
    setForm(toForm(resource, row));
    setErrors({});
    setFormOpen(true);
  };

  const refreshAll = () => {
    void mutate();
    void globalMutate((k) => typeof k === "string" && (k.startsWith("/api/dashboard") || k.startsWith("/api/analytics") || k.startsWith("/api/plan") || k.startsWith("/api/insights") || k.startsWith(`${apiBase}/`) || k.startsWith("/api/admin/users")));
  };

  const submit = async () => {
    if (saving) return;
    // Client-side required checks (server validates again).
    const errs: Record<string, string> = {};
    for (const f of def.fields) if (f.required && !String(form[f.name] ?? "").trim()) errs[f.name] = `${f.label} is required.`;
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    setErrors({});
    const body: Record<string, string> = {};
    for (const f of def.fields) {
      const v = form[f.name] ?? "";
      if (f.type === "percent" && v === "") continue;
      body[f.name] = v;
    }
    try {
      const res = editing
        ? await api(`${apiBase}/${resource}/${editing.id}`, { method: "PATCH", body })
        : await api(`${apiBase}/${resource}`, { method: "POST", body });
      toast.success(res.message || "Saved successfully.");
      setFormOpen(false);
      refreshAll();
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      toast.error(err.status === 402 ? "Plan limit reached" : "Could not save", err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await api(`${apiBase}/${resource}/${toDelete.id}`, { method: "DELETE" });
      toast.success(res.message || "Deleted.");
      setToDelete(null);
      refreshAll();
    } catch (e) {
      toast.error("Could not delete", (e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const openAction = (row: Row) => {
    setActionRow(row);
    setActionAmount(resource === "debt" ? String(Math.min(row.emiAmount || 0, row.remainingAmount || 0) || "") : "");
    setActionDate(todayStr());
    setActionErr({});
  };

  const submitAction = async () => {
    if (!actionRow || actionBusy) return;
    setActionBusy(true);
    setActionErr({});
    try {
      const path = resource === "debt" ? "pay" : "contribute";
      const body = resource === "debt" ? { amount: actionAmount, date: actionDate } : { amount: actionAmount };
      const res = await api(`${apiBase}/${resource}/${actionRow.id}/${path}`, { method: "POST", body });
      toast.success(res.message || "Done.");
      setActionRow(null);
      refreshAll();
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setActionErr(err.errors);
      toast.error("Could not complete", err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const plan = getPlan(ownerPlan ?? user.plan);
  const usage = planData?.usage;
  const limitReached = usage ? (resource === "goal" ? usage.goals >= plan.maxGoals : usage.financeRecords >= plan.maxFinanceRecords) : false;

  const sortOptions = useMemo(() => {
    const map: Record<ResourceKey, [string, string][]> = {
      income: [["date", "Date"], ["amount", "Amount"], ["title", "Title"]],
      expense: [["date", "Date"], ["amount", "Amount"], ["title", "Title"]],
      debt: [["dueDate", "Due date"], ["remainingAmount", "Remaining"], ["emiAmount", "EMI"], ["title", "Title"]],
      goal: [["targetDate", "Target date"], ["targetAmount", "Target"], ["currentAmount", "Saved"], ["name", "Name"]],
    };
    return map[resource];
  }, [resource]);

  const categoryField = def.fields.find((f) => f.name === "category");
  const statusField = def.fields.find((f) => f.name === "status");
  const title = (row: Row) => row[def.titleField];

  const exportHref = `/api/reports/export${qs({ resource, month })}`;

  // ---------- render helpers ----------
  const amountCell = (row: Row) => {
    if (resource === "income") return <span className="tabular font-semibold text-success">+{money(row.amount)}</span>;
    if (resource === "expense") return <span className="tabular font-semibold">−{money(row.amount)}</span>;
    if (resource === "debt") return <span className="tabular font-semibold">{money(row.remainingAmount)}</span>;
    return <span className="tabular font-semibold">{money(row.currentAmount)}</span>;
  };

  const metaLine = (row: Row) => {
    if (resource === "income" || resource === "expense") {
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge>{row.category}</Badge>
          {resource === "income" && <Badge tone={row.type === "salary" ? "primary" : "info"}>{row.type === "salary" ? "Salary" : "Extra"}</Badge>}
          {row.recurring && row.recurring !== "none" && (
            <Badge tone="info">
              <Repeat className="h-3 w-3" /> {row.recurring}
            </Badge>
          )}
          <span className="text-xs text-muted">{fmtDate(row.date)}</span>
        </span>
      );
    }
    if (resource === "debt") {
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
          <span className="text-xs text-muted">
            EMI {money(row.emiAmount)} · due {fmtDate(row.dueDate)}
            {row.interestRate ? ` · ${row.interestRate}% p.a.` : ""}
          </span>
        </span>
      );
    }
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
        <span className="text-xs text-muted">
          Target {money(row.targetAmount)} by {fmtDate(row.targetDate)}
        </span>
      </span>
    );
  };

  const progressBar = (row: Row) =>
    resource === "debt" || resource === "goal" ? (
      <div className="mt-2 max-w-xs">
        <Progress value={row.progress} tone={row.status === "achieved" || row.status === "closed" ? "success" : "primary"} />
        <p className="tabular mt-1 text-[11px] text-muted">
          {resource === "debt" ? `${money(row.paidAmount, true)} paid of ${money(row.totalAmount, true)}` : `${row.progress}% of ${money(row.targetAmount, true)}`}
        </p>
      </div>
    ) : null;

  const actions = (row: Row) => (
    <div className="flex items-center justify-end gap-1">
      {canUpdate && resource === "debt" && row.status !== "closed" && (can("expense.create") || mode === "admin") && (
        <Button size="sm" variant="secondary" onClick={() => openAction(row)} title="Record EMI payment">
          <HandCoins className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Pay</span>
        </Button>
      )}
      {canUpdate && resource === "goal" && row.status !== "cancelled" && (
        <Button size="sm" variant="secondary" onClick={() => openAction(row)} title="Add contribution">
          <PiggyBank className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Add</span>
        </Button>
      )}
      {canUpdate && (
        <Button size="icon" variant="ghost" onClick={() => openEdit(row)} aria-label={`Edit ${title(row)}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {canDelete && (
        <Button size="icon" variant="ghost" className="hover:text-danger" onClick={() => setToDelete(row)} aria-label={`Delete ${title(row)}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  const renderField = (f: FieldDef) => {
    const id = `f-${resource}-${f.name}`;
    const common = {
      id,
      value: form[f.name] ?? "",
      invalid: Boolean(errors[f.name]),
    };
    let control;
    if (f.type === "select") {
      control = (
        <Select
          {...common}
          onChange={(e) => {
            const v = e.target.value;
            setForm((s) => {
              const next = { ...s, [f.name]: v };
              if (resource === "income" && f.name === "category") next.type = v === "Salary" ? "salary" : s.type === "salary" ? "extra" : s.type;
              return next;
            });
          }}
        >
          {f.options!.map((o) => (
            <option key={o} value={o}>
              {f.optionLabels?.[o] ?? o}
            </option>
          ))}
        </Select>
      );
    } else if (f.type === "textarea") {
      control = <Textarea {...common} maxLength={1000} onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))} placeholder="Optional" />;
    } else {
      control = (
        <Input
          {...common}
          type={f.type === "date" ? "date" : "text"}
          inputMode={f.type === "money" || f.type === "percent" ? "decimal" : undefined}
          placeholder={f.placeholder ?? (f.type === "money" ? "0.00" : f.type === "percent" ? "e.g. 8.5" : undefined)}
          maxLength={f.type === "text" ? 120 : undefined}
          onChange={(e) => {
            let v = e.target.value;
            if (f.type === "money" || f.type === "percent") v = v.replace(/[^\d.]/g, "");
            setForm((s) => {
              const next = { ...s, [f.name]: v };
              // convenience: new debt → remaining defaults to total
              if (resource === "debt" && !editing && f.name === "totalAmount" && (s.remainingAmount === "" || s.remainingAmount === s.totalAmount)) next.remainingAmount = v;
              return next;
            });
          }}
        />
      );
    }
    return (
      <Field key={f.name} label={`${f.label}${f.required ? "" : " (optional)"}`} htmlFor={id} error={errors[f.name]} className={f.half ? "" : "sm:col-span-2"}>
        {control}
      </Field>
    );
  };

  return (
    <div className="space-y-4">
      {mode === "self" && (
        <PageHeader
          title={def.plural}
          subtitle={
            resource === "income"
              ? "Salary and every extra rupee you earn."
              : resource === "expense"
                ? "Track where your money goes."
                : resource === "debt"
                  ? "Loans, EMIs and repayment progress."
                  : "Save towards what matters."
          }
          actions={
            <>
              {can("reports.export") && (resource === "income" || resource === "expense" || resource === "debt" || resource === "goal") && (
                <a href={exportHref}>
                  <Button variant="secondary">
                    <Download className="h-4 w-4" /> Export CSV
                  </Button>
                </a>
              )}
              {canCreate && (
                <Button onClick={openCreate} disabled={limitReached} title={limitReached ? "Plan limit reached" : undefined}>
                  <Plus className="h-4 w-4" /> Add {def.label.toLowerCase()}
                </Button>
              )}
            </>
          }
        />
      )}

      {mode === "admin" && canCreate && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add {def.label.toLowerCase()}
          </Button>
        </div>
      )}

      {mode === "self" && usage && (
        <div className={cn("flex flex-col gap-2 rounded-xl border px-4 py-3 text-xs sm:flex-row sm:items-center sm:gap-4", limitReached ? "border-warning/40 bg-warning/5" : "border-border bg-surface")}>
          <span className="text-muted">
            {plan.name} plan · {resource === "goal" ? `${usage.goals} / ${plan.maxGoals} goals` : `${usage.financeRecords.toLocaleString("en-IN")} / ${plan.maxFinanceRecords.toLocaleString("en-IN")} finance records`}
          </span>
          <Progress className="sm:max-w-xs" value={resource === "goal" ? (usage.goals / plan.maxGoals) * 100 : (usage.financeRecords / plan.maxFinanceRecords) * 100} tone={limitReached ? "warning" : "primary"} />
          {limitReached && <span className="font-medium text-warning">Limit reached — upgrade your plan to add more.</span>}
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 sm:min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${def.plural.toLowerCase()}…`} className="pl-9" aria-label="Search" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {categoryField && (
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-44" aria-label="Category">
                <option value="">All categories</option>
                {categoryField.options!.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            )}
            {statusField && (
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-36" aria-label="Status">
                <option value="">All statuses</option>
                {statusField.options!.map((o) => (
                  <option key={o} value={o}>
                    {statusField.optionLabels?.[o] ?? o}
                  </option>
                ))}
              </Select>
            )}
            {(resource === "income" || resource === "expense") && (
              <Input type="month" value={month} max={monthStr(new Date(new Date().getFullYear() + 5, 0, 1))} onChange={(e) => setMonth(e.target.value)} className="sm:w-40" aria-label="Month" />
            )}
            <Select
              value={`${sort}:${order}`}
              onChange={(e) => {
                const [s, o] = e.target.value.split(":");
                setSort(s);
                setOrder(o as "asc" | "desc");
              }}
              className="sm:w-44"
              aria-label="Sort"
            >
              {sortOptions.flatMap(([v, l]) => [
                <option key={`${v}:desc`} value={`${v}:desc`}>
                  {l} ↓
                </option>,
                <option key={`${v}:asc`} value={`${v}:asc`}>
                  {l} ↑
                </option>,
              ])}
            </Select>
          </div>
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-b border-border px-5 py-2.5 text-xs text-muted">
            <span>
              {data.total} record{data.total === 1 ? "" : "s"}
            </span>
            <span>
              {resource === "debt" ? "Remaining" : resource === "goal" ? "Saved" : "Total"}: <span className="tabular font-semibold text-fg">{money(data.sum)}</span>
            </span>
          </div>
        )}

        {error ? (
          <ErrorState message={error.message} onRetry={() => mutate()} />
        ) : isLoading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            title={dq || category || status || month ? "No matching records" : `No ${def.plural.toLowerCase()} yet`}
            message={dq || category || status || month ? "Try adjusting your filters." : "Add your first record to get started."}
            action={
              canCreate && !(dq || category || status || month) ? (
                <Button size="sm" onClick={openCreate} disabled={limitReached}>
                  <Plus className="h-4 w-4" /> Add {def.label.toLowerCase()}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-5 py-2.5 font-medium">{resource === "goal" ? "Goal" : "Title"}</th>
                    <th className="px-3 py-2.5 font-medium">Details</th>
                    <th className="px-3 py-2.5 text-right font-medium">{resource === "debt" ? "Remaining" : resource === "goal" ? "Saved" : "Amount"}</th>
                    {(canUpdate || canDelete) && <th className="w-40 px-5 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-2/40">
                      <td className="max-w-[260px] px-5 py-3 align-top">
                        <p className="truncate font-medium">{title(row)}</p>
                        {row.notes && <p className="truncate text-xs text-muted">{row.notes}</p>}
                        {progressBar(row)}
                      </td>
                      <td className="px-3 py-3 align-top">{metaLine(row)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right align-top">{amountCell(row)}</td>
                      {(canUpdate || canDelete) && <td className="px-5 py-2.5 align-top">{actions(row)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="divide-y divide-border md:hidden">
              {data.items.map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{title(row)}</p>
                      <div className="mt-1">{metaLine(row)}</div>
                    </div>
                    <div className="shrink-0 text-right text-sm">{amountCell(row)}</div>
                  </div>
                  {progressBar(row)}
                  {(canUpdate || canDelete) && <div className="mt-2">{actions(row)}</div>}
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} onChange={setPage} total={data.total} />
          </>
        )}
      </Card>

      {/* Create / edit modal */}
      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={editing ? `Edit ${def.label.toLowerCase()}` : `Add ${def.label.toLowerCase()}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {editing ? "Save changes" : `Add ${def.label.toLowerCase()}`}
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
          noValidate
        >
          {def.fields.map(renderField)}
          {errors.form && <p className="text-sm text-danger sm:col-span-2">{errors.form}</p>}
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      {/* Pay EMI / contribute modal */}
      <Modal
        open={Boolean(actionRow)}
        onClose={() => !actionBusy && setActionRow(null)}
        title={resource === "debt" ? "Record EMI payment" : "Add contribution"}
        description={
          actionRow
            ? resource === "debt"
              ? `“${actionRow.title}” · ${money(actionRow.remainingAmount)} remaining. An “EMI / Debt” expense will be created.`
              : `“${actionRow.name}” · ${money(actionRow.currentAmount)} of ${money(actionRow.targetAmount)} saved.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setActionRow(null)} disabled={actionBusy}>
              Cancel
            </Button>
            <Button onClick={submitAction} loading={actionBusy}>
              {resource === "debt" ? "Record payment" : "Add contribution"}
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitAction();
          }}
        >
          <Field label="Amount" error={actionErr.amount}>
            <Input inputMode="decimal" value={actionAmount} onChange={(e) => setActionAmount(e.target.value.replace(/[^\d.]/g, ""))} invalid={Boolean(actionErr.amount)} placeholder="0.00" />
          </Field>
          {resource === "debt" && (
            <Field label="Payment date" error={actionErr.date}>
              <Input type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} />
            </Field>
          )}
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={`Delete ${def.label.toLowerCase()}?`}
        message={
          <>
            “<span className="font-medium text-fg">{toDelete ? title(toDelete) : ""}</span>” will be permanently deleted. This cannot be undone.
          </>
        }
      />
    </div>
  );
}

/** Page wrapper for the signed-in user's own records. */
export function FinancePage({ resource }: { resource: ResourceKey }) {
  const { can } = useSession();
  return (
    <FinanceManager
      resource={resource}
      canCreate={can("finance.write") && can(`${resource}.create` as never)}
      canUpdate={can("finance.write") && can(`${resource}.update` as never)}
      canDelete={can("finance.write") && can(`${resource}.delete` as never)}
    />
  );
}
