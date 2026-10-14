import { route } from "@/lib/api";
import { loadTargetUser } from "@/lib/admin-target";
import { handleAction, resourceParam } from "@/lib/finance-handlers";

export const runtime = "nodejs";

export const POST = route({ admin: true, perms: ["users.finance.view", "users.finance.manage"] }, async (ctx) => {
  const resource = resourceParam(ctx.params.resource);
  const owner = await loadTargetUser(ctx.params.id);
  return handleAction(ctx, owner, resource, String(ctx.params.recordId), String(ctx.params.action));
});
