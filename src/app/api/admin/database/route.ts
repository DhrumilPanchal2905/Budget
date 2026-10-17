import { route, ok, parseBody } from "@/lib/api";
import { COLLECTIONS, User } from "@/lib/models";
import { dbDeleteSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { ApiError, Errors } from "@/lib/errors";

export const runtime = "nodejs";

const PURGEABLE: Record<string, { label: string; dateField: string; note: string }> = {
  notifications: { label: "Notifications", dateField: "createdAt", note: "In-app notifications of all users." },
  auditlogs: { label: "Audit logs", dateField: "createdAt", note: "Security history. A record of this purge is kept." },
  realtimeevents: { label: "Realtime events", dateField: "createdAt", note: "Temporary realtime outbox (auto-expires)." },
  ratelimits: { label: "Rate-limit buckets", dateField: "expiresAt", note: "Temporary counters (auto-expire)." },
  sessions: { label: "Sessions", dateField: "createdAt", note: "Signs users out. Your current session is kept." },
  pushsubscriptions: { label: "Push subscriptions", dateField: "createdAt", note: "Users must re-enable push." },
  visits: { label: "Website visits", dateField: "createdAt", note: "Visitor analytics (auto-expire after 180 days)." },
  emailotps: { label: "Pending email codes", dateField: "expiresAt", note: "Unused sign-up / reset codes (auto-expire)." },
};

/** Database overview — counts only. Credentials/URIs are never sent to the browser. */
export const GET = route({ admin: true, perms: ["database.view"] }, async () => {
  const entries = await Promise.all(
    Object.entries(COLLECTIONS).map(async ([name, model]) => ({
      name,
      count: await model.estimatedDocumentCount(),
      purgeable: Boolean(PURGEABLE[name]),
      label: PURGEABLE[name]?.label ?? name,
      note: PURGEABLE[name]?.note ?? (name === "users" ? "Manage via Users." : "User data — managed per user."),
    })),
  );
  return ok({ collections: entries });
});

/**
 * Purge an operational collection. Strong protections:
 * database.delete permission + admin role, exact typed confirmation, admin password re-entry,
 * rate limit, allow-list of collections (users and finance data can NEVER be bulk-wiped here), audit log.
 */
export const DELETE = route({ admin: true, perms: ["database.view", "database.delete"] }, async ({ req, user, ip, sessionId }) => {
  await rateLimit(`db-delete:user:${user._id}`, 5, 60 * 60);
  const data = await parseBody(req, dbDeleteSchema);
  const expected = `DELETE ${data.collection}`;
  if (data.confirm !== expected) throw Errors.badRequest(`Type "${expected}" exactly to confirm.`, { confirm: `Type "${expected}" exactly.` });

  const full = await User.findById(user._id).select("+passwordHash");
  if (!full || !(await verifyPassword(full.passwordHash, data.password))) {
    throw new ApiError(400, "Password is incorrect.", { password: "Password is incorrect." });
  }

  const def = PURGEABLE[data.collection];
  const model = COLLECTIONS[data.collection];
  const filter: Record<string, unknown> = {};
  if (data.olderThanDays > 0) filter[def.dateField] = { $lt: new Date(Date.now() - data.olderThanDays * 86400000) };
  if (data.collection === "sessions") filter._id = { $ne: sessionId };

  const r = await model.deleteMany(filter);
  await audit({
    actor: user,
    action: "admin.database.delete",
    resource: data.collection,
    metadata: { deleted: r.deletedCount, olderThanDays: data.olderThanDays },
    ip,
  });
  return ok({ deleted: r.deletedCount }, `${r.deletedCount} ${def.label.toLowerCase()} deleted.`);
});
