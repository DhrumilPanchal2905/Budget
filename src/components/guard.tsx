"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { Permission } from "@/lib/permissions";
import { useSession } from "./session";
import { Button, Card } from "./ui";

/** UI-only guard (the API enforces the same permission server-side). */
export function RequirePerm({ perm, admin, children }: { perm?: Permission | Permission[]; admin?: boolean; children: ReactNode }) {
  const { can, isAdmin } = useSession();
  const perms = perm ? (Array.isArray(perm) ? perm : [perm]) : [];
  const allowed = (!admin || isAdmin) && perms.every((p) => can(p));
  if (allowed) return <>{children}</>;
  return (
    <Card className="mx-auto mt-10 max-w-md p-8 text-center">
      <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-warning" />
      <h2 className="text-base font-semibold">Access restricted</h2>
      <p className="mt-1 text-sm text-muted">You do not have permission to view this page. Contact an administrator if you need access.</p>
      <Link href="/dashboard">
        <Button variant="secondary" className="mt-5">
          Back to dashboard
        </Button>
      </Link>
    </Card>
  );
}
