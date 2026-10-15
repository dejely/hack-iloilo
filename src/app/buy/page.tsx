import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { todayManila } from "@/lib/dates";
import { env } from "@/lib/env";
import { formatDate, formatKg, formatMoney } from "@/lib/format";
import { normalizeBatchNo } from "@/modules/gate/logic";
import { publicBatchTrail } from "@/modules/gate/queries";
import { WebOrderForm } from "@/modules/orders/components/web-order-form";
import { freeKg } from "@/modules/orders/logic";
import { orderStock } from "@/modules/orders/queries";
import { priceOn } from "@/modules/pricing/queries";

export const metadata: Metadata = { title: "Buy rice" };

// Shared by the price card and the request form, so one view reads it once.
const todaysPrices = cache(() => priceOn(todayManila()).catch(() => null));

/**
 * Rice buyers can still ask for: on hand minus what accepted requests already
 * hold, never below 0. Null when stock can't be read, so only the figure hides.
 */
async function freeRiceKg(): Promise<number | null> {
  try {
    const { onHandKg, acceptedKg } = await orderStock();
    return Math.max(0, freeKg(onHandKg, acceptedKg));
  } catch (error) {
    console.error("Unable to read rice stock", error);
    return null;
  }
}

/** Today's rice price and free rice; read fresh per request. */
async function RiceToday() {
  await connection();
  const [prices, stockKg] = await Promise.all([todaysPrices(), freeRiceKg()]);
  const number = env().SMS_GATEWAY_PHONE_NUMBER;

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y">
        <div className="flex justify-between gap-4 py-2">
          <dt className="text-muted-foreground">Rice price</dt>
          <dd className="font-semibold tabular-nums">
            {prices
              ? `${formatMoney(prices.rice_minor_per_kg)}/kg`
              : "Not set yet"}
          </dd>
        </div>
        <div className="flex justify-between gap-4 py-2">
          <dt className="text-muted-foreground">Rice available</dt>
          <dd className="font-semibold tabular-nums">
            {stockKg === null
              ? "Ask at the plant"
              : stockKg > 0
                ? formatKg(stockKg)
                : "None available today"}
          </dd>
        </div>
      </dl>
      <p>
        Buy at the plant. You&apos;ll get your receipt and batch no. by text.
      </p>
      <p className="text-sm text-muted-foreground">
        No data? Text PRICE to{" "}
        {number ? (
          <a
            href={`sms:${number}`}
            className="font-semibold text-primary underline"
          >
            {number}
          </a>
        ) : (
          "the IRPC number"
        )}
        .
      </p>
    </div>
  );
}

/** The request form, with today's rice price for its estimate. */
async function RequestForm() {
  await connection();
  const prices = await todaysPrices();
  return (
    <WebOrderForm
      today={todayManila()}
      riceMinorPerKg={prices?.rice_minor_per_kg ?? null}
    />
  );
}

/** Batch lookup: a plain GET form, so the result URL can be shared. */
async function Trace({
  searchParams,
}: {
  searchParams: PageProps<"/buy">["searchParams"];
}) {
  await connection();
  const { batch } = await searchParams;
  const input = typeof batch === "string" ? batch : "";
  const batchNo = normalizeBatchNo(input);
  const trail = batchNo ? await publicBatchTrail(batchNo) : null;

  return (
    <div className="flex flex-col gap-4">
      <form action="/buy" className="flex gap-2">
        <Input
          name="batch"
          defaultValue={input}
          placeholder="261015-007"
          aria-label="Batch no."
          inputMode="numeric"
          required
        />
        <Button type="submit">Trace</Button>
      </form>
      {batchNo &&
        (trail ? (
          <div className="flex flex-col gap-2">
            <p className="font-semibold">
              Batch {trail.batchNo}
              {trail.variety ? ` · ${trail.variety}` : ""}
            </p>
            <p className="text-muted-foreground">
              {trail.origin ? `From ${trail.origin}` : "Origin not recorded"}
            </p>
            <dl className="divide-y">
              {trail.steps.map((step) => (
                <div
                  key={step.label}
                  className="flex justify-between gap-4 py-2"
                >
                  <dt className="text-muted-foreground">{step.label}</dt>
                  <dd className="tabular-nums">{formatDate(step.date)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No batch found.</p>
        ))}
    </div>
  );
}

export default function BuyPage({ searchParams }: PageProps<"/buy">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-start gap-6 p-4">
      <div className="flex flex-col items-center gap-1">
        <Wordmark className="h-8 w-auto text-primary" />
        <p className="text-sm text-muted-foreground">
          Iloilo Rice Processing Complex
        </p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Buy rice</CardTitle>
          <CardDescription>
            Today&apos;s price and rice available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-40" />}>
            <RiceToday />
          </Suspense>
        </CardContent>
      </Card>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Request rice</CardTitle>
          <CardDescription>
            Ask ahead for a pickup day. The manager confirms by text.{" "}
            <Link
              href="/buy/track"
              className="font-semibold text-primary underline"
            >
              Track a request
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96" />}>
            <RequestForm />
          </Suspense>
        </CardContent>
      </Card>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Where your rice came from</CardTitle>
          <CardDescription>
            Enter the batch no. from your receipt text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-24" />}>
            <Trace searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
