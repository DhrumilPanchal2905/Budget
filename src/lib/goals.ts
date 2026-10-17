// Goal maths shared by the API, dashboard and Angel AI.
import { fromMinor } from "./money";

const MONTH_MS = 30.4375 * 86400000;

export interface GoalInsight {
  remaining: number;
  monthsLeft: number; // to the target date (0 when passed)
  requiredMonthly: number; // what must be saved per month from now to finish on time
  expectedProgress: number; // % you "should" have by today if saving evenly since the goal was created
  monthlyPace: number; // what you actually add per month (recent contributions, or average since creation)
  projectedDate: string | null; // when you'll finish at the current pace
  status: "achieved" | "on_track" | "ahead" | "behind" | "overdue" | "not_started" | "paused" | "cancelled";
}

/**
 * Accurate goal maths (fixes the old "progress only" view): compares where you ARE with where you SHOULD be
 * by today, and projects the finish date from your real saving pace.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function goalInsight(doc: any, paceMinor?: number | null): GoalInsight {
  const now = Date.now();
  const target = doc.targetAmount ?? 0;
  const current = doc.currentAmount ?? 0;
  const remaining = Math.max(0, target - current);
  const created = new Date(doc.createdAt ?? now).getTime();
  const due = new Date(doc.targetDate).getTime();
  const monthsLeft = Math.max(0, (due - now) / MONTH_MS);
  const totalSpan = Math.max(MONTH_MS / 2, due - created);
  const expectedProgress = Math.max(0, Math.min(100, ((now - created) / totalSpan) * 100));
  const monthsSinceCreated = Math.max(1, (now - created) / MONTH_MS);
  const pace = paceMinor !== undefined && paceMinor !== null ? paceMinor : current / monthsSinceCreated;
  const requiredMonthly = remaining > 0 ? (monthsLeft >= 1 ? remaining / monthsLeft : remaining) : 0;
  const projectedDate = remaining <= 0 ? null : pace > 0 ? new Date(now + (remaining / pace) * MONTH_MS).toISOString().slice(0, 10) : null;
  const progress = target ? (current / target) * 100 : 0;
  let status: GoalInsight["status"];
  if (doc.status === "achieved" || remaining <= 0) status = "achieved";
  else if (doc.status === "paused") status = "paused";
  else if (doc.status === "cancelled") status = "cancelled";
  else if (due < now) status = "overdue";
  else if (current <= 0) status = "not_started";
  else if (progress >= expectedProgress + 10) status = "ahead";
  else if (progress + 5 >= expectedProgress || (projectedDate !== null && new Date(projectedDate).getTime() <= due)) status = "on_track";
  else status = "behind";
  return {
    remaining: fromMinor(remaining),
    monthsLeft: Math.round(monthsLeft * 10) / 10,
    requiredMonthly: fromMinor(Math.ceil(requiredMonthly)),
    expectedProgress: Math.round(expectedProgress),
    monthlyPace: fromMinor(Math.round(pace)),
    projectedDate,
    status,
  };
}

