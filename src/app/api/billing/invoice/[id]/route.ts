import { route, ok } from "@/lib/api";
import { Payment, isObjectId, oid } from "@/lib/models";
import { Errors } from "@/lib/errors";
import { PLANS, type PlanId } from "@/lib/plans";
import { businessInfo } from "@/lib/business";

export const runtime = "nodejs";

/** Invoice data for one paid payment — the buyer's own, or any for an admin with payments access. */
export const GET = route({}, async ({ user, perms, params }) => {
  const id = String(params.id ?? "");
  if (!isObjectId(id)) throw Errors.notFound("Invoice");
  const canAll = user.role === "admin" && perms.includes("users.view");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = await Payment.findOne({ _id: oid(id), ...(canAll ? {} : { userId: user._id }), status: { $in: ["paid", "refunded"] } }).lean();
  if (!p) throw Errors.notFound("Invoice");
  const plan = PLANS[p.plan as PlanId];
  return ok({
    invoiceNo: p.invoiceNo ?? p.receipt,
    date: p.paidAt ?? p.createdAt,
    status: p.status,
    customer: { name: p.name, email: p.email },
    seller: businessInfo(),
    item: { description: `Budget Pro ${plan.name} plan — 1 month`, periodStart: p.periodStart, periodEnd: p.periodEnd, creditDays: p.creditDays ?? 0 },
    amount: p.amount / 100,
    currency: p.currency || "INR",
    paymentId: p.paymentId,
    orderId: p.orderId,
    method: p.method ?? null,
  });
});
