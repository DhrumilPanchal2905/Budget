import { route, ok } from "@/lib/api";
import { quotaForUser, readQuota, userKey } from "@/lib/angel/quota";
import { quotaDTO } from "@/lib/angel/server";

export const runtime = "nodejs";

/** Angel credits left in the current window for the signed-in user. */
export const GET = route({}, async ({ user }) => {
  const state = await readQuota(userKey(user._id), quotaForUser(user));
  return ok({ quota: quotaDTO(state, user) });
});
