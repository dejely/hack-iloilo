import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { todayManila } from "@/lib/dates";
import { RoleGate } from "@/modules/accounts/components/role-gate";
import {
  PriceForm,
  type PriceFormDefaults,
} from "@/modules/pricing/components/price-form";
import {
  PricesView,
  PriceTrend,
} from "@/modules/pricing/components/prices-view";
import { type BuyRules, livePrice } from "@/modules/pricing/logic";
import { listPrices } from "@/modules/pricing/queries";

export const metadata: Metadata = { title: "Prices" };

const peso = (minor: number) => (minor / 100).toFixed(2);

async function SetPrices() {
  const today = todayManila();
  const prices = await listPrices();
  const live = livePrice(prices, today);
  const rules = live?.buy_rules as BuyRules | undefined;

  // Prefill from the live row; otherwise the TRD defaults (fees, deductions).
  const defaults: PriceFormDefaults = {
    effectiveDate: today,
    buyBase: live ? peso(live.buy_base_minor_per_kg) : "",
    damaged: String(rules?.damaged ?? 0.25),
    immature: String(rules?.immature ?? 0.1),
    foreign: String(rules?.foreign ?? 1),
    rice: live ? peso(live.rice_minor_per_kg) : "",
    drying: live ? peso(live.drying_fee_minor_per_kg) : "1.60",
    milling: live ? peso(live.milling_fee_minor_per_kg) : "3.30",
  };

  return <PriceForm defaults={defaults} />;
}

export default function PricesPage() {
  return (
    <RoleGate role="manager">
      {/* The page fills the viewport below the app header; only the history scrolls. */}
      <section className="flex min-w-0 flex-col gap-6 lg:h-[calc(100svh-5rem)]">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Prices</h1>
          <p className="text-sm text-muted-foreground">
            Palay buying, service fee and rice prices by effective date
          </p>
        </header>

        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[400px_1fr]">
          <Card className="lg:min-h-0 lg:overflow-y-auto">
            <CardHeader>
              <CardTitle>Set prices</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-96" />}>
                <SetPrices />
              </Suspense>
            </CardContent>
          </Card>

          <div className="flex min-h-0 min-w-0 flex-col gap-6">
            <Card className="shrink-0">
              <CardHeader>
                <CardTitle>Trend</CardTitle>
                <CardDescription>Latest 12 effective dates</CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <Suspense fallback={<Skeleton className="h-full" />}>
                  <PriceTrend />
                </Suspense>
              </CardContent>
            </Card>

            <Card className="min-h-80 lg:min-h-0 lg:flex-1">
              <CardHeader>
                <CardTitle>History</CardTitle>
                <CardDescription>Every save, newest first</CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 [&_[data-slot=table-container]]:h-full [&_[data-slot=table-container]]:overflow-auto">
                <Suspense fallback={<Skeleton className="h-96" />}>
                  <PricesView />
                </Suspense>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
