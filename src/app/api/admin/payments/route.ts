import { route, ok, searchParams } from "@/lib/api";
import { Payment } from "@/lib/models";
import { razorpayMode } from "@/lib/razorpay";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** All payments with revenue totals (admin). */
export const GET = route({ admin: true, perms: ["users.view"] }, async ({ req }) => {
  const sp = searchParams(req);
  const status = sp.get("status");
  const plan = sp.get("plan");
  const q = (sp.get("q") || "").trim().slice(0, 80);
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = 25;
  const filter: Record<string, unknown> = {};
  if (status && ["created", "paid", "failed", "refunded"].includes(status)) filter.status = status;
  if (plan && ["plus", "pro", "unlimited"].includes(plan)) filter.plan = plan;
  if (q) filter.$or = [{ email: new RegExp(esc(q), "i") }, { name: new RegExp(esc(q), "i") }, { paymentId: q }, { orderId: q }, { invoiceNo: q }];

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [items, total, sums] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Payment.countDocuments(filter),
    Payment.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          all: { $sum: "$amount" },
          count: { $sum: 1 },
          month: { $sum: { $cond: [{ $gte: ["$paidAt", monthStart] }, "$amount", 0] } },
          monthCount: { $sum: { $cond: [{ $gte: ["$paidAt", monthStart] }, 1, 0] } },
          plus: { $sum: { $cond: [{ $eq: ["$plan", "plus"] }, "$amount", 0] } },
          pro: { $sum: { $cond: [{ $eq: ["$plan", "pro"] }, "$amount", 0] } },
          unlimited: { $sum: { $cond: [{ $eq: ["$plan", "unlimited"] }, "$amount", 0] } },
          payers: { $addToSet: "$userId" },
        },
      },
      { $project: { all: 1, count: 1, month: 1, monthCount: 1, plus: 1, pro: 1, unlimited: 1, payers: { $size: "$payers" } } },
    ]),
  ]);
  const s = sums[0] ?? { all: 0, count: 0, month: 0, monthCount: 0, plus: 0, pro: 0, unlimited: 0, payers: 0 };
  const pending = await Payment.countDocuments({ status: "created", createdAt: { $gt: new Date(Date.now() - 86400000) } });
  return ok({
    mode: razorpayMode(),
    summary: { revenue: s.all / 100, payments: s.count, month: s.month / 100, monthPayments: s.monthCount, byPlan: { plus: s.plus / 100, pro: s.pro / 100, unlimited: s.unlimited / 100 }, payers: s.payers, pendingToday: pending },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: items.map((p: any) => ({ id: String(p._id), userId: String(p.userId), name: p.name, email: p.email, plan: p.plan, amount: p.amount / 100, status: p.status, method: p.method ?? null, orderId: p.orderId, paymentId: p.paymentId ?? null, invoiceNo: p.invoiceNo ?? null, createdAt: p.createdAt, paidAt: p.paidAt ?? null, periodEnd: p.periodEnd ?? null, verifiedBy: p.verifiedBy ?? null, applied: p.status !== "paid" || p.applyState === "applied", note: p.failureReason ?? null })),
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    total,
  });
});
