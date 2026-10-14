"use client";

import { Suspense } from "react";
import { FinancePage } from "@/components/finance-page";
import { RequirePerm } from "@/components/guard";
import { Skeleton } from "@/components/ui";

export default function Page() {
  return (
    <RequirePerm perm={["finance.read", "goal.view"]}>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <FinancePage resource="goal" />
      </Suspense>
    </RequirePerm>
  );
}
