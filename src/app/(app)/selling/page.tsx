import type { Metadata } from "next";
import { Calculator } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { ToolDialog } from "@/components/tool-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { todayManila } from "@/lib/dates";
import { clientsDirectory } from "@/modules/accounts/queries";
import { BudgetButton } from "@/modules/buying/components/budget-button";
import { NewOfferSheet } from "@/modules/buying/components/new-offer-sheet";
import { OffersView } from "@/modules/buying/components/offers-view";
import type { BuyRules } from "@/modules/pricing/logic";
import { QuoteCalculator } from "@/modules/pricing/components/quote-calculator";
import { priceOn } from "@/modules/pricing/queries";
import { listVarieties } from "@/modules/setup/queries";

export const metadata: Metadata = { title: "Selling" };

async function NewOffer() {
  // Reference data read fresh per request; defer past the prerendered shell.
  await connection();
  const [clients, varieties] = await Promise.all([
    clientsDirectory(),
    listVarieties(),
  ]);
  return (
    <NewOfferSheet
      clients={clients
        .map((c) => ({ id: c.id, name: c.name, phone: c.phone }))
        .sort((a, b) => a.name.localeCompare(b.name))}
      varieties={varieties.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
      }))}
    />
  );
}

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
        No prices set yet. A manager sets them on the Prices page.
      </p>
    );
  }
  return <QuoteCalculator priceRule={priceRule} />;
}

export default function SellingPage({ searchParams }: PageProps<"/selling">) {
  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Selling</h1>
          <p className="text-sm text-muted-foreground">
            Offers by harvest date · managers accept or decline
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Suspense fallback={<Skeleton className="h-8 w-44" />}>
            <BudgetButton />
          </Suspense>
          <ToolDialog
            trigger={
              <>
                <Calculator data-icon="inline-start" />
                Quote calculator
              </>
            }
            title="Quote calculator"
            description="Estimate a buying price from MC. Skips deductions."
          >
            <Suspense fallback={<Skeleton className="h-64" />}>
              <Quote />
            </Suspense>
          </ToolDialog>
          <Suspense fallback={<Skeleton className="h-8 w-32" />}>
            <NewOffer />
          </Suspense>
        </div>
      </header>

      <Suspense fallback={<Skeleton className="h-96" />}>
        <OffersView searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
