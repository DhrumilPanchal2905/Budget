// Paid plans (Plus ₹50, Pro ₹100, Unlimited ₹500 per month) through Razorpay.
//
// Flow:  browser → POST /api/billing/order  → Razorpay Checkout (UPI / card / netbanking / wallet)
//        → POST /api/billing/verify (signature check)  ─┐
//        Razorpay → POST /api/billing/webhook (backup) ─┴→ activatePayment()  (exactly once, idempotent)
//
// A plan is activated ONLY after the server has (1) verified Razorpay's HMAC signature and (2) fetched the payment
// from Razorpay's API and checked order id, amount, currency and status. The amount always comes from our own
// order record, never from the browser.
import { AppSetting, Payment, User, type UserDoc } from "./models";
import { BILLING_DAYS, PLANS, effectivePlanId, getPlan, type PlanId } from "./plans";
import { ApiError } from "./errors";
import { capturePayment, createOrder, fetchPayment, razorpayKeys, type RzpPayment } from "./razorpay";
import { audit } from "./audit";
import { notifyUser, runAfter } from "./notify";
import { publish, userChannel } from "./realtime";
import { sendMail } from "./mailer";
import { adminEmails } from "./signup";
import { APP_URL } from "./env";
import { invalidateUserCache } from "./auth";
export { businessInfo, type BusinessInfo } from "./business";
import { quote } from "./billing-quote";
export { quote, type Quote } from "./billing-quote";

const DAY = 86400000;

export function paymentsEnabled(): boolean {
  return razorpayKeys() !== null;
}

/** Creates a Razorpay order for the plan (amount decided here, on the server). */
export async function startCheckout(user: UserDoc, plan: PlanId, ip: string) {
  const keys = razorpayKeys();
  if (!keys) throw new ApiError(503, "Online payments are not set up yet. Please try again later.");
  const q = quote(user, plan);
  // one open order per user + plan is enough — reuse it for 30 minutes (double clicks, retries)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const open: any = await Payment.findOne({ userId: user._id, plan, status: "created", amount: q.amountPaise, createdAt: { $gt: new Date(Date.now() - 30 * 60000) } }).sort({ createdAt: -1 }).lean();
  let orderId: string = open?.orderId;
  if (!orderId) {
    const receipt = `bp_${String(user._id).slice(-8)}_${Date.now().toString(36)}`;
    const order = await createOrder(q.amountPaise, receipt, { userId: String(user._id), plan, email: user.email });
    orderId = order.id;
    await Payment.create({ userId: user._id, email: user.email, name: user.name, plan, amount: q.amountPaise, currency: "INR", orderId, status: "created", receipt, ip });
    await audit({ actor: user, action: "billing.order", resource: "payment", resourceId: orderId, metadata: { plan, amount: q.amountPaise / 100 }, ip });
  }
  return {
    keyId: keys.keyId,
    orderId,
    amount: q.amountPaise,
    currency: "INR",
    plan,
    planName: PLANS[plan].name,
    mode: q.mode,
    creditDays: q.creditDays,
    periodEnd: q.periodEnd.toISOString(),
    prefill: { name: user.name, email: user.email },
  };
}

/** Indian financial year (April → March) of a moment, in IST. */
function fyOf(at: Date): string {
  const ist = new Date(at.getTime() + 330 * 60000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

async function nextInvoiceNo(at: Date): Promise<string> {
  const fy = fyOf(at);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = await AppSetting.findOneAndUpdate({ key: `invoiceSeq:${fy}` }, { $inc: { value: 1 }, $set: { updatedAt: new Date() } }, { new: true, upsert: true }).lean();
      return `BP/${fy}/${String(doc?.value ?? 1).padStart(5, "0")}`;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e; // two first-invoices-of-the-year at once → retry
    }
  }
  throw new Error("Could not allocate an invoice number");
}

export interface ActivationResult {
  ok: boolean;
  already?: boolean;
  status: "paid" | "failed" | "pending" | "unknown";
  plan?: PlanId;
  periodEnd?: string;
  message: string;
}

/**
 * Confirms a payment with Razorpay and activates the plan — exactly once, whoever calls first
 * (the browser after checkout, Razorpay's webhook, or an admin's "Check").
 * Two steps, both idempotent: (1) mark the payment PAID, (2) APPLY it to the account. If step 2 fails (e.g. a
 * database hiccup) the payment stays "paid, not applied" and any later call finishes it — money is never lost.
 */
export async function activatePayment(orderId: string, paymentId: string, via: "checkout" | "webhook" | "sync", known?: RzpPayment): Promise<ActivationResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pay: any = await Payment.findOne({ orderId });
  if (!pay) return { ok: false, status: "unknown", message: "Order not found." };
  if (pay.status === "refunded") return { ok: false, status: "failed", message: "This payment was refunded." };
  if (pay.status === "paid") return applyPayment(String(pay._id));

  // 1) ask Razorpay what really happened (never trust the browser)
  let rp = known && known.id === paymentId ? known : await fetchPayment(paymentId);
  if (rp.order_id !== orderId || rp.amount !== pay.amount || rp.currency !== "INR") {
    console.error("[billing] payment mismatch", { orderId, paymentId, rpOrder: rp.order_id, rpAmount: rp.amount, expected: pay.amount });
    return { ok: false, status: "failed", message: "Payment details did not match the order." };
  }
  if (rp.status === "authorized") {
    // a webhook snapshot can be a few seconds old — Razorpay usually auto-captures right away, so look again first
    if (rp === known) rp = await fetchPayment(paymentId);
    if (rp.status === "authorized") {
      try {
        rp = await capturePayment(paymentId, pay.amount);
      } catch (e) {
        // "already been captured" = someone (Razorpay auto-capture / a parallel call) was faster → that's fine
        rp = await fetchPayment(paymentId).catch(() => rp);
        if (rp.status !== "captured") {
          console.error("[billing] capture failed", (e as Error).message);
          return { ok: false, status: "pending", message: "Payment is authorized but not captured yet. It will be confirmed automatically." };
        }
      }
    }
  }
  if (rp.status === "failed") {
    await Payment.updateOne({ _id: pay._id, status: "created" }, { $set: { status: "failed", paymentId, failureReason: (rp.error_description || "Payment failed").slice(0, 300) } });
    return { ok: false, status: "failed", message: rp.error_description || "Payment failed." };
  }
  if (rp.status === "refunded") return { ok: false, status: "failed", message: "This payment was refunded." };
  if (rp.status !== "captured") return { ok: false, status: "pending", message: "Payment is still processing." };

  // 2) mark it paid atomically (only one caller wins; the others just help finish step 3)
  await Payment.updateOne({ _id: pay._id, status: { $in: ["created", "failed"] } }, { $set: { status: "paid", paymentId, paidAt: new Date(), method: rp.method, verifiedBy: via }, $unset: { failureReason: 1 } });
  return applyPayment(String(pay._id));
}

const APPLY_STALE_MS = 2 * 60000;

/** Step 3: extend / upgrade the plan for a PAID payment. Exactly once (claimed with applyState). */
async function applyPayment(paymentDbId: string): Promise<ActivationResult> {
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claimed: any = await Payment.findOneAndUpdate(
    { _id: paymentDbId, status: "paid", $or: [{ applyState: { $exists: false } }, { applyState: null }, { applyState: "applying", applyStartedAt: { $lt: new Date(now.getTime() - APPLY_STALE_MS) } }] },
    { $set: { applyState: "applying", applyStartedAt: now } },
    { new: true },
  );
  if (!claimed) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur: any = await Payment.findById(paymentDbId).lean();
    const done = cur?.applyState === "applied";
    return { ok: cur?.status === "paid", already: true, status: cur?.status === "paid" ? (done ? "paid" : "pending") : "pending", plan: cur?.plan, periodEnd: cur?.periodEnd?.toISOString(), message: done ? "Payment already confirmed." : "Payment received — activating your plan…" };
  }

  const plan = claimed.plan as PlanId;
  let periodStart = now;
  let periodEnd = new Date(now.getTime() + BILLING_DAYS * DAY);
  let creditDays = 0;
  let note: string | undefined;
  let user: UserDoc | null = null;
  try {
    // compare-and-set on the account so two payments activating at once can't overwrite each other's days
    for (let attempt = 0; attempt < 4; attempt++) {
      user = await User.findById(claimed.userId).lean<UserDoc>();
      if (!user) {
        note = "Account no longer exists — refund this payment.";
        break;
      }
      const guard = { _id: user._id, plan: user.plan, planExpiresAt: user.planExpiresAt ?? null };
      let set: Record<string, unknown>;
      try {
        const q = quote(user, plan, now.getTime());
        periodStart = q.periodStart;
        periodEnd = q.periodEnd;
        creditDays = q.creditDays;
        set = { plan, planExpiresAt: periodEnd, planSource: "paid" };
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        // e.g. an admin gave them a higher plan meanwhile → keep it; add the paid days to the current paid period
        const cur = effectivePlanId(user, now.getTime());
        const exp = user.planExpiresAt ? new Date(user.planExpiresAt) : null;
        if (exp && exp.getTime() > now.getTime() && user.planSource === "paid") {
          const days = Math.floor((BILLING_DAYS * PLANS[plan].priceInr) / Math.max(1, PLANS[cur].priceInr));
          periodStart = exp;
          periodEnd = new Date(exp.getTime() + days * DAY);
          set = { planExpiresAt: periodEnd };
          note = `Added ${days} days to ${PLANS[cur].name}`;
        } else {
          note = `Paid but NOT applied (${e.message}) — refund this payment.`.slice(0, 300);
          break;
        }
      }
      const r = await User.updateOne(guard, { $set: set, $unset: { planReminderAt: 1 } });
      if (r.modifiedCount || r.matchedCount) break;
      user = null; // the account changed in between → read again and recompute
      if (attempt === 3) throw new Error("Account kept changing — try again");
    }
  } catch (e) {
    // database / network trouble: leave it "applying"; the next verify / webhook / admin Check finishes it
    console.error("[billing] apply failed", (e as Error).message);
    await Payment.updateOne({ _id: claimed._id }, { $set: { applyStartedAt: new Date(0) } }).catch(() => null);
    return { ok: true, status: "pending", plan, message: "Payment received — your plan will activate in a moment." };
  }

  const applied = !!user && !note?.startsWith("Paid but NOT applied") && !note?.startsWith("Account no longer");
  const invoiceNo: string = claimed.invoiceNo ?? (await nextInvoiceNo(claimed.paidAt ?? now));
  await Payment.updateOne({ _id: claimed._id }, { $set: { applyState: "applied", periodStart, periodEnd, creditDays, invoiceNo, ...(note ? { failureReason: note } : {}) } });
  if (user) invalidateUserCache(String(user._id));

  // tell everyone (after the response — never slows the checkout)
  const amount = claimed.amount / 100;
  const paymentId: string = claimed.paymentId;
  runAfter(async () => {
    const tasks: Promise<unknown>[] = [];
    if (user && applied) {
      tasks.push(
        audit({ actor: user, action: "billing.paid", resource: "payment", resourceId: claimed.orderId, targetUserId: String(user._id), metadata: { plan, amount, paymentId, via: claimed.verifiedBy, invoiceNo } }),
        notifyUser(String(user._id), { type: "system", title: `🎉 ${PLANS[plan].name} plan activated`, message: `Payment of ₹${amount} received. Your plan is active until ${fmtDate(periodEnd)}.`, link: "/plan" }),
        publish([userChannel(String(user._id))], "profile:changed", { plan }),
        sendMail(user.email, ...receiptMail(user.name, plan, amount, invoiceNo, paymentId, periodEnd, creditDays)).catch((e) => console.error("[billing] receipt mail failed", (e as Error).message)),
      );
    }
    const admins = await adminRecipients();
    if (admins.length) {
      const [subject, html, text] = adminMail(user?.name ?? claimed.name, user?.email ?? claimed.email, plan, amount, invoiceNo, paymentId, claimed.method, periodEnd, applied ? undefined : note);
      tasks.push(sendMail(admins.join(","), subject, html, text).catch((e) => console.error("[billing] admin mail failed", (e as Error).message)));
    }
    const adminUsers = await User.find({ role: "admin", status: "active" }).select("_id").lean();
    for (const a of adminUsers) tasks.push(notifyUser(String(a._id), { type: "admin", title: applied ? `💰 New payment ₹${amount}` : `⚠️ Payment ₹${amount} needs attention`, message: applied ? `${claimed.name} bought ${PLANS[plan].name} (${invoiceNo}).` : `${claimed.name}: ${note}`, link: "/admin/payments", push: true }));
    await Promise.allSettled(tasks);
  });

  if (!applied) return { ok: false, status: "paid", plan, message: `Payment received, but the plan could not be applied: ${note} Our team has been notified and will fix or refund it.` };
  return { ok: true, status: "paid", plan, periodEnd: periodEnd.toISOString(), message: `${PLANS[plan].name} is active until ${fmtDate(periodEnd)}.` };
}

/**
 * A refund made in the Razorpay dashboard (webhook payment.refunded / refund.processed). A FULL refund marks the
 * payment refunded and takes back the days it bought (if it funded the current period).
 */
export async function refundPayment(paymentId: string, amountRefunded: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pay: any = await Payment.findOne({ paymentId });
  if (!pay || pay.status !== "paid") return;
  if (amountRefunded < pay.amount) {
    await Payment.updateOne({ _id: pay._id }, { $set: { failureReason: `Partly refunded: ₹${amountRefunded / 100}` } });
    return;
  }
  const r = await Payment.updateOne({ _id: pay._id, status: "paid" }, { $set: { status: "refunded", failureReason: "Refunded" } });
  if (!r.modifiedCount) return;
  const user = await User.findById(pay.userId).lean<UserDoc>();
  if (user && pay.applyState === "applied" && pay.periodEnd && user.planExpiresAt && new Date(user.planExpiresAt).getTime() === new Date(pay.periodEnd).getTime()) {
    // this payment funded the end of the current period → that period ends where it started
    const newEnd = pay.periodStart ? new Date(pay.periodStart) : new Date();
    await User.updateOne({ _id: user._id, planExpiresAt: user.planExpiresAt }, { $set: { planExpiresAt: newEnd } });
    invalidateUserCache(String(user._id));
    await publish([userChannel(String(user._id))], "profile:changed", {}).catch(() => null);
  }
  if (user) await notifyUser(String(user._id), { type: "system", title: "Refund processed", message: `₹${pay.amount / 100} for ${PLANS[pay.plan as PlanId].name} (${pay.invoiceNo ?? pay.orderId}) has been refunded to your original payment method.`, link: "/plan" }).catch(() => null);
  await audit({ actor: null, action: "billing.refunded", resource: "payment", resourceId: pay.orderId, targetUserId: String(pay.userId), metadata: { amount: pay.amount / 100, paymentId } });
}

async function adminRecipients(): Promise<string[]> {
  const set = new Set(adminEmails());
  const admins = await User.find({ role: "admin", status: "active" }).select("email").lean<{ email: string }[]>();
  admins.forEach((a) => set.add(a.email));
  return [...set].slice(0, 10);
}

/** Bought plans whose period ended → back to Free (run daily by the cron job; also enforced live in planForUser). */
export async function expirePlans(): Promise<{ expired: number; reminded: number }> {
  const now = new Date();
  let expired = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const due: any[] = await User.find({ planSource: "paid", plan: { $ne: "free" }, planExpiresAt: { $lte: now }, role: { $ne: "admin" } }).select("_id name email plan").limit(500).lean();
  for (const u of due) {
    const r = await User.updateOne({ _id: u._id, planSource: "paid", planExpiresAt: { $lte: now } }, { $set: { plan: "free", planExpiresAt: null }, $unset: { planSource: 1, planReminderAt: 1 } });
    if (!r.modifiedCount) continue;
    expired++;
    invalidateUserCache(String(u._id));
    const name = getPlan(u.plan).name;
    await notifyUser(String(u._id), { type: "system", title: `Your ${name} plan has ended`, message: "You're on the Free plan now — your data is safe. Renew any time from the Plan page.", link: "/plan" }).catch(() => null);
    await sendMail(u.email, ...expiredMail(u.name, name)).catch(() => null);
  }
  // reminders 3 days before the end (once per period)
  let reminded = 0;
  const soon = new Date(now.getTime() + 3 * DAY);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ending: any[] = await User.find({ planSource: "paid", plan: { $ne: "free" }, planExpiresAt: { $gt: now, $lte: soon }, planReminderAt: { $exists: false } }).select("_id name email plan planExpiresAt").limit(500).lean();
  for (const u of ending) {
    const r = await User.updateOne({ _id: u._id, planReminderAt: { $exists: false } }, { $set: { planReminderAt: now } });
    if (!r.modifiedCount) continue;
    reminded++;
    const name = getPlan(u.plan).name;
    await notifyUser(String(u._id), { type: "system", title: `${name} ends on ${fmtDate(u.planExpiresAt)}`, message: "Renew now to keep your limits — renewing adds 30 days after the current end date.", link: "/plan" }).catch(() => null);
  }
  return { expired, reminded };
}

// ---------------- emails ----------------
const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function wrap(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0b0f;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e7e7ea">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#15151b;border:1px solid #26262e;border-radius:16px;padding:28px">
<tr><td style="font-size:18px;font-weight:700;color:#fff;padding-bottom:6px">💰 Budget Pro</td></tr>
<tr><td style="font-size:20px;font-weight:600;color:#fff;padding:10px 0">${esc(title)}</td></tr>
<tr><td style="font-size:14px;line-height:1.6;color:#b8b8c2">${body}</td></tr>
<tr><td style="padding-top:22px;font-size:12px;color:#7a7a85;border-top:1px solid #26262e">Budget Pro · <a href="${APP_URL}" style="color:#8ab4ff">${esc(APP_URL.replace(/^https?:\/\//, ""))}</a> · Questions? Reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
}
const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#8a8a95">${esc(k)}</td><td style="padding:6px 0;text-align:right;color:#fff">${esc(v)}</td></tr>`;

export function receiptMail(name: string, plan: PlanId, amount: number, invoiceNo: string, paymentId: string, periodEnd: Date, creditDays: number): [string, string, string] {
  const p = PLANS[plan];
  const first = name.split(" ")[0];
  const html = wrap(
    `Payment received — ${p.name} is active 🎉`,
    `Hi ${esc(first)},<br/><br/>Thank you! Your payment was successful and your <b>${esc(p.name)}</b> plan is now active.
<table role="presentation" width="100%" style="margin:16px 0;border-top:1px solid #26262e;border-bottom:1px solid #26262e">
${row("Invoice", invoiceNo)}${row("Plan", `${p.name} (monthly)`)}${row("Amount paid", `₹${amount.toLocaleString("en-IN")}`)}${row("Payment ID", paymentId)}${row("Active until", fmtDate(periodEnd))}${creditDays ? row("Carried over", `${creditDays} days from your previous plan`) : ""}
</table>
What you get: ${esc(p.features.join(" · "))}.<br/><br/>
<a href="${APP_URL}/plan" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">View plan & invoice</a><br/><br/>
<span style="color:#8a8a95">Plans don't renew automatically — we'll remind you 3 days before the end date.</span>`,
  );
  const text = `Hi ${first},\n\nPayment received — your ${p.name} plan is active until ${fmtDate(periodEnd)}.\nInvoice: ${invoiceNo}\nAmount: ₹${amount}\nPayment ID: ${paymentId}\n\nView: ${APP_URL}/plan`;
  return [`Payment received — Budget Pro ${p.name} (₹${amount}) · ${invoiceNo}`, html, text];
}

function adminMail(name: string, email: string, plan: PlanId, amount: number, invoiceNo: string, paymentId: string, method: string | undefined, periodEnd: Date, problem?: string): [string, string, string] {
  const p = PLANS[plan];
  const html = wrap(
    problem ? `⚠️ Payment needs attention: ₹${amount} · ${p.name}` : `New payment: ₹${amount} · ${p.name}`,
    `${problem ? `<p style="color:#ffb4b4">${esc(problem)}</p>` : ""}<table role="presentation" width="100%" style="margin:6px 0;border-top:1px solid #26262e;border-bottom:1px solid #26262e">
${row("Customer", `${name} <${email}>`)}${row("Plan", p.name)}${row("Amount", `₹${amount.toLocaleString("en-IN")}`)}${row("Method", method ?? "—")}${row("Invoice", invoiceNo)}${row("Payment ID", paymentId)}${row("Active until", fmtDate(periodEnd))}
</table><a href="${APP_URL}/admin/payments" style="color:#8ab4ff">Open payments in admin →</a>`,
  );
  const text = `New payment ₹${amount} — ${name} <${email}> bought ${p.name}. Invoice ${invoiceNo}, payment ${paymentId}, method ${method ?? "-"}. Active until ${fmtDate(periodEnd)}.\n${APP_URL}/admin/payments`;
  return [problem ? `⚠️ Payment needs attention ₹${amount} — ${name}` : `💰 New payment ₹${amount} — ${name} (${p.name})`, html, problem ? `${problem}\n${text}` : text];
}

function expiredMail(name: string, planName: string): [string, string, string] {
  const first = name.split(" ")[0];
  const html = wrap(`Your ${planName} plan has ended`, `Hi ${esc(first)},<br/><br/>Your ${esc(planName)} plan period is over, so your account is on the <b>Free</b> plan now. All your data is safe.<br/><br/><a href="${APP_URL}/plan" style="color:#8ab4ff">Renew ${esc(planName)} →</a>`);
  return [`Your Budget Pro ${planName} plan has ended`, html, `Hi ${first}, your ${planName} plan has ended and you're on Free now. Your data is safe. Renew: ${APP_URL}/plan`];
}