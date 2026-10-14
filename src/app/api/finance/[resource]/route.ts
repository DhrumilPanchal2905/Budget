import { route } from "@/lib/api";
import { requiredPerms } from "@/lib/finance";
import { assertPerms, handleCreate, handleList, resourceParam } from "@/lib/finance-handlers";

export const runtime = "nodejs";

/** List the signed-in user's records (paginated, filtered, server-side sums). */
export const GET = route({}, async (ctx) => {
  const resource = resourceParam(ctx.params.resource);
  assertPerms(ctx, requiredPerms(resource, "view"));
  return handleList(ctx, ctx.user, resource);
});

/** Create a record for the signed-in user (plan limits enforced server-side). */
export const POST = route({}, async (ctx) => {
  const resource = resourceParam(ctx.params.resource);
  assertPerms(ctx, requiredPerms(resource, "create"));
  return handleCreate(ctx, ctx.user, resource);
});
