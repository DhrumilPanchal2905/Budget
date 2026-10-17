// Outgoing email (OTP codes, password reset, welcome). Gmail SMTP with an App Password by default.
// The sender can be changed any time by an admin (Admin → Settings → Email) without a redeploy;
// environment variables are only the fallback.
import { getSetting, decryptSecret } from "./settings";
import { APP_URL } from "./env";

export interface MailSettings {
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  user: string;
  passEnc?: string;
  host: string;
  port: number;
  secure: boolean;
}

export interface ResolvedMail {
  source: "admin" | "env" | "none";
  fromName: string;
  fromEmail: string;
  user: string;
  pass: string | null;
  host: string;
  port: number;
  secure: boolean;
}

export const DEFAULT_SENDER = "dhrumilpanchal295@gmail.com";

export async function resolveMail(): Promise<ResolvedMail> {
  const db = await getSetting<MailSettings>("email").catch(() => null);
  const dbPass = db?.enabled && db.user && db.passEnc ? decryptSecret(db.passEnc) : null;
  if (db?.enabled && db.user && dbPass) {
    return { source: "admin", fromName: db.fromName || "Budget Pro", fromEmail: db.fromEmail || db.user, user: db.user, pass: dbPass, host: db.host || "smtp.gmail.com", port: db.port || 465, secure: db.secure ?? (db.port || 465) === 465 };
  }
  const user = process.env.SMTP_USER || DEFAULT_SENDER;
  const pass = process.env.SMTP_PASS || null;
  const port = Number(process.env.SMTP_PORT) || 465;
  return {
    source: pass ? "env" : "none",
    fromName: process.env.MAIL_FROM_NAME || "Budget Pro",
    fromEmail: process.env.MAIL_FROM || user,
    user,
    pass,
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
  };
}

export class MailNotConfigured extends Error {
  constructor() {
    super("Email sending is not set up yet. An admin must add the Gmail App Password in Admin → Settings → Email.");
  }
}

export async function sendMail(to: string, subject: string, html: string, text: string, override?: ResolvedMail): Promise<void> {
  const cfg = override ?? (await resolveMail());
  if (!cfg.pass) {
    if (process.env.NODE_ENV !== "production") {
      // Local development without SMTP: print the email so the OTP can still be used.
      console.info(`\n[mail:dev] To: ${to}\nSubject: ${subject}\n${text}\n`);
      return;
    }
    throw new MailNotConfigured();
  }
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transport.sendMail({ from: { name: cfg.fromName, address: cfg.fromEmail }, to, subject, html, text });
}

// ---------------- templates ----------------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0b0f;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e7e7ea">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#15151b;border:1px solid #26262e;border-radius:16px;padding:28px">
<tr><td style="font-size:18px;font-weight:700;color:#fff;padding-bottom:6px">💰 Budget Pro</td></tr>
<tr><td style="font-size:20px;font-weight:600;color:#fff;padding:10px 0">${esc(title)}</td></tr>
<tr><td style="font-size:14px;line-height:1.6;color:#b8b8c2">${body}</td></tr>
<tr><td style="padding-top:22px;font-size:12px;color:#7a7a85;border-top:1px solid #26262e">Budget Pro · <a href="${APP_URL}" style="color:#8ab4ff">${esc(APP_URL.replace(/^https?:\/\//, ""))}</a><br/>If you didn't request this, you can safely ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
}

export function otpEmail(code: string, purpose: "signup" | "reset", name?: string) {
  const hi = name ? `Hi ${esc(name.split(" ")[0])},` : "Hi,";
  const what = purpose === "signup" ? "verify your email and finish creating your account" : "reset your password";
  const title = purpose === "signup" ? "Your verification code" : "Your password reset code";
  const html = layout(
    title,
    `${hi}<br/><br/>Use this code to ${what}:<div style="margin:22px 0;font-size:34px;letter-spacing:10px;font-weight:700;color:#fff;background:#0b0b0f;border:1px solid #2f2f39;border-radius:12px;padding:16px;text-align:center">${code}</div>
It expires in <b>10 minutes</b>. Never share this code with anyone — Budget Pro will never ask for it.<br/><br/>
<span style="color:#8a8a95">यह कोड 10 मिनट में समाप्त हो जाएगा। · આ કોડ 10 મિનિટમાં સમાપ્ત થશે.</span>`,
  );
  const text = `${name ? `Hi ${name.split(" ")[0]},` : "Hi,"}\n\nYour Budget Pro code is ${code} — use it to ${what}. It expires in 10 minutes. Never share it.\n\n${APP_URL}`;
  return { subject: `${code} is your Budget Pro ${purpose === "signup" ? "verification" : "password reset"} code`, html, text };
}

export function testEmail() {
  return {
    subject: "Budget Pro — test email ✓",
    html: layout("Email is working", "This test message confirms that Budget Pro can send verification codes from this sender address."),
    text: "This test message confirms that Budget Pro can send verification codes from this sender address.",
  };
}
