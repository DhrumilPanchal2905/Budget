import { route, parseBody, ok } from "@/lib/api";
import { emailOnlySchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { User } from "@/lib/models";
import { issueOtp } from "@/lib/otp";

export const runtime = "nodejs";

/** Forgot password → email a reset code. The answer is the same whether or not the account exists (no account probing). */
export const POST = route({ auth: false }, async ({ req, ip }) => {
  await rateLimit(`forgot:ip:${ip}`, 10, 60 * 60);
  const { email } = await parseBody(req, emailOnlySchema);
  await rateLimit(`forgot:email:${email}`, 5, 60 * 60);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user: any = await User.findOne({ email }).select("name status").lean();
  if (user && user.status === "active") {
    try {
      await issueOtp(email, "reset", { name: user.name, resend: false });
    } catch (err) {
      // Same answer either way, so nobody can find out which emails have accounts.
      console.error("[forgot] could not send reset code:", (err as Error)?.message);
    }
  }
  return ok({ sent: true }, "If an account exists for this email, a 6-digit reset code has been sent.");
});
