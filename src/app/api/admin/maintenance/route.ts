import { route, ok } from "@/lib/api";
import { ensureIndexes } from "@/lib/db";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Admin → Database → "Optimise": creates any missing indexes (never drops data or indexes). */
export const POST = route({ admin: true, perms: ["database.view"] }, async ({ user, ip }) => {
  const r = await ensureIndexes(true);
  await audit({ actor: user, action: "admin.db.indexes", resource: "database", metadata: { models: r.models }, ip });
  return ok(r, "Database indexes are up to date.");
});
