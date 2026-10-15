import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronDown } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { todayManila } from "@/lib/dates";
import { municipalities } from "@/modules/accounts/queries";
import { WebOfferForm } from "@/modules/buying/components/web-offer-form";
import type { BuyRules } from "@/modules/pricing/logic";
import { QuoteCalculator } from "@/modules/pricing/components/quote-calculator";
import { priceOn } from "@/modules/pricing/queries";
import { listVarieties } from "@/modules/setup/queries";

export const metadata: Metadata = { title: "Sell palay" };

async function Quote() {
  // Prices are read fresh per request; defer past the prerendered shell.
  await connection();
  let priceRule;
  try {
    const prices = await priceOn(todayManila());
    priceRule = {
      buy_base_minor_per_kg: prices.buy_base_minor_per_kg,
      buy_reference_mc: prices.buy_reference_mc,
      buy_rules: prices.buy_rules as BuyRules,
    };
  } catch {
    return (
      <p className="text-sm text-muted-foreground">
        Prices are not set yet. Please check again later.
      </p>
    );
  }
  return <QuoteCalculator priceRule={priceRule} />;
}

async function OfferFormLoader() {
  await connection();
  const [places, varieties] = await Promise.all([
    municipalities(),
    listVarieties(),
  ]);
  return (
    <WebOfferForm
      today={todayManila()}
      municipalities={places}
      varieties={varieties.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
      }))}
    />
  );
}

export default function SellPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-start gap-6 p-4">
      <PublicHeader back="/" subtitle="Iloilo Rice Processing Complex" />
      {/* Closed by default: most sellers come to offer, the quote is optional. */}
      <Collapsible className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CollapsibleTrigger className="group/quote flex w-full items-center justify-between gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <CardTitle>Get a quote</CardTitle>
              <ChevronDown
                aria-hidden
                className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/quote:rotate-180"
              />
            </CollapsibleTrigger>
            <CardDescription>
              Estimate today&apos;s price from your palay&apos;s moisture.
            </CardDescription>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-48" />}>
                <Quote />
              </Suspense>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Offer to sell palay</CardTitle>
          <CardDescription>
            The manager reviews your offer and we text you the decision.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96" />}>
            <OfferFormLoader />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
