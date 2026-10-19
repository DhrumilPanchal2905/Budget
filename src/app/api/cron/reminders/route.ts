import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { connectDB } from "@/lib/db";
import { Debt, User } from "@/lib/models";
import { notifyUser } from "@/lib/notify";
import { todayUTC } from "@/lib/analytics";
import { formatMoney, fromMinor } from "@/lib/money";
import { audit } from "@/lib/audit";
import { runRecurring } from "@/lib/recurring";
import { ensureIndexes } from "@/lib/db";
import { expirePlans } from "@/lib/billing";

// Daily Vercel Cron job (see vercel.json): EMI due-date reminders + auto-repeat entries + index check.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  await connectDB();
  const today = todayUTC();
  const soon = new Date(today.getTime() + 3 * 86400000);

  const debts = await Debt.find({ status: "active", dueDate: { $lte: soon } }).limit(5000).lean();
  const users = new Map<string, string>(
    (await User.find({ _id: { $in: [...new Set(debts.map((d) => String(d.userId)))] }, status: "active" }).select("currency").lean<{ _id: unknown; currency?: string }[]>()).map(
      (u) => [String(u._id), u.currency || "INR"] as [string, string],
    ),
  );

  let sent = 0;
  for (const d of debts) {
    const currency = users.get(String(d.userId));
    if (!currency) continue;
    const due = new Date(d.dueDate);
    if (d.lastReminderFor && new Date(d.lastReminderFor).getTime() === due.getTime()) continue;
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    const when = days < 0 ? `was due ${Math.abs(days)} day(s) ago` : days === 0 ? "is due today" : `is due in ${days} day(s)`;
    await notifyUser(String(d.userId), {
      type: "debt",
      title: days < 0 ? "EMI overdue" : "EMI reminder",
      message: `Your EMI of ${formatMoney(fromMinor(d.emiAmount), currency)} for "${d.title}" ${when} (${due.toISOString().slice(0, 10)}).`,
      link: "/debts",
    });
    await Debt.updateOne({ _id: d._id }, { $set: { lastReminderFor: due } });
    sent++;
  }
  let recurring = { created: 0, skipped: 0 };
  try {
    recurring = await runRecurring(today);
  } catch (err) {
    console.error("[cron] recurring failed", (err as Error).message);
  }
  let plans = { expired: 0, reminded: 0 };
  try {
    plans = await expirePlans();
  } catch (err) {
    console.error("[cron] plan expiry failed", (err as Error).message);
  }
  await ensureIndexes(false).catch(() => null);
  await audit({ actor: null, action: "system.cron.reminders", metadata: { sent, recurring, plans } });
  return NextResponse.json({ success: true, sent, recurring, plans });
}
