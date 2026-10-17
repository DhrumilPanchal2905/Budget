// Daily job: auto-adds the next occurrence of entries the user marked "Auto-repeat" (salary, rent, SIP, bills…).
// Only entries with autoRepeat = true are touched, and only from the next date onwards — never back-filled.
import { Expense, Income, User, type UserDoc } from "./models";
import { assertPlanCapacity, stepDate } from "./finance";
import { notifyUser } from "./notify";
import { publish, userChannel } from "./realtime";
import { formatMoney, fromMinor } from "./money";
import { checkBudgetAlerts } from "./budgets";

const MAX_PER_RUN = 1000;
const MAX_CATCHUP = 3; // if the job was down for months, add at most 3 missed occurrences per entry

export async function runRecurring(today: Date): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  const touched = new Set<string>();
  for (const [model, kind] of [
    [Income, "income"],
    [Expense, "expense"],
  ] as const) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const due: any[] = await model.find({ autoRepeat: true, recurrenceNext: { $lte: today } }).limit(MAX_PER_RUN).lean();
    const owners = new Map<string, UserDoc>(
      (await User.find({ _id: { $in: [...new Set(due.map((d) => String(d.userId)))] } }).lean<UserDoc[]>()).map((u) => [String(u._id), u] as [string, UserDoc]),
    );
    for (const src of due) {
      const owner = owners.get(String(src.userId));
      if (owner && owner.status !== "active") continue; // blocked user: pause, keep their settings untouched
      if (!owner || !src.recurring || src.recurring === "none") {
        // user gone or entry no longer repeats → stop scheduling it
        await model.updateOne({ _id: src._id }, { $set: { autoRepeat: false }, $unset: { recurrenceNext: 1 } });
        continue;
      }
      const anchor = new Date(src.date).getUTCDate();
      let next = new Date(src.recurrenceNext);
      let n = 0;
      let blocked = false;
      while (next.getTime() <= today.getTime() && n < MAX_CATCHUP) {
        try {
          await assertPlanCapacity(owner, kind);
        } catch {
          skipped++;
          blocked = true;
          await notifyUser(String(owner._id), { type: "finance", title: "Auto-repeat paused", message: `"${src.title}" could not be added automatically because your plan's record limit is reached. It will be added once there is room.`, link: "/plan" });
          break;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const copy: any = { userId: src.userId, title: src.title, category: src.category, amount: src.amount, date: next, recurring: src.recurring, notes: `Auto-added (repeats ${src.recurring})`, autoRepeat: false, recurringParentId: src._id };
        if (kind === "income") copy.type = src.type ?? "extra";
        // idempotent: never create the same occurrence twice (e.g. if the job runs twice)
        const exists = await model.exists({ userId: src.userId, recurringParentId: src._id, date: next });
        let made = false;
        if (!exists) {
          try {
            await model.create(copy);
            made = true;
          } catch (err) {
            if ((err as { code?: number })?.code !== 11000) throw err; // unique index: another run already added it
          }
        }
        if (made) {
          created++;
          touched.add(String(owner._id));
          await notifyUser(String(owner._id), {
            type: "finance",
            title: kind === "income" ? "Income auto-added" : "Expense auto-added",
            message: `${src.title} — ${formatMoney(fromMinor(src.amount), owner.currency || "INR")} on ${next.toISOString().slice(0, 10)} (repeats ${src.recurring}).`,
            link: kind === "income" ? "/income" : "/expenses",
            push: false,
          });
          if (kind === "expense") await checkBudgetAlerts(owner, src.category);
        }
        next = stepDate(next, src.recurring, anchor);
        n++;
      }
      if (blocked) {
        // keep the missed date so it is added as soon as the plan has room
        await model.updateOne({ _id: src._id }, { $set: { recurrenceNext: next } });
        continue;
      }
      while (next.getTime() <= today.getTime()) next = stepDate(next, src.recurring, anchor);
      await model.updateOne({ _id: src._id }, { $set: { recurrenceNext: next } });
    }
  }
  for (const id of touched) await publish([userChannel(id)], "finance:changed", { resource: "recurring", action: "create" });
  return { created, skipped };
}
