import { route, ok } from "@/lib/api";
import { currentMonthKey, getMonthly, getOverall } from "@/lib/analytics";
import { Errors } from "@/lib/errors";

export const runtime = "nodejs";

/** GET /api/analytics?view=monthly&month=YYYY-MM  |  /api/analytics?view=overall */
export const GET = route({ perms: ["finance.read", "reports.view"] }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") || "monthly";
  if (view === "overall") return ok(await getOverall(String(user._id)));
  if (view !== "monthly") throw Errors.badRequest("Unknown view.");
  const month = sp.get("month") || currentMonthKey();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Errors.badRequest("Month must be YYYY-MM.");
  return ok(await getMonthly(String(user._id), month));
});
