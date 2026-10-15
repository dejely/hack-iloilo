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
import { todayManila } from "@/lib/dates";
import { TrackBooking } from "@/modules/booking/components/track-booking";

export const metadata: Metadata = { title: "Track a booking" };

async function TrackLoader({
  searchParams,
}: {
  searchParams: PageProps<"/book/track">["searchParams"];
}) {
  await connection();
  const { ref } = await searchParams;
  return (
    <TrackBooking
      defaultRef={typeof ref === "string" ? ref : ""}
      today={todayManila()}
    />
  );
}

export default function TrackPage({ searchParams }: PageProps<"/book/track">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-start gap-6 p-4 sm:justify-center">
      <PublicHeader back="/book" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Track your booking</CardTitle>
          <CardDescription>
            Check, move or cancel a drying or milling booking at the Iloilo Rice
            Processing Complex.
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
