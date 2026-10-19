"use client";
// Razorpay Checkout in the browser. The order (and amount) is created on our server; after payment the server
// verifies the signature and asks Razorpay before the plan changes.
import { api } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */
let loading: Promise<boolean> | null = null;
function loadScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as any).Razorpay) return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      loading = null;
      resolve(false);
    };
    document.body.appendChild(s);
  });
  return loading;
}

export interface OrderResp {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  plan: string;
  planName: string;
  mode: "new" | "renew" | "upgrade";
  creditDays: number;
  periodEnd: string;
  prefill: { name: string; email: string };
}

export interface CheckoutResult {
  status: "paid" | "pending" | "cancelled" | "failed";
  message: string;
  periodEnd?: string;
}

export async function buyPlan(plan: "plus" | "pro" | "unlimited"): Promise<CheckoutResult> {
  const [ok, order] = await Promise.all([loadScript(), api<OrderResp>("/api/billing/order", { method: "POST", body: { plan } }).then((r) => r.data)]);
  if (!ok || !(window as any).Razorpay) return { status: "failed", message: "Couldn't load the payment window. Check your connection (or ad-blocker) and try again." };
  return new Promise<CheckoutResult>((resolve) => {
    let settled = false;
    const done = (r: CheckoutResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const rzp = new (window as any).Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "Budget Pro",
      description: `${order.planName} plan — 1 month`,
      image: `${window.location.origin}/icon-512`,
      prefill: { name: order.prefill.name, email: order.prefill.email },
      notes: { plan: order.plan },
      theme: { color: "#3b82f6" },
      retry: { enabled: true, max_count: 3 },
      modal: {
        confirm_close: true,
        ondismiss: () => done({ status: "cancelled", message: "Payment cancelled — no money was taken." }),
      },
      handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        try {
          const r = await api<{ ok: boolean; status: string; periodEnd?: string; message: string }>("/api/billing/verify", {
            method: "POST",
            body: { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature },
          });
          done({ status: r.data.status === "paid" ? "paid" : "pending", message: r.data.message, periodEnd: r.data.periodEnd });
        } catch (e) {
          const status = (e as { status?: number }).status;
          // 400 = the server checked with Razorpay and the payment is NOT valid; anything else = still confirming
          if (status === 400) done({ status: "failed", message: (e as Error).message });
          else done({ status: "pending", message: (e as Error).message || "Payment received — confirming. Your plan will activate in a few minutes." });
        }
      },
    });
    rzp.on("payment.failed", (resp: any) => {
      // Checkout lets the buyer retry; we only report the reason
      console.warn("[checkout] payment failed", resp?.error?.description);
    });
    rzp.open();
  });
}
