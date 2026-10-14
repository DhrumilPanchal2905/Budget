import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { listRecords, requiredPerms } from "@/lib/finance";
import { assertPerms, resourceParam } from "@/lib/finance-handlers";
import { RESOURCES } from "@/lib/finance-config";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /api/reports/export?resource=expense&month=YYYY-MM → CSV download of the user's own data. */
export const GET = route({ perms: ["reports.export", "finance.read"] }, async (ctx) => {
  await rateLimit(`export:user:${ctx.user._id}`, 20, 60 * 60);
  const sp = ctx.req.nextUrl.searchParams;
  const resource = resourceParam(sp.get("resource"));
  assertPerms(ctx, requiredPerms(resource, "view"));

  const def = RESOURCES[resource];
  const cols = def.fields.map((f) => f.name);
  const rows: string[] = [cols.join(",")];
  let page = 1;
  for (;;) {
    const data = await listRecords(String(ctx.user._id), resource, { month: sp.get("month"), page, limit: 100, order: "desc" });
    for (const item of data.items) rows.push(cols.map((c) => csvCell(item[c])).join(","));
    if (page >= data.pages || page >= 100) break;
    page++;
  }
  await audit({ actor: ctx.user, action: "reports.export", resource, targetUserId: String(ctx.user._id), metadata: { rows: rows.length - 1 }, ip: ctx.ip });
  const filename = `budget-pro-${resource}-${sp.get("month") || "all"}.csv`;
  return new NextResponse("﻿" + rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
