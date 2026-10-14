import { route, ok } from "@/lib/api";
import { AuditLog, isObjectId } from "@/lib/models";

export const runtime = "nodejs";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const GET = route({ admin: true, perms: ["audit.view"] }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  const q = (sp.get("q") || "").trim().slice(0, 80);
  if (q) filter.$or = [{ actorEmail: { $regex: escapeRegex(q), $options: "i" } }, { action: { $regex: escapeRegex(q), $options: "i" } }];
  const action = sp.get("action");
  if (action && /^[a-z._]{1,60}$/.test(action)) filter.action = { $regex: `^${escapeRegex(action)}` };
  const userId = sp.get("userId");
  if (userId && isObjectId(userId)) filter.$and = [{ $or: [{ targetUserId: userId }, { actorId: userId }] }];
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 30));

  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return ok({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: items.map((a: any) => ({
      id: String(a._id),
      action: a.action,
      actorEmail: a.actorEmail ?? "system",
      actorRole: a.actorRole ?? null,
      resource: a.resource ?? null,
      resourceId: a.resourceId ?? null,
      targetUserId: a.targetUserId ? String(a.targetUserId) : null,
      metadata: a.metadata ?? {},
      ip: a.ip ?? null,
      createdAt: a.createdAt,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});
