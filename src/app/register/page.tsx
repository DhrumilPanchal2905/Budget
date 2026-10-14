import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm, AuthShell } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create account", description: "Create your free Budget Pro account." };

export default function RegisterPage() {
  return (
    <AuthShell title="Create your account" subtitle="Free forever plan. No card required.">
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </AuthShell>
  );
}
