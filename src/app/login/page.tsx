import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm, AuthShell } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in", description: "Sign in to your Budget Pro account." };

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to your dashboard.">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
