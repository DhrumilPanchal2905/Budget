import { route, ok } from "@/lib/api";
import { Payment, isObjectId, oid } from "@/lib/models";
import { Errors, ApiError } from "@/lib/errors";
import { activatePayment } from "@/lib/billing";
import { RazorpayError, fetchOrderPayments } from "@/lib/razorpay";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** Re-checks an order with Razorpay (e.g. "I paid but my plan didn't change") and activates it if it was paid. */
export const POST = route({ admin: true, perms: ["users.update"] }, async ({ user, params, ip }) => {
  const id = String(params.id ?? "");
  if (!isObjectId(id)) throw Errors.notFound("Payment");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = await Payment.findById(oid(id)).lean();
  if (!p) throw Errors.notFound("Payment");
  if (p.status === "paid") {
    if (p.applyState === "applied") return ok({ status: "paid" }, "Already paid and active.");
    const r = await activatePayment(p.orderId, p.paymentId, "sync"); // finishes a paid-but-not-applied payment
    return ok(r, r.message);
  }
  try {
    const list = await fetchOrderPayments(p.orderId);
    const good = list.items.find((x) => x.status === "captured" || x.status === "authorized");
    await audit({ actor: user, action: "admin.billing.sync", resource: "payment", resourceId: p.orderId, metadata: { found: good?.status ?? "none" }, ip });
    if (!good) return ok({ status: p.status }, "Razorpay has no successful payment for this order.");
    const r = await activatePayment(p.orderId, good.id, "sync", good);
    return ok(r, r.message);
  } catch (e) {
    if (e instanceof RazorpayError) throw new ApiError(502, `Razorpay: ${e.message}`);
    throw e;
  }
});
