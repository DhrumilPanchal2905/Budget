"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, ErrorState, Skeleton } from "@/components/ui";

interface Invoice {
  invoiceNo: string;
  date: string;
  status: string;
  customer: { name: string; email: string };
  seller: { name: string; owner: string; email: string; phone: string; address: string; gstin: string | null };
  item: { description: string; periodStart: string; periodEnd: string; creditDays: number };
  amount: number;
  currency: string;
  paymentId: string;
  orderId: string;
  method: string | null;
}

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: inv, error, isLoading, mutate } = useSWR<Invoice>(`/api/billing/invoice/${id}`);
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !inv) return <Skeleton className="h-[520px]" />;
  return (
    <>
      <style>{`@media print { body * { visibility: hidden !important; } .bp-invoice, .bp-invoice * { visibility: visible !important; } .bp-invoice { position: absolute; inset: 0 auto auto 0; width: 100%; color: #000 !important; background: #fff !important; border: 0 !important; } .bp-invoice .muted { color: #555 !important; } }`}</style>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href="/plan" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Plan & billing
        </Link>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>
      <div className="bp-invoice mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-6 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xl font-bold">{inv.seller.name}</p>
            <p className="muted mt-1 whitespace-pre-line text-sm text-muted">
              {inv.seller.owner}
              {"\n"}
              {inv.seller.address}
              {"\n"}
              {inv.seller.email}
              {inv.seller.phone ? ` · ${inv.seller.phone}` : ""}
            </p>
            <p className="muted mt-1 text-xs text-muted">{inv.seller.gstin ? `GSTIN: ${inv.seller.gstin}` : "Not registered under GST — no GST charged."}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight">{inv.status === "refunded" ? "Invoice (refunded)" : "Invoice"}</p>
            <p className="mt-1 text-sm">
              <span className="muted text-muted">No. </span>
              {inv.invoiceNo}
            </p>
            <p className="text-sm">
              <span className="muted text-muted">Date </span>
              {fmt(inv.date)}
            </p>
          </div>
        </div>
        <div className="mt-8">
          <p className="muted text-xs uppercase tracking-wider text-muted">Billed to</p>
          <p className="mt-1 font-medium">{inv.customer.name}</p>
          <p className="muted text-sm text-muted">{inv.customer.email}</p>
        </div>
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/60">
              <td className="py-3">
                {inv.item.description}
                {inv.item.periodStart && (
                  <span className="muted block text-xs text-muted">
                    Service period {fmt(inv.item.periodStart)} – {fmt(inv.item.periodEnd)}
                    {inv.item.creditDays ? ` (includes ${inv.item.creditDays} days carried over)` : ""}
                  </span>
                )}
              </td>
              <td className="tabular py-3 text-right">{inr(inv.amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="py-3 text-right font-semibold">Total paid</td>
              <td className="tabular py-3 text-right text-lg font-semibold">{inr(inv.amount)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="muted mt-6 grid gap-1 text-xs text-muted sm:grid-cols-2">
          <p>Payment ID: {inv.paymentId}</p>
          <p>Order ID: {inv.orderId}</p>
          <p>Method: {inv.method ? inv.method.toUpperCase() : "—"} (via Razorpay)</p>
          <p>Status: {inv.status === "paid" ? "Paid" : inv.status}</p>
        </div>
        <p className="muted mt-8 border-t border-border pt-4 text-xs text-muted">This is a computer-generated invoice and needs no signature. Digital subscription — nothing is shipped. See the refund & cancellation policy on our website.</p>
      </div>
    </>
  );
}
