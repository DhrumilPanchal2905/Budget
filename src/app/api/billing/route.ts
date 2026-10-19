import { route, ok } from "@/lib/api";
import { Payment } from "@/lib/models";
import { PAID_PLAN_IDS, PLANS, planForUser } from "@/lib/plans";
import { paymentsEnabled, quote } from "@/lib/billing";
import { razorpayMode } from "@/lib/razorpay";

export const runtime = "nodejs";

/** Billing overview for the Plan page: current plan, what each paid plan would do now, payment history. */
export const GET = route({}, async ({ user }) => {
  const current = planForUser(user);
  const options = PAID_PLAN_IDS.map((id) => {
    try {
      const q = quote(user, id);
      return { plan: id, amount: q.amountPaise / 100, mode: q.mode, creditDays: q.creditDays, periodEnd: q.periodEnd.toISOString(), available: true as const };
    } catch (e) {
      return { plan: id, amount: PLANS[id].priceInr, available: false as const, reason: (e as Error).message };
    }
  });
  const history = await Payment.find({ userId: user._id, status: { $in: ["paid", "refunded"] } })
    .sort({ createdAt: -1 })
    .limit(24)
    .select("plan amount status paidAt periodStart periodEnd invoiceNo paymentId method creditDays")
    .lean();
  return ok({
    enabled: paymentsEnabled(),
    mode: razorpayMode(),
    current: { id: current.id, name: current.name, expiresAt: user.role === "admin" || current.id === "free" ? null : user.planExpiresAt ?? null, source: user.role === "admin" ? "admin" : user.planSource ?? null },
    options,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    history: history.map((p: any) => ({ id: String(p._id), plan: p.plan, amount: p.amount / 100, status: p.status, paidAt: p.paidAt, periodStart: p.periodStart, periodEnd: p.periodEnd, invoiceNo: p.invoiceNo, paymentId: p.paymentId, method: p.method, creditDays: p.creditDays ?? 0 })),
  });
});
