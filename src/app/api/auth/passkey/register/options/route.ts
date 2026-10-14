import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { route } from "@/lib/api";
import { Passkey } from "@/lib/models";
import { RP_NAME, rpID, saveChallenge } from "@/lib/webauthn";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Step 1 of enabling "Auto login" on this device (signed-in users only). */
export const POST = route({}, async ({ user }) => {
  await rateLimit(`passkey-reg:user:${user._id}`, 10, 60 * 60);
  const existing = await Passkey.find({ userId: user._id }).select("credentialId transports").lean<{ credentialId: string; transports?: string[] }[]>();

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpID(),
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(String(user._id)),
    attestationType: "none",
    timeout: 60_000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: (c.transports ?? []) as any })),
    authenticatorSelection: {
      authenticatorAttachment: "platform", // the device's built-in lock (fingerprint / face / PIN)
      residentKey: "preferred",
      userVerification: "required",
    },
  });

  const res = NextResponse.json({ success: true, data: { options } }, { headers: { "Cache-Control": "no-store" } });
  await saveChallenge(res, options.challenge, "register", String(user._id));
  return res;
});
