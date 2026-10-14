import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { publicUser, resolveSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/env";
import { SessionProvider, RealtimeProvider } from "@/components/session";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await connectDB();
  const state = await resolveSession(token);
  if (!state) redirect("/api/auth/logout?reason=expired");

  return (
    <SessionProvider initialUser={JSON.parse(JSON.stringify(publicUser(state.user, state.perms)))}>
      <RealtimeProvider>
        <AppShell>{children}</AppShell>
      </RealtimeProvider>
    </SessionProvider>
  );
}
