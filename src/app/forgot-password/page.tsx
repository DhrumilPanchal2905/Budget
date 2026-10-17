import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-form";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = { title: "Reset password", description: "Reset your Budget Pro password with a code sent to your email.", robots: { index: false, follow: true } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a 6-digit code.">
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
