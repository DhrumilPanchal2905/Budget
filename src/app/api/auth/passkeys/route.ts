import { route, ok } from "@/lib/api";
import { Passkey } from "@/lib/models";

export const runtime = "nodejs";

/** Devices with auto login (passkeys) for the signed-in user. */
export const GET = route({}, async ({ user }) => {
  const items = await Passkey.find({ userId: user._id }).sort({ createdAt: -1 }).lean();
  return ok({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: items.map((p: any) => ({ id: String(p._id), deviceName: p.deviceName, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt ?? null })),
  });
});
