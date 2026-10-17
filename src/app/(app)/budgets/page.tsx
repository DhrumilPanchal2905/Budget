"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AlertTriangle, CheckCircle2, Pencil, PiggyBank, Plus, Sparkles, Trash2, Wallet } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Progress, Select, Skeleton, cn } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { EXPENSE_CATEGORIES } from "@/lib/finance-config";

interface Row {
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  pct: number;
  status: "ok" | "warn" | "over";
  alertPct: number;
  perDay: number;
  projected: number;
  projectedOver: boolean;
}
interface Report {
  month: string;
  daysLeft: number;
  items: Row[];
  total: Row | null;
  suggestions: { category: string; avg: number; suggested: number }[];
}

const TOTAL = "__total__";
const label = (c: string) => (c === TOTAL ? "Whole month (all spending)" : c);

function Editor({ open, onClose, initial, existing }: { open: boolean; onClose: () => void; initial: { category: string; amount: string; alertPct: number } | null; existing: string[] }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [form, setForm] = useState(initial ?? { category: "", amount: "", alertPct: 80 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial?.category && existing.includes(initial.category));
  const options = [TOTAL, ...EXPENSE_CATEGORIES.filter((c) => c !== "EMI / Debt")].filter((c) => c === form.category || !existing.includes(c));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const r = await api<Report>("/api/budgets", { method: "PUT", body: { category: form.category, amount: form.amount, alertPct: Number(form.alertPct) } });
      await mutate("/api/budgets", r.data, { revalidate: false });
      toast.success(r.message || "Budget saved.");
      onClose();
    } catch (e) {
      const err = e as ApiClientError;
      setErrors(err.errors ?? { form: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${label(form.category)} budget` : "New budget"}
      description="A monthly spending limit. You'll get a notification at the alert level and when it's crossed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!form.category || !form.amount}>
            Save budget
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Category" error={errors.category} htmlFor="b-cat">
          <Select id="b-cat" value={form.category} disabled={editing} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">Choose…</option>
            {options.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Monthly limit" error={errors.amount} htmlFor="b-amt">
          <Input id="b-amt" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="5000" />
        </Field>
        <Field label={`Alert me at ${form.alertPct}% used`} htmlFor="b-alert">
          <input id="b-alert" type="range" min={50} max={100} step={5} value={form.alertPct} onChange={(e) => setForm({ ...form, alertPct: Number(e.target.value) })} className="w-full accent-[rgb(var(--primary))]" />
        </Field>
        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      </div>
    </Modal>
  );
}

function BudgetRow({ r, onEdit, onDelete }: { r: Row; onEdit: () => void; onDelete: () => void }) {
  const { money } = useSession();
  const tone = r.status === "over" ? "danger" : r.status === "warn" ? "warning" : "success";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{label(r.category)}</p>
          <p className="tabular mt-0.5 text-xs text-muted">
            {money(r.spent)} of {money(r.limit)} · {r.pct}%
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge tone={tone}>{r.status === "over" ? "Over" : r.status === "warn" ? "Close" : "On track"}</Badge>
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Edit budget">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete budget">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Progress value={Math.min(100, r.pct)} tone={tone} className="mt-3" />
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs">
        <span className={cn("tabular", r.remaining < 0 ? "text-danger" : "text-muted")}>{r.remaining < 0 ? `${money(-r.remaining)} over` : `${money(r.remaining)} left · ${money(r.perDay)}/day`}</span>
        {r.projectedOver && r.status !== "over" && (
          <span className="flex items-center gap-1 text-warning">
            <AlertTriangle className="h-3.5 w-3.5" /> Heading to {money(r.projected)}
          </span>
        )}
      </div>
    </div>
  );
}

function Inner() {
  const { money } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR<Report>("/api/budgets");
  const [editor, setEditor] = useState<{ category: string; amount: string; alertPct: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const edit = (r?: Row, preset?: { category: string; amount: number }) => {
    setEditor(r ? { category: r.category, amount: String(r.limit), alertPct: r.alertPct } : preset ? { category: preset.category, amount: String(preset.amount), alertPct: 80 } : null);
    setOpen(true);
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      const r = await api<Report>(`/api/budgets?category=${encodeURIComponent(del)}`, { method: "DELETE" });
      await mutate(r.data, { revalidate: false });
      toast.success("Budget removed.");
      setDel(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const all = data ? [...(data.total ? [data.total] : []), ...data.items] : [];
  const over = all.filter((r) => r.status === "over").length;
  return (
    <>
      <PageHeader
        title="Budgets"
        subtitle={data ? `${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} left this month · limits reset every month` : "Monthly spending limits per category."}
        actions={
          <Button onClick={() => edit()}>
            <Plus className="h-4 w-4" /> New budget
          </Button>
        }
      />
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {all.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card className="p-4">
                <p className="text-xs text-muted">Budgeted</p>
                <p className="tabular mt-1 text-xl font-semibold">{money((data.total ? data.total.limit : data.items.reduce((s, r) => s + r.limit, 0)), true)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted">Spent</p>
                <p className="tabular mt-1 text-xl font-semibold">{money((data.total ? data.total.spent : data.items.reduce((s, r) => s + r.spent, 0)), true)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted">Over limit</p>
                <p className={cn("tabular mt-1 text-xl font-semibold", over ? "text-danger" : "text-success")}>{over}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted">Status</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  {over ? <AlertTriangle className="h-4 w-4 text-danger" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                  {over ? "Needs attention" : "All good"}
                </p>
              </Card>
            </div>
          )}
          {all.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {all.map((r) => (
                <BudgetRow key={r.category} r={r} onEdit={() => edit(r)} onDelete={() => setDel(r.category)} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={<Wallet className="h-6 w-6" />}
                title="No budgets yet"
                message="Set a monthly limit for the categories you want to control. You can also just tell Angel: “food budget 5000”."
                action={<Button onClick={() => edit()}>Create your first budget</Button>}
              />
            </Card>
          )}
          {data.suggestions.length > 0 && (
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Angel AI suggests</span>} subtitle="Based on your last 3 months (10% below your average)" />
              <ul className="divide-y divide-border px-5 pb-3">
                {data.suggestions.map((s) => (
                  <li key={s.category} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{s.category}</p>
                      <p className="tabular text-xs text-muted">Average {money(s.avg)}/month</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => edit(undefined, { category: s.category, amount: s.suggested })}>
                      <PiggyBank className="h-4 w-4" /> Set {money(s.suggested)}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      {open && <Editor open={open} onClose={() => setOpen(false)} initial={editor} existing={all.map((r) => r.category)} />}
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} onConfirm={remove} loading={busy} title="Remove this budget?" message={del ? `The ${label(del)} limit will be removed. Your expenses are not affected.` : ""} confirmLabel="Remove" danger />
    </>
  );
}

export default function BudgetsPage() {
  return (
    <RequirePerm perm={["finance.read", "expense.view"]}>
      <Inner />
    </RequirePerm>
  );
}
