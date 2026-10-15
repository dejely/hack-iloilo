import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleGate } from "@/modules/accounts/components/role-gate";
import { PrescriptionList } from "@/modules/prescriptions/components/prescription-list";
import { prescriptions } from "@/modules/prescriptions/queries";

export const metadata: Metadata = { title: "Suggestions" };

async function Suggestions() {
  const list = await prescriptions();
  if (!list.some((p) => !p.decision))
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing to act on</EmptyTitle>
          <EmptyDescription>
            Suggestions show up when a day overloads or goes idle.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <PrescriptionList
      prescriptions={list}
      className="md:grid-cols-2 xl:grid-cols-3"
    />
  );
}

export default function SuggestionsPage() {
  return (
    <RoleGate role="manager">
      <section className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Suggestions</h1>
          <p className="text-sm text-muted-foreground">
            Actions for the next three weeks
          </p>
        </header>
        <Suspense fallback={<Skeleton className="h-64" />}>
          <Suggestions />
        </Suspense>
      </section>
    </RoleGate>
  );
}
