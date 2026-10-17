"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, MailCheck } from "lucide-react";
import { api, ApiClientError } from "@/lib/client";
import { useToast } from "./toast";
import { useWarmup } from "./auth-form";
import { Button, Field, Input } from "./ui";

export function ForgotPasswordForm() {
  const sp = useSearchParams();
  const toast = useToast();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState(sp.get("email") || "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  useWarmup();

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErrors({ email: "Enter a valid email address." });
    setErrors({});
    setError(null);
    setLoading(true);
    try {
      const r = await api("/api/auth/password/forgot", { method: "POST", body: { email } });
      toast.success(r.message || "Code sent.");
      setResendIn(60);
      setStep("reset");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    const errs: Record<string, string> = {};
    if (!/^\d{6}$/.test(otp)) errs.otp = "Enter the 6-digit code.";
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) errs.newPassword = "Use 8+ characters with a letter and a number.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setError(null);
    setLoading(true);
    try {
      const r = await api("/api/auth/password/reset", { method: "POST", body: { email, otp, newPassword: password } });
      toast.success(r.message || "Password updated.");
      window.location.assign(`/login?email=${encodeURIComponent(email)}`);
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void (step === "email" ? send() : reset());
      }}
    >
      {step === "email" ? (
        <Field label="Email" error={errors.email} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(errors.email)} maxLength={254} autoFocus />
        </Field>
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/60 p-3 text-sm text-muted">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> If an account exists for <b className="text-fg">{email}</b>, a code is on its way. It expires in 10 minutes.
          </p>
          <Field label="6-digit code" error={errors.otp} htmlFor="otp">
            <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} invalid={Boolean(errors.otp)} className="text-center text-xl font-semibold tracking-[0.4em]" autoFocus />
          </Field>
          <Field label="New password" error={errors.newPassword} htmlFor="np" hint="At least 8 characters, with a letter and a number.">
            <div className="relative">
              <Input id="np" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={Boolean(errors.newPassword)} className="pr-10" maxLength={128} />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg" aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        </>
      )}
      {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        {step === "email" ? "Send code" : "Set new password"}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Link href="/login" className="flex items-center gap-1 text-muted hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
        {step === "reset" && (
          <button type="button" disabled={resendIn > 0 || loading} onClick={send} className="font-medium text-primary disabled:text-muted">
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
        )}
      </div>
    </form>
  );
}
