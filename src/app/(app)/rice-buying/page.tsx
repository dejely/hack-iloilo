import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { OrdersView } from "@/modules/orders/components/orders-view";

export const metadata: Metadata = { title: "Rice Buying" };

export default function RiceBuyingPage({
  searchParams,
}: PageProps<"/rice-buying">) {
  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Rice Buying</h1>
        <p className="text-sm text-muted-foreground">
          Rice requests by pickup date · managers accept or decline
        </p>
      </header>

      <Suspense fallback={<Skeleton className="h-96" />}>
        <OrdersView searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
