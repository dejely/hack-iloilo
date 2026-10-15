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
import { WebBookingForm } from "@/modules/booking/components/web-booking-form";

export const metadata: Metadata = { title: "Book a slot" };

async function BookingFormLoader() {
  await connection();
  return <WebBookingForm today={todayManila()} />;
}

/** Booking lookup; `ref` prefills the code from a shared link. */
async function TrackLoader({
  searchParams,
}: {
  searchParams: PageProps<"/book">["searchParams"];
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

export default function BookPage({ searchParams }: PageProps<"/book">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-start gap-6 p-4">
      <PublicHeader back="/" subtitle="Iloilo Rice Processing Complex" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Book drying or milling</CardTitle>
          <CardDescription>
            Your booking is confirmed right away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96" />}>
            <BookingFormLoader />
          </Suspense>
        </CardContent>
      </Card>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Track a booking</CardTitle>
          <CardDescription>
            Check your place in line, move or cancel.
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
