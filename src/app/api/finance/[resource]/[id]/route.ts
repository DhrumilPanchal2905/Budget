import { route } from "@/lib/api";
import { requiredPerms } from "@/lib/finance";
import { assertPerms, handleDelete, handleUpdate, resourceParam } from "@/lib/finance-handlers";

export const runtime = "nodejs";

// Ownership is enforced inside the DB query ({ _id, userId: session user }) → IDOR-safe.

export const PATCH = route({}, async (ctx) => {
  const resource = resourceParam(ctx.params.resource);
  assertPerms(ctx, requiredPerms(resource, "update"));
  return handleUpdate(ctx, ctx.user, resource, String(ctx.params.id));
});

export const DELETE = route({}, async (ctx) => {
  const resource = resourceParam(ctx.params.resource);
  assertPerms(ctx, requiredPerms(resource, "delete"));
  return handleDelete(ctx, ctx.user, resource, String(ctx.params.id));
});
