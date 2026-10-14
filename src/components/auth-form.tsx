"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api, ApiClientError } from "@/lib/client";
import { useToast } from "./toast";
import { Button, Field, Input } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const sp = useSearchParams();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(sp.get("expired") ? "Your session expired. Please sign in again." : null);
  const [loading, setLoading] = useState(false);

  const next = (() => {
    const n = sp.get("next") || "/dashboard";
    return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/dashboard";
  })();

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
      const r = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: mode === "login" ? { email, password } : { name, email, password },
      });
      toast.success(r.message || (mode === "login" ? "Signed in successfully." : "Account created successfully."));
      // Full navigation so the new HttpOnly session cookie is used for the server-rendered app shell.
      window.location.assign(mode === "register" ? "/dashboard" : next);
    } catch (e) {
      const err = e as ApiClientError;
      if (err.errors) setErrors(err.errors);
      setFormError(err.message);
      setLoading(false);
    }
  };

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
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(errors.email)} maxLength={254} />
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
      {formError && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{formError}</p>}
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
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
