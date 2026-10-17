import { ApiError } from "./errors";
import { MailNotConfigured } from "./mailer";

/** Turns email-sending failures into clear, safe API errors (details only in the server log). */
export function mailError(err: unknown): never {
  if (err instanceof ApiError) throw err;
  if (err instanceof MailNotConfigured) throw new ApiError(503, err.message);
  console.error("[mail] send failed:", (err as Error)?.message);
  throw new ApiError(502, "We couldn't send the email right now. Please try again in a minute.");
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
