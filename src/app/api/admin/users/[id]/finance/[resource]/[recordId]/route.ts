import { route } from "@/lib/api";
import { loadTargetUser } from "@/lib/admin-target";
import { handleDelete, handleUpdate, resourceParam } from "@/lib/finance-handlers";

export const runtime = "nodejs";

// Record ownership is still enforced: the record must belong to the selected user.

export const PATCH = route({ admin: true, perms: ["users.finance.view", "users.finance.manage"] }, async (ctx) => {
  const resource = resourceParam(ctx.params.resource);
  const owner = await loadTargetUser(ctx.params.id);
  return handleUpdate(ctx, owner, resource, String(ctx.params.recordId));
});

export const DELETE = route({ admin: true, perms: ["users.finance.view", "users.finance.manage"] }, async (ctx) => {
  const resource = resourceParam(ctx.params.resource);
  const owner = await loadTargetUser(ctx.params.id);
  return handleDelete(ctx, owner, resource, String(ctx.params.recordId));
});
