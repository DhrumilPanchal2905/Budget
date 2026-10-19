import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { Payment } from "@/lib/models";
import { activatePayment } from "@/lib/billing";
import { RazorpayError, verifyCheckoutSignature } from "@/lib/razorpay";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const schema = z.object({
  orderId: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Called by the browser right after Razorpay Checkout succeeds. */
export const POST = route({}, async ({ req, user, ip }) => {
  await rateLimit(`billing-verify:${String(user._id)}`, 20, 10 * 60);
  const b = await parseBody(req, schema);
  const pay = await Payment.findOne({ orderId: b.orderId, userId: user._id }).select("_id").lean();
  if (!pay) throw new ApiError(404, "Order not found.");
  if (!verifyCheckoutSignature(b.orderId, b.paymentId, b.signature)) {
    await audit({ actor: user, action: "billing.signature_invalid", resource: "payment", resourceId: b.orderId, metadata: { paymentId: b.paymentId }, ip });
    throw new ApiError(400, "Payment could not be verified. If money was deducted, it will be confirmed automatically or refunded.");
  }
  try {
    const r = await activatePayment(b.orderId, b.paymentId, "checkout");
    if (!r.ok && r.status === "failed") throw new ApiError(400, r.message);
    return ok(r, r.message);
  } catch (e) {
    if (e instanceof RazorpayError) throw new ApiError(502, "Payment received — confirming with the bank. Your plan will activate automatically within a few minutes.");
    throw e;
  }
});
