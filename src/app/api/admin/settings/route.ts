import { route, ok, parseBody } from "@/lib/api";
import { emailSettingsSchema } from "@/lib/validation";
import { getSetting, setSetting, encryptSecret } from "@/lib/settings";
import { resolveMail, type MailSettings } from "@/lib/mailer";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";

async function view() {
  const [db, eff] = await Promise.all([getSetting<MailSettings>("email"), resolveMail()]);
  return {
    email: {
      // what is actually used right now
      active: { source: eff.source, fromName: eff.fromName, fromEmail: eff.fromEmail, user: eff.user, host: eff.host, port: eff.port, ready: Boolean(eff.pass) },
      // what is saved in Admin → Settings (password never returned)
      saved: db ? { enabled: db.enabled, fromName: db.fromName, fromEmail: db.fromEmail, user: db.user, host: db.host, port: db.port, secure: db.secure, hasPassword: Boolean(db.passEnc) } : null,
      envFallback: { user: process.env.SMTP_USER || null, hasPassword: Boolean(process.env.SMTP_PASS) },
    },
    security: { encryptedApi: true, requireEncryption: process.env.REQUIRE_ENCRYPTED_API === "true" },
  };
}

export const GET = route({ admin: true, perms: ["database.view"] }, async () => ok(await view()));

/** Change the email sender (e.g. a new Gmail address + App Password) — takes effect immediately, no redeploy. */
export const PUT = route({ admin: true, perms: ["database.view", "database.delete"] }, async ({ req, user, ip }) => {
  const body = await parseBody(req, emailSettingsSchema);
  const prev = await getSetting<MailSettings>("email");
  const passEnc = body.password ? encryptSecret(body.password.replace(/\s+/g, "")) : prev?.passEnc;
  if (body.enabled && !passEnc) throw new ApiError(400, "Enter the App Password for this email account.", { password: "App Password is required." });
  const value: MailSettings = { enabled: body.enabled, fromName: body.fromName, fromEmail: body.fromEmail, user: body.user, passEnc, host: body.host, port: body.port, secure: body.secure ?? body.port === 465 };
  await setSetting("email", value, user._id);
  await audit({ actor: user, action: "admin.settings.email", resource: "settings", metadata: { fromEmail: body.fromEmail, user: body.user, host: body.host, passwordChanged: Boolean(body.password) }, ip });
  return ok(await view(), "Email settings saved.");
});
