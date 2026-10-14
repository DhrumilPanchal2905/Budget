import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { route, parseBody } from "@/lib/api";
import { Passkey, User } from "@/lib/models";
import { rpID, saveChallenge } from "@/lib/webauthn";
import { rateLimit } from "@/lib/ratelimit";
import { emailSchema } from "@/lib/validation";

export const runtime = "nodejs";

const schema = z.object({ email: emailSchema.optional() });

/** Step 1 of "Auto login": issue a challenge the device must sign after unlocking (biometric / PIN). */
export const POST = route({ auth: false }, async ({ req, ip }) => {
  await rateLimit(`passkey-login:ip:${ip}`, 30, 15 * 60);
  const { email } = await parseBody(req, schema);

  let allow: { id: string; transports?: string[] }[] = [];
  if (email) {
    const u = await User.findOne({ email, status: "active" }).select("_id").lean<{ _id: unknown } | null>();
    if (u) {
      allow = (await Passkey.find({ userId: u._id }).select("credentialId transports").lean<{ credentialId: string; transports?: string[] }[]>()).map((p) => ({
        id: p.credentialId,
        transports: p.transports,
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: rpID(),
    timeout: 60_000,
    userVerification: "required",
    // Empty list → the browser offers any passkey saved for this site (discoverable credentials).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allowCredentials: allow.map((a) => ({ id: a.id, transports: (a.transports ?? []) as any })),
  });

  const res = NextResponse.json({ success: true, data: { options } }, { headers: { "Cache-Control": "no-store" } });
  await saveChallenge(res, options.challenge, "login");
  return res;
});
