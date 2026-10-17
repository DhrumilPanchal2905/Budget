"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Eye, EyeOff, Fingerprint, KeyRound, MailCheck, ShieldCheck, UserRound } from "lucide-react";
import { api, ApiClientError } from "@/lib/client";
import { deviceLoginSupported, enableDeviceLogin, forgetDevice, getRememberedDevice, loginWithDevice, rememberDevice, type RememberedDevice } from "@/lib/device-login";
import { useToast } from "./toast";
import { Button, Field, Input } from "./ui";

type View = "loading" | "choose" | "form" | "offer" | "otp";

/** Wakes the server + database while the user is still typing, so the first sign-in is fast. */
export function useWarmup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void fetch("/api/health", { cache: "no-store" }).catch(() => null);
    }, 300);
    return () => clearTimeout(t);
  }, []);
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const sp = useSearchParams();
  const toast = useToast();
  const [view, setView] = useState<View>(mode === "login" ? "loading" : "form");
  const [device, setDevice] = useState<RememberedDevice | null>(null);
  const [supported, setSupported] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(sp.get("email") || "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(sp.get("expired") ? "Your session expired. Please sign in again." : null);
  const [loading, setLoading] = useState(false);
  const [signedInName, setSignedInName] = useState("");
  const [otp, setOtp] = useState("");
  const [resendIn, setResendIn] = useState(0);
  useWarmup();

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  const next = (() => {
    const n = sp.get("next") || "/dashboard";
    return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/dashboard";
  })();
  const target = mode === "register" ? "/dashboard" : next;
  // Full navigation so the new HttpOnly session cookie is used for the server-rendered app shell.
  const go = () => window.location.assign(target);

  useEffect(() => {
    let alive = true;
    void deviceLoginSupported().then((ok) => {
      if (!alive) return;
      setSupported(ok);
      if (mode !== "login") return;
      const d = getRememberedDevice();
      setDevice(d);
      if (d) setEmail(d.email);
      // Returning user on a device with auto login → ask: Auto or Manual.
      setView(d?.passkey && ok ? "choose" : "form");
    });
    return () => {
      alive = false;
    };
  }, [mode]);

  // ---------- Auto login (device lock) ----------
  const autoLogin = async () => {
    if (!device || loading) return;
    setLoading(true);
    setFormError(null);
    try {
      const user = await loginWithDevice(device.email);
      rememberDevice({ email: user.email, name: user.name, passkey: true });
      toast.success(`Welcome back, ${user.name.split(" ")[0]}!`);
      go();
    } catch (e) {
      setFormError((e as Error).message);
      setLoading(false);
    }
  };

  // ---------- Manual login / register ----------
  const submit = async () => {
    if (loading) return;
    const errs: Record<string, string> = {};
    if (mode === "register" && name.trim().length < 2) errs.name = "Name must be at least 2 characters.";
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = "Enter a valid email address.";
    if (mode === "register" && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) errs.password = "Use 8+ characters with a letter and a number.";
    if (mode === "login" && !password) errs.password = "Password is required.";
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const r = await api<{ user?: { email: string; name: string }; otpRequired?: boolean; resendIn?: number }>(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: mode === "login" ? { email, password, remember } : { name, email, password },
      });
      if (r.data.otpRequired) {
        toast.success(r.message || "We emailed you a 6-digit code.");
        setOtp("");
        setResendIn(r.data.resendIn ?? 60);
        setLoading(false);
        setView("otp");
        return;
      }
      await afterAuth(r.data.user!, r.message);
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      setFormError(err.message);
      setLoading(false);
    }
  };

  // ---------- Sign-up step 2: email code ----------
  const verifyOtp = async () => {
    if (loading) return;
    if (!/^\d{6}$/.test(otp)) {
      setErrors({ otp: "Enter the 6-digit code from the email." });
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const r = await api<{ user: { email: string; name: string } }>("/api/auth/register/verify", { method: "POST", body: { email, otp } });
      await afterAuth(r.data.user, r.message);
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      setFormError(err.message);
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0 || loading) return;
    setFormError(null);
    try {
      const r = await api<{ resendIn: number }>("/api/auth/register/resend", { method: "POST", body: { email } });
      setResendIn(r.data.resendIn ?? 60);
      toast.success(r.message || "A new code was sent.");
    } catch (e) {
      setFormError((e as Error).message);
    }
  };

  const afterAuth = async (u: { email: string; name: string }, message?: string) => {
      const keep = mode === "register" || remember;
      const alreadyHasPasskey = Boolean(device?.passkey && device.email === u.email);
      if (keep) rememberDevice({ email: u.email, name: u.name, passkey: alreadyHasPasskey });
      else forgetDevice();
      toast.success(message || (mode === "login" ? "Signed in successfully." : "Account created successfully."));

      // Offer auto login on this device (only when remembered and the device supports it).
      if (keep && supported && !alreadyHasPasskey) {
        setSignedInName(u.name);
        setEmail(u.email);
        setLoading(false);
        setView("offer");
        return;
      }
      go();
  };

  const enableAuto = async () => {
    setLoading(true);
    setFormError(null);
    try {
      await enableDeviceLogin();
      rememberDevice({ email, name: signedInName, passkey: true });
      toast.success("Auto login enabled on this device.");
      go();
    } catch (e) {
      setFormError((e as Error).message);
      setLoading(false);
    }
  };

  // ---------- Views ----------
  if (view === "loading") return <div className="h-48 animate-pulse rounded-xl bg-surface-2" />;

  if (view === "offer") {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
          <Fingerprint className="h-7 w-7" />
        </span>
        <div>
          <p className="text-base font-semibold">Enable auto login on this device?</p>
          <p className="mt-1 text-sm text-muted">Next time, sign in with your fingerprint, face or device PIN — no password needed. Your password is never stored on the device.</p>
        </div>
        {formError && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{formError}</p>}
        <Button className="w-full" size="lg" onClick={enableAuto} loading={loading}>
          <Fingerprint className="h-4 w-4" /> Enable auto login
        </Button>
        <Button className="w-full" variant="ghost" onClick={go} disabled={loading}>
          Not now
        </Button>
      </div>
    );
  }

  if (view === "otp") {
    return (
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void verifyOtp();
        }}
      >
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="mt-3 text-base font-semibold">Check your email</p>
          <p className="mt-1 text-sm text-muted">
            We sent a 6-digit code to <span className="font-medium text-fg">{email}</span>. It expires in 10 minutes.
          </p>
        </div>
        <Field label="Verification code" error={errors.otp} htmlFor="otp">
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            invalid={Boolean(errors.otp)}
            className="text-center text-2xl font-semibold tracking-[0.5em]"
            placeholder="••••••"
          />
        </Field>
        {formError && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{formError}</p>}
        <Button type="submit" className="w-full" size="lg" loading={loading} disabled={otp.length !== 6}>
          Verify & create account
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="flex items-center gap-1 text-muted hover:text-fg"
            onClick={() => {
              setView("form");
              setFormError(null);
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Change email
          </button>
          <button type="button" onClick={resend} disabled={resendIn > 0} className="font-medium text-primary disabled:text-muted">
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
        </div>
        <p className="text-center text-[11px] text-muted">Didn&apos;t get it? Check Spam / Promotions.</p>
      </form>
    );
  }

  if (view === "choose" && device) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{device.name || "Welcome back"}</p>
            <p className="truncate text-xs text-muted">{device.email}</p>
          </div>
        </div>
        <p className="text-center text-sm text-muted">How would you like to sign in?</p>
        <Button className="w-full" size="lg" onClick={autoLogin} loading={loading}>
          {!loading && <Fingerprint className="h-4 w-4" />} Auto login (device lock)
        </Button>
        <Button
          className="w-full"
          size="lg"
          variant="secondary"
          disabled={loading}
          onClick={() => {
            setFormError(null);
            setView("form");
          }}
        >
          <KeyRound className="h-4 w-4" /> Manual login (password)
        </Button>
        {formError && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{formError}</p>}
        <button
          type="button"
          className="w-full text-center text-xs text-muted hover:text-fg"
          onClick={() => {
            forgetDevice();
            setDevice(null);
            setEmail("");
            setFormError(null);
            setView("form");
          }}
        >
          Not you? Use another account
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {mode === "register" && (
        <Field label="Full name" error={errors.name} htmlFor="name">
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} invalid={Boolean(errors.name)} maxLength={80} />
        </Field>
      )}
      <Field label="Email" error={errors.email} htmlFor="email">
        <Input id="email" type="email" autoComplete={mode === "login" ? "username" : "email"} value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(errors.email)} maxLength={254} />
      </Field>
      <Field label="Password" error={errors.password} htmlFor="password" hint={mode === "register" ? "At least 8 characters, with a letter and a number." : undefined}>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={Boolean(errors.password)}
            className="pr-10"
            maxLength={128}
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>

      {mode === "login" && (
        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
            Remember me
          </label>
          <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
      )}

      {formError && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{formError}</p>}
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        {mode === "login" ? "Sign in" : "Continue — verify email"}
      </Button>
      <p className="flex items-center justify-center gap-1 text-[11px] text-muted" title="Session is kept in a secure HttpOnly cookie and every request is end-to-end encrypted.">
        <ShieldCheck className="h-3.5 w-3.5" /> Encrypted connection · secure session
      </p>

      {mode === "login" && device?.passkey && supported && (
        <Button type="button" variant="secondary" className="w-full" onClick={() => setView("choose")} disabled={loading}>
          <Fingerprint className="h-4 w-4" /> Use auto login instead
        </Button>
      )}

      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            New to Budget Pro?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glow pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">Budget Pro</span>
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-7">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
