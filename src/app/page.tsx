import {
  ArrowRight,
  LogIn,
  MessageSquareText,
  ShoppingBasket,
  Wheat,
  Wind,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { todayManila } from "@/lib/dates";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { priceOn } from "@/modules/pricing/queries";

export const metadata: Metadata = {
  title: { absolute: "SACKTO · Iloilo Rice Processing Complex" },
};

const SMS_COMMANDS = [
  { text: "BOOK DRY 1000 20/10", does: "Book drying for 1,000 kg on Oct 20" },
  { text: "BOOK MILL 500 22/10", does: "Book milling instead" },
  { text: "STATUS", does: "Your place in today's line" },
  { text: "PRICE", does: "Today's buying price and fees" },
  { text: "QUOTE 14% 1000", does: "Price for 1,000 kg at 14% moisture" },
  { text: "SELL 1000 RC222 20/10", does: "Offer 1,000 kg of RC222 on Oct 20" },
  { text: "VARIETIES", does: "Variety codes we buy" },
  { text: "CANCEL ABC123", does: "Cancel a booking by its code" },
];

/** Today's public prices; hidden if none are set. */
async function TodayPrices() {
  await connection();
  const prices = await priceOn(todayManila()).catch(() => null);
  if (!prices) return null;

  const rows = [
    {
      label: `Palay buying price (${prices.buy_reference_mc}% MC)`,
      value: prices.buy_base_minor_per_kg,
    },
    { label: "Drying fee", value: prices.drying_fee_minor_per_kg },
    { label: "Milling fee", value: prices.milling_fee_minor_per_kg },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s prices</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(row.value)}/kg
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** The gateway number, read at request time. */
async function GatewayNumber() {
  await connection();
  const number = env().SMS_GATEWAY_PHONE_NUMBER;
  if (!number) return <>the IRPC number</>;
  return (
    <a href={`sms:${number}`} className="font-semibold text-primary underline">
      {number}
    </a>
  );
}

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4 pb-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="SACKTO home" className="rounded-md">
          <Wordmark aria-hidden className="h-7 w-auto text-primary" />
        </Link>
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>
          <LogIn data-icon="inline-start" />
          Staff sign in
        </Link>
      </header>

      <section className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-bold">
          Iloilo Rice Processing Complex
        </h1>
        <p className="text-muted-foreground">
          Dry, mill or sell your palay at IRPC. Book or sell here, or send us a
          text if you have no data.
        </p>
      </section>

      <nav className="flex flex-col gap-3" aria-label="What do you need?">
        <Link
          href="/book"
          className="flex items-center gap-4 rounded-xl bg-primary p-4 text-primary-foreground"
        >
          <Wind className="size-8 shrink-0" aria-hidden />
          <span className="flex flex-1 flex-col">
            <span className="text-lg font-semibold">
              Book drying or milling
            </span>
            <span className="text-sm opacity-90">
              Pick a day. Confirmed right away.
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0" aria-hidden />
        </Link>

        <Link
          href="/sell"
          className="flex items-center gap-4 rounded-xl border p-4"
        >
          <Wheat className="size-8 shrink-0 text-primary" aria-hidden />
          <span className="flex flex-1 flex-col">
            <span className="text-lg font-semibold">Sell palay</span>
            <span className="text-sm text-muted-foreground">
              Get a quote, then offer your harvest.
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0" aria-hidden />
        </Link>

        <Link
          href="/buy"
          className="flex items-center gap-4 rounded-xl border p-4"
        >
          <ShoppingBasket
            className="size-8 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="flex flex-1 flex-col">
            <span className="text-lg font-semibold">Buy rice</span>
            <span className="text-sm text-muted-foreground">
              Today&apos;s price and where your rice came from.
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0" aria-hidden />
        </Link>
      </nav>

      <Suspense fallback={<Skeleton className="h-40" />}>
        <TodayPrices />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="size-5" aria-hidden />
            No data? Text us
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p>
            Send a text to{" "}
            <Suspense fallback="the IRPC number">
              <GatewayNumber />
            </Suspense>
            . Any phone works.
          </p>
          <ul className="flex flex-col gap-2">
            {SMS_COMMANDS.map((cmd) => (
              <li key={cmd.text} className="flex flex-col">
                <code className="font-mono font-semibold">{cmd.text}</code>
                <span className="text-sm text-muted-foreground">
                  {cmd.does}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
