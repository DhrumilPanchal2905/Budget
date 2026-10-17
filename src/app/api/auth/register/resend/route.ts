import { route, parseBody, ok } from "@/lib/api";
import { emailOnlySchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { EmailOtp } from "@/lib/models";
import { ApiError } from "@/lib/errors";
import { issueOtp } from "@/lib/otp";
import { mailError } from "@/lib/signup";

export const runtime = "nodejs";

export const POST = route({ auth: false }, async ({ req, ip }) => {
  await rateLimit(`register-resend:ip:${ip}`, 10, 60 * 60);
  const { email } = await parseBody(req, emailOnlySchema);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending: any = await EmailOtp.findOne({ email, purpose: "signup" }).lean();
  if (!pending) throw new ApiError(400, "Your sign-up has expired. Please fill in the form again.");
  try {
    const r = await issueOtp(email, "signup", { name: String(pending.payload?.name ?? ""), resend: true });
    return ok({ resendIn: r.resendIn }, `A new code was sent to ${email}.`);
  } catch (err) {
    mailError(err);
  }
});
