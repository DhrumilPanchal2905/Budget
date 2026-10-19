"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { CalendarDays, CreditCard, IndianRupee, RefreshCw, Search, Users } from "lucide-react";
import { RequirePerm } from "@/components/guard";
import { StatCard } from "@/components/stat";
import { useSession } from "@/components/session";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Skeleton } from "@/components/ui";
import { api, timeAgo } from "@/lib/client";

interface Row {
  id: string;
  userId: string;
  name: string;
  email: string;
  plan: "plus" | "pro" | "unlimited";
  amount: number;
  status: "created" | "paid" | "failed" | "refunded";
  method: string | null;
  orderId: string;
  paymentId: string | null;
  invoiceNo: string | null;
  createdAt: string;
  paidAt: string | null;
  periodEnd: string | null;
  verifiedBy: string | null;
  applied: boolean;
  note: string | null;
}
interface Resp {
  mode: "live" | "test" | "off";
  summary: { revenue: number; payments: number; month: number; monthPayments: number; byPlan: { plus: number; pro: number; unlimited: number }; payers: number; pendingToday: number };
  items: Row[];
  page: number;
  pages: number;
  total: number;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const fmt = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const TONE: Record<Row["status"], "success" | "warning" | "danger" | "default"> = { paid: "success", created: "warning", failed: "danger", refunded: "default" };
const LABEL: Record<Row["status"], string> = { paid: "Paid", created: "Not completed", failed: "Failed", refunded: "Refunded" };

function Inner() {
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState<string | null>(null);
  const toast = useToast();
  const { can } = useSession();
  const qs = new URLSearchParams({ page: String(page), ...(status ? { status } : {}), ...(plan ? { plan } : {}), ...(query ? { q: query } : {}) });
  const { data, error, isLoading, mutate } = useSWR<Resp>(`/api/admin/payments?${qs}`, { refreshInterval: 30000 });

  const sync = async (id: string) => {
    setSyncing(id);
    try {
      const r = await api(`/api/admin/payments/${id}/sync`, { method: "POST" });
      toast.success("Checked with Razorpay", r.message);
      void mutate();
    } catch (e) {
      toast.error("Check failed", (e as Error).message);
    } finally {
      setSyncing(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Every plan purchase through Razorpay — refreshed every 30 seconds."
        actions={data ? <Badge tone={data.mode === "live" ? "success" : data.mode === "test" ? "warning" : "danger"}>{data.mode === "live" ? "Live mode" : data.mode === "test" ? "Test mode" : "Payments not set up"}</Badge> : null}
      />
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : !data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          {data.mode === "off" && (
            <Card className="mb-4 border-warning/40 bg-warning/10 p-4 text-sm">
              Razorpay keys are not set. Add <code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code> and <code>RAZORPAY_WEBHOOK_SECRET</code> in Vercel → Settings → Environment Variables, then redeploy.
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Revenue (all time)" value={inr(data.summary.revenue)} icon={<IndianRupee className="h-4 w-4" />} hint={`${data.summary.payments} payments`} tone="success" />
            <StatCard label="This month" value={inr(data.summary.month)} icon={<CalendarDays className="h-4 w-4" />} hint={`${data.summary.monthPayments} payments`} />
            <StatCard label="Paying customers" value={data.summary.payers.toLocaleString("en-IN")} icon={<Users className="h-4 w-4" />} />
            <StatCard label="By plan" value={inr(data.summary.byPlan.unlimited)} icon={<CreditCard className="h-4 w-4" />} hint={`Unlimited · Pro ${inr(data.summary.byPlan.pro)} · Plus ${inr(data.summary.byPlan.plus)}`} />
          </div>

          <Card className="mt-4">
            <CardHeader title="All payments" subtitle={`${data.total} records${data.summary.pendingToday ? ` · ${data.summary.pendingToday} checkout(s) not completed in the last 24 h` : ""}`} />
            <form
              className="flex flex-col gap-2 border-b border-border px-5 pb-4 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setQuery(q.trim());
              }}
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input className="pl-9" placeholder="Name, email, payment / order id, invoice no." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
                <option value="">All statuses</option>
                <option value="paid">Paid</option>
                <option value="created">Not completed</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </Select>
              <Select value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }} aria-label="Plan">
                <option value="">All plans</option>
                <option value="plus">Plus</option>
                <option value="pro">Pro</option>
                <option value="unlimited">Unlimited</option>
              </Select>
            </form>
            {isLoading ? (
              <Skeleton className="m-5 h-48" />
            ) : data.items.length === 0 ? (
              <EmptyState title="No payments yet" message="Purchases appear here the moment they happen." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="px-5 py-2 font-medium">Customer</th>
                      <th className="px-3 py-2 font-medium">Plan</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Method</th>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Invoice / IDs</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 align-top last:border-0">
                        <td className="px-5 py-2.5">
                          <Link href={`/admin/users/${r.userId}`} className="font-medium hover:underline">
                            {r.name}
                          </Link>
                          <span className="block text-xs text-muted">{r.email}</span>
                        </td>
                        <td className="px-3 py-2.5 capitalize">{r.plan}</td>
                        <td className="tabular px-3 py-2.5 text-right font-medium">{inr(r.amount)}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
                          {!r.applied && <Badge tone="danger" className="ml-1">Not applied</Badge>}
                          {r.note && <span className="mt-1 block max-w-[220px] text-[11px] text-muted">{r.note}</span>}
                        </td>
                        <td className="px-3 py-2.5 uppercase text-muted">{r.method ?? "—"}</td>
                        <td className="px-3 py-2.5 text-muted">
                          {fmt(r.paidAt ?? r.createdAt)}
                          <span className="block text-[11px]">{timeAgo(r.paidAt ?? r.createdAt)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {r.invoiceNo && r.status !== "created" ? (
                            <Link href={`/plan/invoice/${r.id}`} className="text-primary hover:underline">
                              {r.invoiceNo}
                            </Link>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                          <span className="block font-mono text-[11px] text-muted">{r.paymentId ?? r.orderId}</span>
                          {r.periodEnd && r.status === "paid" && <span className="block text-[11px] text-muted">until {new Date(r.periodEnd).toLocaleDateString("en-IN")}</span>}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          {(r.status === "created" || r.status === "failed" || !r.applied) && can("users.update") && (
                            <Button size="sm" variant="ghost" loading={syncing === r.id} onClick={() => void sync(r.id)} title="Ask Razorpay whether this order was paid">
                              <RefreshCw className="h-3.5 w-3.5" /> Check
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-5 py-3">
              <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
            </div>
          </Card>
        </>
      )}
    </>
  );
}

export default function AdminPaymentsPage() {
  return (
    <RequirePerm admin perm="users.view">
      <Inner />
    </RequirePerm>
  );
}
