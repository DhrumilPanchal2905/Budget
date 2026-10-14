import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { route, parseBody } from "@/lib/api";
import { Passkey, User, type UserDoc } from "@/lib/models";
import { b64url, clearChallengeCookie, consumeChallenge, expectedOrigin, rpID } from "@/lib/webauthn";
import { createSession, publicUser, setSessionCookie } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";

const schema = z.object({ response: z.record(z.unknown()) });

/** Step 2 of "Auto login": verify the device signature with the stored PUBLIC key, then start a session. */
export const POST = route({ auth: false }, async ({ req, ip }) => {
  await rateLimit(`passkey-verify:ip:${ip}`, 30, 15 * 60);
  const { response } = await parseBody(req, schema);
  const challenge = await consumeChallenge(req, "login");

  const credentialId = typeof response.id === "string" ? response.id : "";
  const pk = credentialId ? await Passkey.findOne({ credentialId }) : null;
  if (!pk) throw new ApiError(401, "This device is not registered for auto login. Please sign in manually.");

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: response as any,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpID(),
      requireUserVerification: true,
      credential: {
        id: pk.credentialId,
        publicKey: b64url.decode(pk.publicKey),
        counter: pk.counter ?? 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transports: (pk.transports ?? []) as any,
      },
    });
  } catch {
    throw new ApiError(401, "Device verification failed. Please sign in manually.");
  }
  if (!verification.verified) throw new ApiError(401, "Device verification failed. Please sign in manually.");

  const user = await User.findById(pk.userId).lean<UserDoc | null>();
  if (!user) throw new ApiError(401, "Account not found.");
  if (user.status !== "active") throw new ApiError(403, "This account has been disabled. Please contact support.");

  pk.counter = verification.authenticationInfo.newCounter;
  pk.lastUsedAt = new Date();
  await pk.save();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  const token = await createSession(String(user._id), ip, req.headers.get("user-agent") || "", { remember: true, method: "passkey" });
  await audit({ actor: user, action: "auth.login", resource: "user", resourceId: String(user._id), targetUserId: String(user._id), metadata: { method: "passkey", device: pk.deviceName }, ip });

  const res = NextResponse.json({
    success: true,
    message: "Signed in successfully.",
    data: { user: publicUser(user, effectivePermissions(user.role, user.permissions ?? [])) },
  });
  setSessionCookie(res, token, true);
  clearChallengeCookie(res);
  return res;
});
