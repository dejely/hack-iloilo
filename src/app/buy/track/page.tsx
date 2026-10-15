import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PublicHeader } from "@/components/public-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackOrder } from "@/modules/orders/components/track-order";

export const metadata: Metadata = { title: "Track a rice request" };

async function TrackLoader({
  searchParams,
}: {
  searchParams: PageProps<"/buy/track">["searchParams"];
}) {
  await connection();
  const { ref } = await searchParams;
  return <TrackOrder defaultRef={typeof ref === "string" ? ref : ""} />;
}

export default function TrackOrderPage({
  searchParams,
}: PageProps<"/buy/track">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-start gap-6 p-4 sm:justify-center">
      <PublicHeader back="/buy" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Track your rice request</CardTitle>
          <CardDescription>
            Check or cancel a rice request at the Iloilo Rice Processing
            Complex.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-64" />}>
            <TrackLoader searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
