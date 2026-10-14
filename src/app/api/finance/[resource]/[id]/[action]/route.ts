import { route } from "@/lib/api";
import { actionPerms, assertPerms, handleAction, resourceParam } from "@/lib/finance-handlers";

export const runtime = "nodejs";

/** POST /api/finance/debt/:id/pay  |  POST /api/finance/goal/:id/contribute */
export const POST = route({}, async (ctx) => {
  const resource = resourceParam(ctx.params.resource);
  const action = String(ctx.params.action);
  assertPerms(ctx, actionPerms(resource, action));
  return handleAction(ctx, ctx.user, resource, String(ctx.params.id), action);
});
