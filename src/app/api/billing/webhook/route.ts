import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Payment } from "@/lib/models";
import { activatePayment, refundPayment } from "@/lib/billing";
import { verifyWebhookSignature, type RzpPayment } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay → Budget Pro (server to server). Backup path that activates plans even if the buyer closed the
 * browser right after paying. Configure in Razorpay Dashboard → Webhooks:
 *   URL: https://<your-domain>/api/billing/webhook
 *   Events: payment.captured, payment.failed, order.paid, payment.refunded (refund.processed also works)
 *   Secret: same value as RAZORPAY_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ ok: false }, { status: 413 });
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ ok: false, message: "invalid signature" }, { status: 400 });
  }
  let evt: { event?: string; payload?: { payment?: { entity?: RzpPayment & { amount_refunded?: number } }; refund?: { entity?: { payment_id?: string; amount?: number } } } };
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const p = evt.payload?.payment?.entity;
  try {
    await connectDB();
    if (evt.event === "payment.refunded" || evt.event === "refund.processed") {
      const pid = p?.id ?? evt.payload?.refund?.entity?.payment_id;
      const refunded = p?.amount_refunded ?? evt.payload?.refund?.entity?.amount ?? 0;
      if (pid) await refundPayment(pid, refunded);
      return NextResponse.json({ ok: true });
    }
    if (!p?.id || !p.order_id) return NextResponse.json({ ok: true, ignored: true });
    if (evt.event === "payment.captured" || evt.event === "order.paid" || evt.event === "payment.authorized") {
      const r = await activatePayment(p.order_id, p.id, "webhook", p);
      // not finished yet (capture / account update failed) → 5xx so Razorpay retries later
      if (r.status === "pending") return NextResponse.json({ ok: false, status: r.status }, { status: 503 });
      return NextResponse.json({ ok: true, status: r.status });
    }
    if (evt.event === "payment.failed") {
      await Payment.updateOne({ orderId: p.order_id, status: "created" }, { $set: { status: "failed", paymentId: p.id, failureReason: String(p.error_description || "Payment failed").slice(0, 300) } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true, ignored: true });
  } catch (e) {
    console.error("[billing] webhook error:", (e as Error).message);
    // 5xx → Razorpay retries later
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
