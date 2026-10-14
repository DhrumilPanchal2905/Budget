import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { route, parseBody } from "@/lib/api";
import { Passkey } from "@/lib/models";
import { b64url, clearChallengeCookie, consumeChallenge, deviceNameFromUA, expectedOrigin, rpID } from "@/lib/webauthn";
import { audit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { ApiError, Errors } from "@/lib/errors";

export const runtime = "nodejs";

const schema = z.object({
  response: z.record(z.unknown()),
  deviceName: z.string().trim().max(80).optional(),
});

/** Step 2: verify the device's attestation and store its PUBLIC key. */
export const POST = route({}, async ({ req, user, ip }) => {
  const { response, deviceName } = await parseBody(req, schema);
  const challenge = await consumeChallenge(req, "register", String(user._id));

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: response as any,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpID(),
      requireUserVerification: true,
    });
  } catch {
    throw new ApiError(400, "Device verification failed. Please try again.");
  }
  if (!verification.verified || !verification.registrationInfo) throw new ApiError(400, "Device verification failed. Please try again.");

  const { credential } = verification.registrationInfo;
  if (await Passkey.exists({ credentialId: credential.id })) throw Errors.conflict("This device is already set up for auto login.");
  const count = await Passkey.countDocuments({ userId: user._id });
  if (count >= 10) throw Errors.badRequest("You can register up to 10 devices. Remove an old device in Settings first.");

  const name = deviceName || deviceNameFromUA(req.headers.get("user-agent") || "");
  const pk = await Passkey.create({
    userId: user._id,
    credentialId: credential.id,
    publicKey: b64url.encode(credential.publicKey),
    counter: credential.counter ?? 0,
    transports: credential.transports ?? [],
    deviceName: name,
  });

  await audit({ actor: user, action: "auth.passkey_add", resource: "passkey", resourceId: String(pk._id), targetUserId: String(user._id), metadata: { device: name }, ip });
  await notifyUser(String(user._id), {
    type: "system",
    title: "Auto login enabled",
    message: `Device login was set up on ${name}. If this wasn't you, remove it in Settings → Devices.`,
    link: "/settings",
  });

  const res = NextResponse.json({ success: true, message: "Auto login enabled on this device.", data: { id: String(pk._id), deviceName: name } });
  clearChallengeCookie(res);
  return res;
});
