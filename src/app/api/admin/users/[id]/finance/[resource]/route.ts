import { route } from "@/lib/api";
import { loadTargetUser } from "@/lib/admin-target";
import { assertPerms, handleCreate, handleList, resourceParam } from "@/lib/finance-handlers";

export const runtime = "nodejs";

export const GET = route({ admin: true, perms: ["users.view", "users.finance.view"] }, async (ctx) => {
  const resource = resourceParam(ctx.params.resource);
  const owner = await loadTargetUser(ctx.params.id);
  return handleList(ctx, owner, resource);
});

export const POST = route({ admin: true, perms: ["users.finance.view", "users.finance.manage"] }, async (ctx) => {
  const resource = resourceParam(ctx.params.resource);
  assertPerms(ctx, ["users.finance.manage"]);
  const owner = await loadTargetUser(ctx.params.id);
  return handleCreate(ctx, owner, resource);
});
