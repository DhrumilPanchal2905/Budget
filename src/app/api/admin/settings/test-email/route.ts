import { route, ok, parseBody } from "@/lib/api";
import { testEmailSchema } from "@/lib/validation";
import { sendMail, testEmail } from "@/lib/mailer";
import { mailError } from "@/lib/signup";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export const POST = route({ admin: true, perms: ["database.view"] }, async ({ req, user }) => {
  await rateLimit(`test-email:${user._id}`, 10, 60 * 60);
  const { to } = await parseBody(req, testEmailSchema);
  const m = testEmail();
  try {
    await sendMail(to, m.subject, m.html, m.text);
  } catch (err) {
    mailError(err);
  }
  return ok({ sent: true }, `Test email sent to ${to}.`);
});
